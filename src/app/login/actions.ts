"use server";

import { redirect } from "next/navigation";
import { parseLogin } from "@/lib/credentials";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/components/auth-form";

function loginErrorMessage(code: string | undefined): string {
  switch (code) {
    // アカウントの有無を区別しない
    case "invalid_credentials":
      return "メールアドレスかパスワードが違います";
    case "email_not_confirmed":
      return "メールアドレスの確認が済んでいません。届いたメールのリンクを開いてください";
    case "over_request_rate_limit":
      return "試行回数が多すぎます。しばらく時間をおいてから試してください";
    default:
      return "ログインできませんでした。時間をおいて試してください";
  }
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseLogin(formData);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.value);
  if (error) {
    return { error: loginErrorMessage(error.code) };
  }

  redirect("/app");
}
