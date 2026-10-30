"use server";

import { revalidatePath } from "next/cache";
import { logDbError } from "@/lib/log";
import { parseDate, parseHabit, parseKeyResult, parseMeasurement, parseObjective } from "@/lib/okr-input";
import { currentWeekDates, todayInJapan } from "@/lib/period";
import { createClient } from "@/lib/supabase/server";
import { isUuid, requireTenant } from "@/lib/tenants";

export type OkrFormState = { error?: string };

// tenantId と各 ID は bind でフォームから届くので信用しない。requireTenant() で所属を確かめ、
// 更新・削除は tenant_id でも絞る（RLS と複合外部キーでも止まる）
function failed(action: string, userId: string, tenantId: string, error: { code: string; message: string }): OkrFormState {
  logDbError(action, { userId, tenantId }, error);
  return { error: "保存できませんでした。時間をおいて試してください" };
}

function revalidate(tenantId: string) {
  revalidatePath(`/app/${tenantId}/okr`);
  // ゴールの画面に柱ごとの今期の Objective の数を出しているため
  revalidatePath(`/app/${tenantId}/goals`);
}

const NOT_FOUND = {
  objective: { error: "Objective が見つかりません" },
  keyResult: { error: "Key Result が見つかりません" },
  habit: { error: "習慣が見つかりません" },
} as const;

// ---- Objective ----

export async function createObjective(tenantId: string, _prev: OkrFormState, formData: FormData): Promise<OkrFormState> {
  const { user, tenant } = await requireTenant(tenantId);
  const parsed = parseObjective(formData);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("objectives")
    .insert({ ...parsed.value, tenant_id: tenant.id, created_by: user.id });
  if (error) {
    // 23503：柱か担当者がこのテナントのものではない（複合外部キー）
    if (error.code === "23503") {
      return { error: "柱と担当者は、このテナントのものから選んでください" };
    }
    return failed("objective.create", user.id, tenant.id, error);
  }
  revalidate(tenant.id);
  return {};
}

export async function updateObjective(
  tenantId: string,
  objectiveId: string,
  _prev: OkrFormState,
  formData: FormData,
): Promise<OkrFormState> {
  const { user, tenant } = await requireTenant(tenantId);
  if (!isUuid(objectiveId)) {
    return NOT_FOUND.objective;
  }
  const parsed = parseObjective(formData);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("objectives")
    .update(parsed.value)
    .eq("tenant_id", tenant.id)
    .eq("id", objectiveId)
    .select("id");
  if (error) {
    if (error.code === "23503") {
      return { error: "柱と担当者は、このテナントのものから選んでください" };
    }
    return failed("objective.update", user.id, tenant.id, error);
  }
  if (data.length === 0) {
    return NOT_FOUND.objective;
  }
  revalidate(tenant.id);
  return {};
}

// Objective の削除は Owner だけ（設計書 §8 #2）。Key Result・記録・習慣・タスクも連鎖して消える
export async function deleteObjective(tenantId: string, objectiveId: string): Promise<OkrFormState> {
  const { user, tenant } = await requireTenant(tenantId);
  if (tenant.role !== "owner") {
    return { error: "Objective を削除できるのは Owner だけです" };
  }
  if (!isUuid(objectiveId)) {
    return NOT_FOUND.objective;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("objectives")
    .delete()
    .eq("tenant_id", tenant.id)
    .eq("id", objectiveId)
    .select("id");
  if (error) {
    return failed("objective.delete", user.id, tenant.id, error);
  }
  if (data.length === 0) {
    return NOT_FOUND.objective;
  }
  revalidate(tenant.id);
  return {};
}

// ---- Key Result ----

export async function createKeyResult(
  tenantId: string,
  objectiveId: string,
  _prev: OkrFormState,
  formData: FormData,
): Promise<OkrFormState> {
  const { user, tenant } = await requireTenant(tenantId);
  if (!isUuid(objectiveId)) {
    return NOT_FOUND.objective;
  }
  const parsed = parseKeyResult(formData);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("key_results")
    .insert({ ...parsed.value, tenant_id: tenant.id, objective_id: objectiveId, created_by: user.id });
  if (error) {
    // 23503：親の Objective がこのテナントにない（複合外部キー）
    if (error.code === "23503") {
      return NOT_FOUND.objective;
    }
    return failed("key_result.create", user.id, tenant.id, error);
  }
  revalidate(tenant.id);
  return {};
}

export async function updateKeyResult(
  tenantId: string,
  keyResultId: string,
  _prev: OkrFormState,
  formData: FormData,
): Promise<OkrFormState> {
  const { user, tenant } = await requireTenant(tenantId);
  if (!isUuid(keyResultId)) {
    return NOT_FOUND.keyResult;
  }
  const parsed = parseKeyResult(formData);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("key_results")
    .update(parsed.value)
    .eq("tenant_id", tenant.id)
    .eq("id", keyResultId)
    .select("id");
  if (error) {
    return failed("key_result.update", user.id, tenant.id, error);
  }
  if (data.length === 0) {
    return NOT_FOUND.keyResult;
  }
  revalidate(tenant.id);
  return {};
}

export async function deleteKeyResult(tenantId: string, keyResultId: string): Promise<OkrFormState> {
  const { user, tenant } = await requireTenant(tenantId);
  if (!isUuid(keyResultId)) {
    return NOT_FOUND.keyResult;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("key_results")
    .delete()
    .eq("tenant_id", tenant.id)
    .eq("id", keyResultId)
    .select("id");
  if (error) {
    return failed("key_result.delete", user.id, tenant.id, error);
  }
  if (data.length === 0) {
    return NOT_FOUND.keyResult;
  }
  revalidate(tenant.id);
  return {};
}

// ---- 数値の記録 ----

// 同じ日の記録があれば上書きする（upsert は列単位の UPDATE 権限と合わないため、更新 → なければ追加）
export async function recordMeasurement(
  tenantId: string,
  keyResultId: string,
  _prev: OkrFormState,
  formData: FormData,
): Promise<OkrFormState> {
  const { user, tenant } = await requireTenant(tenantId);
  if (!isUuid(keyResultId)) {
    return NOT_FOUND.keyResult;
  }
  const parsed = parseMeasurement(formData, todayInJapan());
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const supabase = await createClient();
  const update = () =>
    supabase
      .from("kr_measurements")
      .update({ value: parsed.value.value })
      .eq("tenant_id", tenant.id)
      .eq("key_result_id", keyResultId)
      .eq("measured_on", parsed.value.measured_on)
      .select("id");
  const updated = await update();
  if (updated.error) {
    return failed("kr_measurement.write", user.id, tenant.id, updated.error);
  }
  if (updated.data.length === 0) {
    let { error } = await supabase.from("kr_measurements").insert({
      tenant_id: tenant.id,
      key_result_id: keyResultId,
      created_by: user.id,
      ...parsed.value,
    });
    // 23505：同じ日の記録を同時に送った（連打など）。先にできた記録を更新する
    if (error?.code === "23505") {
      ({ error } = await update());
    }
    if (error) {
      if (error.code === "23503") {
        return NOT_FOUND.keyResult;
      }
      return failed("kr_measurement.write", user.id, tenant.id, error);
    }
  }
  revalidate(tenant.id);
  return {};
}

// ---- 習慣 ----

export async function createHabit(
  tenantId: string,
  keyResultId: string,
  _prev: OkrFormState,
  formData: FormData,
): Promise<OkrFormState> {
  const { user, tenant } = await requireTenant(tenantId);
  if (!isUuid(keyResultId)) {
    return NOT_FOUND.keyResult;
  }
  const parsed = parseHabit(formData);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("habits")
    .insert({ ...parsed.value, tenant_id: tenant.id, key_result_id: keyResultId, created_by: user.id });
  if (error) {
    if (error.code === "23503") {
      return NOT_FOUND.keyResult;
    }
    return failed("habit.create", user.id, tenant.id, error);
  }
  revalidate(tenant.id);
  return {};
}

export async function deleteHabit(tenantId: string, habitId: string): Promise<OkrFormState> {
  const { user, tenant } = await requireTenant(tenantId);
  if (!isUuid(habitId)) {
    return NOT_FOUND.habit;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("habits")
    .delete()
    .eq("tenant_id", tenant.id)
    .eq("id", habitId)
    .select("id");
  if (error) {
    return failed("habit.delete", user.id, tenant.id, error);
  }
  if (data.length === 0) {
    return NOT_FOUND.habit;
  }
  revalidate(tenant.id);
  return {};
}

// 習慣の実施を付ける・外す。対象は今週の、今日までの日付だけ
export async function toggleHabitCheck(
  tenantId: string,
  habitId: string,
  date: string,
  done: boolean,
): Promise<OkrFormState> {
  const { user, tenant } = await requireTenant(tenantId);
  if (!isUuid(habitId)) {
    return NOT_FOUND.habit;
  }
  const parsed = parseDate(date);
  const week = currentWeekDates();
  if (!parsed.ok || !week.includes(parsed.value) || parsed.value > todayInJapan()) {
    return { error: "今週の、今日までの日付だけ記録できます" };
  }

  const supabase = await createClient();
  const { error } = done
    ? await supabase
        .from("habit_checks")
        .insert({ tenant_id: tenant.id, habit_id: habitId, done_on: parsed.value, created_by: user.id })
    : await supabase
        .from("habit_checks")
        .delete()
        .eq("tenant_id", tenant.id)
        .eq("habit_id", habitId)
        .eq("done_on", parsed.value);
  // 23505：すでに記録済み（連打など）。結果は同じなので成功として扱う
  if (error && error.code !== "23505") {
    if (error.code === "23503") {
      return NOT_FOUND.habit;
    }
    return failed("habit.check", user.id, tenant.id, error);
  }
  revalidate(tenant.id);
  return {};
}
