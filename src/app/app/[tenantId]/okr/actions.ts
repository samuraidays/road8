"use server";

import { revalidatePath } from "next/cache";
import { parseKeyResult, parseObjective } from "@/lib/okr-input";
import { createClient } from "@/lib/supabase/server";
import { isUuid, requireTenant } from "@/lib/tenants";

export type OkrFormState = { error?: string };

// tenantId と各 ID は bind でフォームから届くので信用しない。requireTenant() で所属を確かめ、
// 更新・削除は tenant_id でも絞る（RLS と複合外部キーでも止まる）
type DbError = { code: string; message: string };

function failed(action: string, userId: string, tenantId: string, error: DbError): OkrFormState {
  console.error(`${action} failed`, { userId, tenantId, code: error.code, message: error.message });
  return { error: "保存できませんでした。時間をおいて試してください" };
}

function revalidate(tenantId: string) {
  revalidatePath(`/app/${tenantId}/okr`);
}

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
    // 23503：担当者がこのテナントのメンバーではない（複合外部キー）
    if (error.code === "23503") {
      return { error: "担当者はこのテナントのメンバーから選んでください" };
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
    return { error: "Objective が見つかりません" };
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
      return { error: "担当者はこのテナントのメンバーから選んでください" };
    }
    return failed("objective.update", user.id, tenant.id, error);
  }
  if (data.length === 0) {
    return { error: "Objective が見つかりません" };
  }
  revalidate(tenant.id);
  return {};
}

// Objective の削除は Owner だけ（設計書 §8 #2）。Key Result とタスクも連鎖して消える
export async function deleteObjective(tenantId: string, objectiveId: string): Promise<OkrFormState> {
  const { user, tenant } = await requireTenant(tenantId);
  if (tenant.role !== "owner") {
    return { error: "Objective を削除できるのは Owner だけです" };
  }
  if (!isUuid(objectiveId)) {
    return { error: "Objective が見つかりません" };
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
    return { error: "Objective が見つかりません" };
  }
  revalidate(tenant.id);
  return {};
}

export async function createKeyResult(
  tenantId: string,
  objectiveId: string,
  _prev: OkrFormState,
  formData: FormData,
): Promise<OkrFormState> {
  const { user, tenant } = await requireTenant(tenantId);
  if (!isUuid(objectiveId)) {
    return { error: "Objective が見つかりません" };
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
      return { error: "Objective が見つかりません" };
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
    return { error: "Key Result が見つかりません" };
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
    return { error: "Key Result が見つかりません" };
  }
  revalidate(tenant.id);
  return {};
}

export async function deleteKeyResult(tenantId: string, keyResultId: string): Promise<OkrFormState> {
  const { user, tenant } = await requireTenant(tenantId);
  if (!isUuid(keyResultId)) {
    return { error: "Key Result が見つかりません" };
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
    return { error: "Key Result が見つかりません" };
  }
  revalidate(tenant.id);
  return {};
}
