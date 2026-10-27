"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { siteUrl } from "@/lib/env-server";
import { generateInvitationToken, hashInvitationToken } from "@/lib/invitation-token";
import { logDbError } from "@/lib/log";
import type { Role } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { isUuid, requireTenant } from "@/lib/tenants";
import { codePointLength } from "@/lib/text";

export type InviteState = { link?: string; error?: string };
export type RoleChangeState = { error?: string };
export type DisplayNameState = { displayName?: string; error?: string; message?: string };

// DB の check（char_length(display_name) <= 50）と同じく、コードポイントで数える
const DISPLAY_NAME_MAX = 50;

function parseRole(value: FormDataEntryValue | null): Role | null {
  return value === "owner" || value === "member" ? value : null;
}

// 招待リンクを発行する（Owner だけ。設計書 §9-2）。tenantId はフォームから来るので信用せず、requireTenant() で確かめる
export async function createInvitation(tenantId: string, _prev: InviteState, formData: FormData): Promise<InviteState> {
  const { user, tenant } = await requireTenant(tenantId);
  if (tenant.role !== "owner") {
    return { error: "招待リンクを作れるのは Owner だけです" };
  }
  const role = parseRole(formData.get("role"));
  if (!role) {
    return { error: "ロールを選んでください" };
  }

  const token = generateInvitationToken();
  const supabase = await createClient();
  const { error } = await supabase.from("invitations").insert({
    tenant_id: tenant.id,
    role,
    token_hash: hashInvitationToken(token),
    invited_by: user.id,
  });
  if (error) {
    logDbError("invitation.create", { userId: user.id, tenantId: tenant.id }, error);
    return { error: "招待リンクを作れませんでした。時間をおいて試してください" };
  }

  // トークンはサーバーに届かない URL のフラグメントに置く（設計書 §9-2）。リンクはこの応答で1回だけ返す
  return { link: `${siteUrl()}/invite#${token}` };
}

// メンバーのロールを変える（Owner だけ）。最後の Owner の降格は DB のトリガーが止める
export async function changeRole(tenantId: string, _prev: RoleChangeState, formData: FormData): Promise<RoleChangeState> {
  const { user, tenant } = await requireTenant(tenantId);
  if (tenant.role !== "owner") {
    return { error: "ロールを変えられるのは Owner だけです" };
  }
  const targetUserId = String(formData.get("userId") ?? "");
  const role = parseRole(formData.get("role"));
  if (!isUuid(targetUserId) || !role) {
    return { error: "入力が正しくありません" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .update({ role })
    .eq("tenant_id", tenant.id)
    .eq("user_id", targetUserId)
    .select("user_id");
  if (error) {
    // P0001 は最後の Owner を降格しようとしたとき（protect_last_owner）
    if (error.code === "P0001") {
      return { error: "最後の Owner は降格できません" };
    }
    logDbError("membership.change_role", { userId: user.id, tenantId: tenant.id }, error);
    return { error: "ロールを変えられませんでした。時間をおいて試してください" };
  }
  if (data.length === 0) {
    return { error: "このテナントのメンバーではありません" };
  }

  revalidatePath(`/app/${tenant.id}/members`);
  // 自分のロールを変えた場合は、ヘッダーのテナント一覧のロール表示も変わる
  if (targetUserId === user.id) {
    revalidatePath("/app", "layout");
  }
  return {};
}

// 自分の表示名を変える（profile.update_self）
export async function updateDisplayName(_prev: DisplayNameState, formData: FormData): Promise<DisplayNameState> {
  const user = await requireUser();
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (codePointLength(displayName) > DISPLAY_NAME_MAX) {
    return { displayName, error: `表示名は${DISPLAY_NAME_MAX}文字以内で入力してください` };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ display_name: displayName }).eq("user_id", user.id);
  if (error) {
    logDbError("profile.update_self", { userId: user.id }, error);
    return { displayName, error: "表示名を変えられませんでした。時間をおいて試してください" };
  }

  revalidatePath("/app", "layout");
  return { displayName, message: "表示名を保存しました" };
}
