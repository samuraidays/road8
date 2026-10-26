"use server";

import { parseSignup } from "@/lib/credentials";
import { siteUrl } from "@/lib/env-server";
import { createAuthEndpointClient } from "@/lib/supabase/server";
import type { FormState } from "@/components/auth-form";

// 登録済みのアドレスかどうかは画面で区別しない（アカウントの列挙を防ぐ）
const SENT_MESSAGE =
  "確認メールを送りました。メールのリンクを開くと登録が完了します（すでに登録済みのアドレスには届きません）";

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseSignup(formData);
  if (!parsed.ok) {
    return { email: String(formData.get("email") ?? ""), error: parsed.error };
  }

  const auth = await createAuthEndpointClient();
  const { error } = await auth.signUp({
    ...parsed.value,
    options: { emailRedirectTo: `${siteUrl()}/auth/callback` },
  });

  if (error) {
    switch (error.code) {
      case "weak_password":
        return { email: parsed.value.email, error: "パスワードが弱すぎます。より長く、推測しにくいものにしてください" };
      case "over_email_send_rate_limit":
      case "over_request_rate_limit":
        return { email: parsed.value.email, error: "送信回数が多すぎます。しばらく時間をおいてから試してください" };
      case "user_already_exists":
      case "email_exists":
        return { message: SENT_MESSAGE };
      default:
        return { email: parsed.value.email, error: "登録できませんでした。時間をおいて試してください" };
    }
  }

  return { message: SENT_MESSAGE };
}
