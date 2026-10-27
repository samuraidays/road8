import "server-only";
import { required } from "@/lib/env";

// 確認メールのリンクの戻り先。リクエストの Host ヘッダーは使わない（偽装された Host でリンクを作らせないため）
export function siteUrl(): string {
  return required("SITE_URL", process.env.SITE_URL).replace(/\/$/, "");
}

// Supabase の secret キー（service_role 相当。RLS をバイパスできる）。
// 用途は設計書 §3-4 の一覧に限る。未設定なら undefined を返し、呼び出し側で扱いを決める
export function supabaseSecretKey(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY || undefined;
}

// Google の OAuth クライアント（カレンダー連携。設計書 §6）。シークレットはサーバーだけで使う
export function googleOAuthConfig(): { clientId: string; clientSecret: string; redirectUri: string } {
  return {
    clientId: required("GOOGLE_CLIENT_ID", process.env.GOOGLE_CLIENT_ID),
    clientSecret: required("GOOGLE_CLIENT_SECRET", process.env.GOOGLE_CLIENT_SECRET),
    redirectUri: `${siteUrl()}/app/google/callback`,
  };
}
