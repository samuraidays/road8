import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/env";
import { supabaseSecretKey } from "@/lib/env-server";

// service_role（secret キー）で Supabase に接続する。RLS をバイパスできるため、設計書 §3-4 の箇所専用。
// 汎用のクライアントは外に出さず、用途ごとの関数だけを公開する。
// 操作した利用者の ID を x-road8-actor で渡し、監査ログの操作者にする
function createServiceClient(actorUserId: string) {
  const secretKey = supabaseSecretKey();
  if (!secretKey) {
    throw new Error("SUPABASE_SECRET_KEY が設定されていません");
  }
  return createClient(supabaseConfig().url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-road8-actor": actorUserId } },
  });
}

// 招待の受諾（設計書 §9-3）。成功したらテナントの ID、招待が使えない・所属済みなら null を返す
export async function acceptInvitation(tokenHash: string, userId: string): Promise<string | null> {
  const { data, error } = await createServiceClient(userId).rpc("accept_invitation", {
    p_token_hash: tokenHash,
    p_user_id: userId,
  });
  if (error) {
    // P0001 は accept_invitation が拒否したとき（理由は利用者に区別して見せない）
    if (error.code === "P0001") {
      return null;
    }
    throw new Error("招待の受諾に失敗しました");
  }
  return data as string;
}

// ---- Google カレンダー連携（設計書 §6、§8 #5）。リフレッシュトークンは Vault に置く ----
// どれも本人の user_id でだけ呼ぶ（呼び出し側で requireUser() 済みであること）

export async function saveGoogleConnection(userId: string, refreshToken: string, scopes: string): Promise<void> {
  const { error } = await createServiceClient(userId).rpc("save_google_connection", {
    p_user_id: userId,
    p_refresh_token: refreshToken,
    p_scopes: scopes,
  });
  if (error) {
    throw new Error("Google の連携を保存できませんでした");
  }
}

export async function getGoogleConnection(userId: string): Promise<{ refreshToken: string; calendarId: string | null } | null> {
  const { data, error } = await createServiceClient(userId).rpc("get_google_connection", { p_user_id: userId });
  if (error) {
    throw new Error("Google の連携を読み出せませんでした");
  }
  const row = (data as { refresh_token: string; calendar_id: string | null }[] | null)?.[0];
  return row ? { refreshToken: row.refresh_token, calendarId: row.calendar_id } : null;
}

export async function setGoogleCalendarId(userId: string, calendarId: string): Promise<void> {
  const { error } = await createServiceClient(userId)
    .from("google_connections")
    .update({ calendar_id: calendarId })
    .eq("user_id", userId);
  if (error) {
    throw new Error("カレンダーの ID を保存できませんでした");
  }
}

export async function deleteGoogleConnection(userId: string): Promise<void> {
  const { error } = await createServiceClient(userId).rpc("delete_google_connection", { p_user_id: userId });
  if (error) {
    throw new Error("Google の連携を解除できませんでした");
  }
}
