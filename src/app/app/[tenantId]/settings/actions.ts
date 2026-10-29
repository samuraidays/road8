"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logDbError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/tenants";
import { codePointLength } from "@/lib/text";

export type SettingsFormState = { error?: string; message?: string };

const TENANT_NAME_MAX = 100;

// テナント名の変更（tenant.update。Owner だけ。RLS でも止まる）
export async function renameTenant(tenantId: string, _prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  const { user, tenant } = await requireTenant(tenantId);
  if (tenant.role !== "owner") {
    return { error: "テナント名を変えられるのは Owner だけです" };
  }
  const name = String(formData.get("name") ?? "").trim();
  if (codePointLength(name) < 1 || codePointLength(name) > TENANT_NAME_MAX) {
    return { error: `テナント名は1〜${TENANT_NAME_MAX}文字で入力してください` };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tenants").update({ name }).eq("id", tenant.id);
  if (error) {
    logDbError("tenant.update", { userId: user.id, tenantId: tenant.id }, error);
    return { error: "保存できませんでした。時間をおいて試してください" };
  }
  revalidatePath("/app", "layout");
  return { message: "保存しました" };
}

// テナントの削除（tenant.delete。Owner だけ、設計書 §8 #4）。誤操作を防ぐため、テナント名の入力を求める。
// OKR・タスク・振り返りなど、テナントのデータはすべて連鎖して消える。監査ログは残る（設計書 §5）
export async function deleteTenant(tenantId: string, _prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  const { user, tenant } = await requireTenant(tenantId);
  if (tenant.role !== "owner") {
    return { error: "テナントを削除できるのは Owner だけです" };
  }
  if (String(formData.get("confirmName") ?? "") !== tenant.name) {
    return { error: "確認のため、テナント名を正確に入力してください" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("tenants").delete().eq("id", tenant.id).select("id");
  if (error) {
    logDbError("tenant.delete", { userId: user.id, tenantId: tenant.id }, error);
    return { error: "削除できませんでした。時間をおいて試してください" };
  }
  if (data.length === 0) {
    return { error: "削除できませんでした" };
  }
  revalidatePath("/app", "layout");
  redirect("/app");
}
