import "server-only";
import { addDays, todayInJapan } from "@/lib/period";
import { createClient } from "@/lib/supabase/server";
import type { TenantContext } from "@/lib/tenants";

export type TaskStatus = "todo" | "in_progress" | "done";

export type Task = {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  assigneeUserId: string | null;
  calendarEventId: string | null;
};

export type TaskWithContext = Task & { keyResultTitle: string; objectiveTitle: string };

export type TaskRow = {
  id: string;
  title: string;
  status: TaskStatus;
  due_date: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  assignee_user_id: string | null;
  calendar_event_id: string | null;
  updated_at: string;
};

export const TASK_COLUMNS =
  "id, title, status, due_date, scheduled_start, scheduled_end, assignee_user_id, calendar_event_id, updated_at";

export function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    dueDate: row.due_date,
    scheduledStart: row.scheduled_start,
    scheduledEnd: row.scheduled_end,
    assigneeUserId: row.assignee_user_id,
    calendarEventId: row.calendar_event_id,
  };
}

// 並び順：やる日時 → 期日 → どちらもないもの（それぞれ早い順）
export function compareTasks(a: Task, b: Task): number {
  const key = (t: Task) => t.scheduledStart ?? (t.dueDate ? `${t.dueDate}T23:59:59+09:00` : "9999");
  return key(a).localeCompare(key(b));
}

type ListRow = TaskRow & { key_results: { title: string; objectives: { title: string } | null } | null };

// 「タスク」画面：未完了のタスクと、最近（2週間以内）完了したタスク
export async function listTasks({ tenant }: TenantContext): Promise<{ open: TaskWithContext[]; done: TaskWithContext[] }> {
  const supabase = await createClient();
  const since = `${addDays(todayInJapan(), -14)}T00:00:00+09:00`;
  const { data, error } = await supabase
    .from("tasks")
    .select(`${TASK_COLUMNS}, key_results(title, objectives(title))`)
    .eq("tenant_id", tenant.id)
    .or(`status.neq.done,updated_at.gte.${since}`)
    .returns<ListRow[]>();
  if (error) {
    throw new Error("タスクを取得できませんでした");
  }
  const tasks = data.map((row) => ({
    ...toTask(row),
    keyResultTitle: row.key_results?.title ?? "",
    objectiveTitle: row.key_results?.objectives?.title ?? "",
  }));
  return {
    open: tasks.filter((t) => t.status !== "done").sort(compareTasks),
    done: tasks.filter((t) => t.status === "done").sort(compareTasks),
  };
}

export type GoogleStatus = { connected: boolean; connectedAt: string | null };

// 本人の Google カレンダー連携の状態（RLS で本人の行だけ。トークンの参照 ID は列単位の grant で読めない）
export async function getGoogleStatus(userId: string): Promise<GoogleStatus> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("google_connections")
    .select("connected_at, revoked_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new Error("Google の連携状態を取得できませんでした");
  }
  return { connected: data !== null && data.revoked_at === null, connectedAt: data?.connected_at ?? null };
}
