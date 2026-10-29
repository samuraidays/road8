import "server-only";
import { weekDatesFrom } from "@/lib/period";
import { createClient } from "@/lib/supabase/server";
import type { TenantContext } from "@/lib/tenants";

export type HabitWeekStat = { title: string; done: number; target: number };
export type MetricWeekStat = { title: string; unit: string; first: number; last: number };

export type WeeklyReview = {
  weekStart: string;
  wentWell: string;
  wentWrong: string;
  nextFocus: string;
  habits: HabitWeekStat[];
  metrics: MetricWeekStat[];
};

type HabitRow = { title: string; times_per_week: number; archived_at: string | null; habit_checks: { done_on: string }[] };
type MetricRow = {
  title: string;
  unit: string;
  kind: "manual" | "metric";
  kr_measurements: { measured_on: string; value: string | number }[];
};

// 週の振り返り：本人の文章（RLS で本人の分だけ）と、その週の習慣の達成・数値の変化（テナントのデータ）
export async function getWeeklyReview({ user, tenant }: TenantContext, weekStart: string): Promise<WeeklyReview> {
  const supabase = await createClient();
  const week = weekDatesFrom(weekStart);
  const [review, habits, metrics] = await Promise.all([
    supabase
      .from("weekly_reviews")
      .select("went_well, went_wrong, next_focus")
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .eq("week_start", weekStart)
      .maybeSingle(),
    supabase
      .from("habits")
      .select("title, times_per_week, archived_at, habit_checks(done_on)")
      .eq("tenant_id", tenant.id)
      .gte("habit_checks.done_on", week[0])
      .lte("habit_checks.done_on", week[6])
      .order("created_at")
      .returns<HabitRow[]>(),
    supabase
      .from("key_results")
      .select("title, unit, kind, kr_measurements(measured_on, value)")
      .eq("tenant_id", tenant.id)
      .eq("kind", "metric")
      .gte("kr_measurements.measured_on", week[0])
      .lte("kr_measurements.measured_on", week[6])
      .order("created_at")
      .returns<MetricRow[]>(),
  ]);
  if (review.error || habits.error || metrics.error) {
    throw new Error("振り返りを取得できませんでした");
  }

  return {
    weekStart,
    wentWell: review.data?.went_well ?? "",
    wentWrong: review.data?.went_wrong ?? "",
    nextFocus: review.data?.next_focus ?? "",
    habits: habits.data
      .filter((h) => h.archived_at === null)
      .map((h) => ({ title: h.title, done: h.habit_checks.length, target: h.times_per_week })),
    metrics: metrics.data
      .filter((kr) => kr.kr_measurements.length > 0)
      .map((kr) => {
        const sorted = [...kr.kr_measurements].sort((a, b) => a.measured_on.localeCompare(b.measured_on));
        return { title: kr.title, unit: kr.unit, first: Number(sorted[0].value), last: Number(sorted[sorted.length - 1].value) };
      }),
  };
}

export type QuarterlyReview = { learned: string; nextSteps: string };

// 四半期の振り返りの文章（本人だけ）
export async function getQuarterlyReview(
  { user, tenant }: TenantContext,
  year: number,
  quarter: number,
): Promise<QuarterlyReview> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quarterly_reviews")
    .select("learned, next_steps")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .eq("year", year)
    .eq("quarter", quarter)
    .maybeSingle();
  if (error) {
    throw new Error("振り返りを取得できませんでした");
  }
  return { learned: data?.learned ?? "", nextSteps: data?.next_steps ?? "" };
}

// 今週のフォーカス：前の週の振り返りに書いた「来週やる3つ」（本人だけ）
export async function getWeeklyFocus({ user, tenant }: TenantContext, lastWeekStart: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("weekly_reviews")
    .select("next_focus")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .eq("week_start", lastWeekStart)
    .maybeSingle();
  if (error) {
    throw new Error("今週のフォーカスを取得できませんでした");
  }
  return data?.next_focus ?? "";
}
