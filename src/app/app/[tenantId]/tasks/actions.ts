"use server";

import { revalidatePath } from "next/cache";
import { logDbError } from "@/lib/log";
import { parseTask } from "@/lib/okr-input";
import { createClient } from "@/lib/supabase/server";
import type { TaskStatus } from "@/lib/tasks";
import { isUuid, requireTenant, type TenantContext } from "@/lib/tenants";

export type TaskFormState = { error?: string };

const STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];
const NOT_FOUND = { error: "タスクが見つかりません" };

// tenantId と各 ID は bind でフォームから届くので信用しない。requireTenant() で所属を確かめ、
// 更新・削除は tenant_id でも絞る（RLS と複合外部キーでも止まる）
function failed(action: string, { user, tenant }: TenantContext, error: { code: string; message: string }): TaskFormState {
  logDbError(action, { userId: user.id, tenantId: tenant.id }, error);
  return { error: "保存できませんでした。時間をおいて試してください" };
}

function revalidate(tenantId: string) {
  revalidatePath(`/app/${tenantId}/tasks`);
  revalidatePath(`/app/${tenantId}/okr`);
}

export async function createTask(
  tenantId: string,
  keyResultId: string,
  _prev: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const context = await requireTenant(tenantId);
  if (!isUuid(keyResultId)) {
    return { error: "Key Result が見つかりません" };
  }
  const parsed = parseTask(formData);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({
    ...parsed.value,
    tenant_id: context.tenant.id,
    key_result_id: keyResultId,
    created_by: context.user.id,
  });
  if (error) {
    // 23503：KR か担当者がこのテナントのものではない（複合外部キー）
    if (error.code === "23503") {
      return { error: "Key Result と担当者は、このテナントのものから選んでください" };
    }
    return failed("task.create", context, error);
  }
  revalidate(context.tenant.id);
  return {};
}

export async function updateTask(
  tenantId: string,
  taskId: string,
  _prev: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const context = await requireTenant(tenantId);
  if (!isUuid(taskId)) {
    return NOT_FOUND;
  }
  const parsed = parseTask(formData);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update(parsed.value)
    .eq("tenant_id", context.tenant.id)
    .eq("id", taskId)
    .select("id");
  if (error) {
    if (error.code === "23503") {
      return { error: "担当者は、このテナントのメンバーから選んでください" };
    }
    return failed("task.update", context, error);
  }
  if (data.length === 0) {
    return NOT_FOUND;
  }
  revalidate(context.tenant.id);
  return {};
}

export async function setTaskStatus(tenantId: string, taskId: string, status: TaskStatus): Promise<TaskFormState> {
  const context = await requireTenant(tenantId);
  if (!isUuid(taskId) || !STATUSES.includes(status)) {
    return NOT_FOUND;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({ status })
    .eq("tenant_id", context.tenant.id)
    .eq("id", taskId)
    .select("id");
  if (error) {
    return failed("task.update", context, error);
  }
  if (data.length === 0) {
    return NOT_FOUND;
  }
  revalidate(context.tenant.id);
  return {};
}

export async function deleteTask(tenantId: string, taskId: string): Promise<TaskFormState> {
  const context = await requireTenant(tenantId);
  if (!isUuid(taskId)) {
    return NOT_FOUND;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .delete()
    .eq("tenant_id", context.tenant.id)
    .eq("id", taskId)
    .select("id");
  if (error) {
    return failed("task.delete", context, error);
  }
  if (data.length === 0) {
    return NOT_FOUND;
  }
  revalidate(context.tenant.id);
  return {};
}
