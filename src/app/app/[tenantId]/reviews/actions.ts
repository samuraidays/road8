"use server";

import { revalidatePath } from "next/cache";
import { logDbError } from "@/lib/log";
import { listObjectives } from "@/lib/okr";
import { parseDate, parseYearQuarter, text } from "@/lib/okr-input";
import { currentWeekDates, mondayOf, nextQuarter } from "@/lib/period";
import { createClient } from "@/lib/supabase/server";
import { isUuid, requireTenant, type TenantContext } from "@/lib/tenants";
import { codePointLength } from "@/lib/text";

export type ReviewFormState = { error?: string; message?: string };

const TEXT_MAX = 2000;
const SCORE_PATTERN = /^(0(\.\d)?|1(\.0)?)$/;
const NEXT_ACTIONS = ["continue", "stop", "change"] as const;
// 1回の採点で受け付ける KR の数の上限（大量の入力で DB を叩かせない）
const SCORE_ITEMS_MAX = 200;

function failed(action: string, { user, tenant }: TenantContext, error: { code: string; message: string }): ReviewFormState {
  logDbError(action, { userId: user.id, tenantId: tenant.id }, error);
  return { error: "保存できませんでした。時間をおいて試してください" };
}

function readTexts(formData: FormData, names: string[]): Record<string, string> | { error: string } {
  const values: Record<string, string> = {};
  for (const name of names) {
    const value = text(formData, name);
    if (codePointLength(value) > TEXT_MAX) {
      return { error: `${TEXT_MAX}文字以内で入力してください` };
    }
    values[name] = value;
  }
  return values;
}

// ---- 週の振り返り（本人だけ）----

export async function saveWeeklyReview(
  tenantId: string,
  weekStart: string,
  _prev: ReviewFormState,
  formData: FormData,
): Promise<ReviewFormState> {
  const context = await requireTenant(tenantId);
  const { user, tenant } = context;
  // 週の初め（月曜日）で、今週より先ではないこと
  const date = parseDate(weekStart);
  if (!date.ok || mondayOf(date.value) !== date.value || date.value > currentWeekDates()[0]) {
    return { error: "週が正しくありません" };
  }
  const texts = readTexts(formData, ["wentWell", "wentWrong", "nextFocus"]);
  if ("error" in texts) {
    return { error: texts.error };
  }
  const body = { went_well: texts.wentWell, went_wrong: texts.wentWrong, next_focus: texts.nextFocus };

  // 1人1週に1行。あれば更新、なければ作る（upsert は列単位の UPDATE 権限と合わないため）
  const supabase = await createClient();
  const update = () =>
    supabase
      .from("weekly_reviews")
      .update(body)
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .eq("week_start", date.value)
      .select("id");
  const updated = await update();
  if (updated.error) {
    return failed("weekly_review.write", context, updated.error);
  }
  if (updated.data.length === 0) {
    let { error } = await supabase
      .from("weekly_reviews")
      .insert({ ...body, tenant_id: tenant.id, user_id: user.id, week_start: date.value });
    // 23505：同時に送った保存（連打など）が先に作った。そちらを更新する
    if (error?.code === "23505") {
      ({ error } = await update());
    }
    if (error) {
      return failed("weekly_review.write", context, error);
    }
  }
  revalidatePath(`/app/${tenant.id}/reviews/weekly`);
  return { message: "保存しました" };
}

// ---- 四半期の振り返り ----

// 文章（本人だけ）
export async function saveQuarterlyReview(
  tenantId: string,
  year: number,
  quarter: number,
  _prev: ReviewFormState,
  formData: FormData,
): Promise<ReviewFormState> {
  const context = await requireTenant(tenantId);
  const { user, tenant } = context;
  const period = parseYearQuarter(String(year), String(quarter));
  if (!period.ok) {
    return { error: period.error };
  }
  const texts = readTexts(formData, ["learned", "nextSteps"]);
  if ("error" in texts) {
    return { error: texts.error };
  }
  const body = { learned: texts.learned, next_steps: texts.nextSteps };

  const supabase = await createClient();
  const update = () =>
    supabase
      .from("quarterly_reviews")
      .update(body)
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .eq("year", period.value.year)
      .eq("quarter", period.value.quarter)
      .select("id");
  const updated = await update();
  if (updated.error) {
    return failed("quarterly_review.write", context, updated.error);
  }
  if (updated.data.length === 0) {
    let { error } = await supabase
      .from("quarterly_reviews")
      .insert({ ...body, ...period.value, tenant_id: tenant.id, user_id: user.id });
    if (error?.code === "23505") {
      ({ error } = await update());
    }
    if (error) {
      return failed("quarterly_review.write", context, error);
    }
  }
  revalidatePath(`/app/${tenant.id}/reviews/quarterly`);
  return { message: "保存しました" };
}

// KR の採点と次の扱い（メンバーに見える）。フォームの score:<KR の ID>・next:<KR の ID> を読む
export async function saveScores(tenantId: string, _prev: ReviewFormState, formData: FormData): Promise<ReviewFormState> {
  const context = await requireTenant(tenantId);
  const { tenant } = context;

  const items = new Map<string, { score: number | null; next_action: (typeof NEXT_ACTIONS)[number] | null }>();
  for (const [key, raw] of formData.entries()) {
    const [field, id] = key.split(":");
    if ((field !== "score" && field !== "next") || typeof raw !== "string") {
      continue;
    }
    if (!isUuid(id)) {
      return { error: "Key Result が正しくありません" };
    }
    const item = items.get(id) ?? { score: null, next_action: null };
    if (field === "score") {
      if (raw !== "" && !SCORE_PATTERN.test(raw)) {
        return { error: "採点は 0.0〜1.0 で選んでください" };
      }
      item.score = raw === "" ? null : Number(raw);
    } else {
      const action = NEXT_ACTIONS.find((a) => a === raw);
      if (raw !== "" && !action) {
        return { error: "次の扱いが正しくありません" };
      }
      item.next_action = action ?? null;
    }
    items.set(id, item);
  }
  if (items.size > SCORE_ITEMS_MAX) {
    return { error: "一度に採点できる Key Result が多すぎます" };
  }

  const supabase = await createClient();
  for (const [id, values] of items) {
    const { error } = await supabase.from("key_results").update(values).eq("tenant_id", tenant.id).eq("id", id);
    if (error) {
      return failed("key_result.score", context, error);
    }
  }
  revalidatePath(`/app/${tenant.id}/reviews/quarterly`);
  revalidatePath(`/app/${tenant.id}/okr`);
  return { message: "採点を保存しました" };
}

// 数値型は、最新の記録を次の四半期の開始値にする。目標に届いていて同じ値になる場合は、元の開始値のまま（開始値と目標値は違う値が必要）
function carriedStart(latest: number | undefined, start: number | null, target: number | null): number | null {
  return latest !== undefined && latest !== target ? latest : start;
}

// 「続ける」「変える」にした KR を、次の四半期の OKR の下書きとして作る。
// 次の四半期に同じ題名の Objective があれば作らない（2回押しても重ならないように）
export async function carryOver(tenantId: string, year: number, quarter: number): Promise<ReviewFormState> {
  const context = await requireTenant(tenantId);
  const { user, tenant } = context;
  const period = parseYearQuarter(String(year), String(quarter));
  if (!period.ok) {
    return { error: period.error };
  }
  const next = nextQuarter(period.value);

  const [current, existing] = await Promise.all([
    listObjectives(context, period.value.year, period.value.quarter),
    listObjectives(context, next.year, next.quarter),
  ]);
  const existingTitles = new Set(existing.map((o) => o.title));
  const supabase = await createClient();
  let created = 0;

  for (const o of current) {
    const keyResults = o.keyResults.filter((kr) => kr.nextAction === "continue" || kr.nextAction === "change");
    if (keyResults.length === 0 || existingTitles.has(o.title)) {
      continue;
    }
    const objectiveId = crypto.randomUUID();
    const inserted = await supabase.from("objectives").insert({
      id: objectiveId,
      tenant_id: tenant.id,
      title: o.title,
      description: o.description,
      pillar_id: o.pillarId,
      owner_user_id: o.ownerUserId,
      ...next,
      created_by: user.id,
    });
    if (inserted.error) {
      return failed("objective.carry_over", context, inserted.error);
    }
    // 習慣も引き継ぐため、KR の ID はここで決める
    const carried = keyResults.map((kr) => ({ source: kr, id: crypto.randomUUID() }));
    const krs = await supabase.from("key_results").insert(
      carried.map(({ source: kr, id }) => ({
        id,
        tenant_id: tenant.id,
        objective_id: objectiveId,
        title: kr.title,
        kind: kr.kind,
        progress: 0,
        start_value: kr.kind === "metric" ? carriedStart(kr.measurements.at(-1)?.value, kr.startValue, kr.targetValue) : null,
        target_value: kr.kind === "metric" ? kr.targetValue : null,
        unit: kr.unit,
        created_by: user.id,
      })),
    );
    const habits = carried.flatMap(({ source, id }) =>
      source.habits.map((h) => ({
        tenant_id: tenant.id,
        key_result_id: id,
        title: h.title,
        times_per_week: h.timesPerWeek,
        created_by: user.id,
      })),
    );
    const habitsInserted = krs.error || habits.length === 0 ? { error: null } : await supabase.from("habits").insert(habits);
    const error = krs.error ?? habitsInserted.error;
    if (error) {
      // 途中で失敗したら、作りかけの Objective を消す（KR・習慣も連鎖して消える）。残すと次の実行で題名が重なり、引き継げなくなる
      await supabase.from("objectives").delete().eq("tenant_id", tenant.id).eq("id", objectiveId);
      return failed("objective.carry_over", context, error);
    }
    created += 1;
  }

  revalidatePath(`/app/${tenant.id}/okr`);
  revalidatePath(`/app/${tenant.id}/reviews/quarterly`);
  return created === 0
    ? { message: "引き継ぐ Objective はありませんでした（「続ける」「変える」の KR がないか、すでに引き継ぎ済み）" }
    : { message: `${next.year}年 Q${next.quarter} に ${created} 件の Objective を下書きしました` };
}
