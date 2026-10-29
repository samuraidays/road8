"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { logDbError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { parseTenantName } from "@/lib/tenants";

export type CreateTenantState = { name?: string; error?: string };


export async function signOut() {
  const supabase = await createClient();
  // この端末のセッションだけを終了する（既定の global は全端末からログアウトさせる）
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) {
    throw new Error("ログアウトに失敗しました");
  }
  redirect("/login");
}

export async function createTenant(_prev: CreateTenantState, formData: FormData): Promise<CreateTenantState> {
  const user = await requireUser();

  const parsed = parseTenantName(formData.get("name"));
  if (!parsed.ok) {
    return { name: parsed.name, error: parsed.error };
  }
  const name = parsed.name;

  // ID はサーバーで決めて、作成後の遷移先に使う。
  // 作成結果を RETURNING で受け取らない：Owner の所属は AFTER トリガーで作られるため、
  // RETURNING の時点では SELECT のポリシー（所属していること）を満たさず、作成が失敗する
  const id = crypto.randomUUID();
  const supabase = await createClient();
  const { error } = await supabase.from("tenants").insert({ id, name, created_by: user.id });
  if (error) {
    // 利用者には詳細を返さず、原因の調査用にサーバーのログへ残す（入力値・トークンは含めない）
    logDbError("tenant.create", { userId: user.id }, error);
    return { name, error: "テナントを作成できませんでした。時間をおいて試してください" };
  }

  // ヘッダーのテナント一覧（共通の枠）も描き直す
  revalidatePath("/app", "layout");
  redirect(`/app/${id}`);
}
