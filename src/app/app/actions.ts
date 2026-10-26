"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  // この端末のセッションだけを終了する（既定の global は全端末からログアウトさせる）
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) {
    throw new Error("ログアウトに失敗しました");
  }
  redirect("/login");
}
