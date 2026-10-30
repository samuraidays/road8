import "server-only";
import { currentWeekDates } from "@/lib/period";
import { createClient } from "@/lib/supabase/server";
import { compareTasks, TASK_COLUMNS, toTask, type Task, type TaskRow } from "@/lib/tasks";
import type { TenantContext } from "@/lib/tenants";

export type Measurement = { measuredOn: string; value: number };

export type Habit = {
  id: string;
  title: string;
  timesPerWeek: number;
  // 今週（月〜日）の各日に実施したか
  week: { date: string; done: boolean }[];
};

export type KeyResult = {
  id: string;
  title: string;
  kind: "manual" | "metric";
  // 0〜100。数値型は最新の記録から、それ以外はひもづくタスクの完了率から計算する
  progress: number;
  startValue: number | null;
  targetValue: number | null;
  unit: string;
  measurements: Measurement[];
  habits: Habit[];
  tasks: Task[];
  score: number | null;
  nextAction: NextAction | null;
};

export type NextAction = "continue" | "stop" | "change";

export type Objective = {
  id: string;
  title: string;
  description: string;
  pillarId: string | null;
  ownerUserId: string | null;
  year: number;
  quarter: number;
  keyResults: KeyResult[];
};

type KeyResultRow = {
  id: string;
  title: string;
  kind: "manual" | "metric";
  progress: number;
  start_value: string | number | null;
  target_value: string | number | null;
  unit: string;
  score: string | number | null;
  next_action: NextAction | null;
  created_at: string;
  kr_measurements: { measured_on: string; value: string | number }[];
  habits: { id: string; title: string; times_per_week: number; archived_at: string | null; created_at: string; habit_checks: { done_on: string }[] }[];
  tasks: TaskRow[];
};

type ObjectiveRow = {
  id: string;
  title: string;
  description: string;
  pillar_id: string | null;
  owner_user_id: string | null;
  year: number;
  quarter: number;
  key_results: KeyResultRow[];
};

// numeric 型は文字列で返ってくることがあるので数値に直す
function toNumber(value: string | number | null): number | null {
  return value === null ? null : Number(value);
}

// 数値型の進捗：開始値から目標値までのうち、最新の記録がどこまで来たか（0〜100 に収める）
export function metricProgress(start: number, target: number, latest: number | undefined): number {
  if (latest === undefined || start === target) {
    return 0;
  }
  const ratio = (latest - start) / (target - start);
  return Math.round(Math.min(1, Math.max(0, ratio)) * 100);
}

// タスク型の進捗：KR にひもづくタスクのうち、完了したものの割合（タスクがなければ 0）
export function taskProgress(tasks: Task[]): number {
  return tasks.length === 0 ? 0 : Math.round((tasks.filter((t) => t.status === "done").length / tasks.length) * 100);
}

function toKeyResult(row: KeyResultRow, weekDates: string[]): KeyResult {
  const measurements = [...row.kr_measurements]
    .sort((a, b) => a.measured_on.localeCompare(b.measured_on))
    .map((m) => ({ measuredOn: m.measured_on, value: Number(m.value) }));
  const startValue = toNumber(row.start_value);
  const targetValue = toNumber(row.target_value);
  const tasks = row.tasks.map(toTask).sort(compareTasks);
  // kind が manual の KR（以前の「％で手入力」を含む）は、保存した％ではなくタスクの完了率を進捗にする
  const progress =
    row.kind === "metric" && startValue !== null && targetValue !== null
      ? metricProgress(startValue, targetValue, measurements.at(-1)?.value)
      : taskProgress(tasks);
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    progress,
    startValue,
    targetValue,
    unit: row.unit,
    score: toNumber(row.score),
    nextAction: row.next_action,
    measurements,
    tasks,
    habits: [...row.habits]
      .filter((h) => h.archived_at === null)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((h) => {
        const done = new Set(h.habit_checks.map((c) => c.done_on));
        return {
          id: h.id,
          title: h.title,
          timesPerWeek: h.times_per_week,
          week: weekDates.map((date) => ({ date, done: done.has(date) })),
        };
      }),
  };
}

// 指定した四半期の Objective と、その Key Result・数値の記録・習慣（今週の実施）。
// requireTenant() で所属を確かめた結果を受け取る。利用者の JWT で読むので RLS でも絞られる
export async function listObjectives(
  { tenant }: TenantContext,
  year: number,
  quarter: number,
): Promise<Objective[]> {
  const supabase = await createClient();
  const weekDates = currentWeekDates();
  const objectives = await supabase
    .from("objectives")
    .select(
      "id, title, description, pillar_id, owner_user_id, year, quarter, " +
        "key_results(id, title, kind, progress, start_value, target_value, unit, score, next_action, created_at, " +
        "kr_measurements(measured_on, value), " +
        "habits(id, title, times_per_week, archived_at, created_at, habit_checks(done_on)), " +
        `tasks(${TASK_COLUMNS}))`,
    )
    .eq("tenant_id", tenant.id)
    .eq("year", year)
    .eq("quarter", quarter)
    .gte("key_results.habits.habit_checks.done_on", weekDates[0])
    .lte("key_results.habits.habit_checks.done_on", weekDates[6])
    .order("created_at", { ascending: true })
    .returns<ObjectiveRow[]>();
  if (objectives.error) {
    throw new Error("OKR を取得できませんでした");
  }

  return objectives.data.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    pillarId: row.pillar_id,
    ownerUserId: row.owner_user_id,
    year: row.year,
    quarter: row.quarter,
    keyResults: [...row.key_results]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((kr) => toKeyResult(kr, weekDates)),
  }));
}

export type QuarterSummary = { count: number; score: number | null };

// 年の中の四半期ごとの Objective の数と、採点した KR の平均（四半期の切り替えに出す）
export async function summarizeQuarters({ tenant }: TenantContext, year: number): Promise<QuarterSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("objectives")
    .select("quarter, key_results(score)")
    .eq("tenant_id", tenant.id)
    .eq("year", year)
    .returns<{ quarter: number; key_results: { score: string | number | null }[] }[]>();
  if (error) {
    throw new Error("OKR を取得できませんでした");
  }
  return [1, 2, 3, 4].map((q) => {
    const objectives = data.filter((o) => o.quarter === q);
    const scores = objectives
      .flatMap((o) => o.key_results.map((kr) => toNumber(kr.score)))
      .filter((s): s is number => s !== null);
    return {
      count: objectives.length,
      score: scores.length === 0 ? null : Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
    };
  });
}
