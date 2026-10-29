import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { timed } from "@/lib/perf";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string;
};

// 現在のユーザー。Cookie の中身を信用せず、getUser() で Auth サーバーに問い合わせて確かめる。
// ヘッダーとページの両方から呼ばれるため、1回のリクエストの中では1度だけ問い合わせる（React の cache はリクエストをまたがない）
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // 必ずリクエスト時に確かめる（事前レンダリングやキャッシュの対象にしない）
  await connection();
  const supabase = await createClient();
  const { data, error } = await timed("getUser", () => supabase.auth.getUser());
  if (error || !data.user) {
    return null;
  }
  return { id: data.user.id, email: data.user.email ?? "" };
});

// ログインが必要な処理の入口。Server Action・Route Handler・ページのそれぞれで呼ぶ（proxy に任せない）
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
