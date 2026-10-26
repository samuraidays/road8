import "server-only";
import { isIP } from "node:net";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { supabaseConfig } from "@/lib/env";
import { supabaseSecretKey } from "@/lib/env-server";
import { authCookieOptions } from "@/lib/supabase/cookie-options";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

function cookieMethods(cookieStore: CookieStore) {
  return {
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet: { name: string; value: string; options: object }[]) {
      try {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      } catch {
        // Server Component からは Cookie を書けない。セッションの更新は proxy が行う
      }
    },
  };
}

// ログインユーザーの JWT で Supabase に接続する（案A）。RLS が効く
export async function createClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = supabaseConfig();

  return createServerClient(url, publishableKey, {
    cookieOptions: authCookieOptions,
    cookies: cookieMethods(cookieStore),
  });
}

// 利用者の IP。Vercel は x-forwarded-for を自前で設定し直すので、先頭の値を使う。IP として正しくなければ使わない
function clientIp(requestHeaders: Headers): string | undefined {
  const first = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first && isIP(first) ? first : undefined;
}

// ログイン・サインアップ専用のクライアント（設計書 §3-4）。
// サーバーから Auth を呼ぶと Supabase にはサーバーの IP しか見えず、IP ごとのレート制限と Auth のログが利用者を区別できない。
// そこで利用者の IP を Sb-Forwarded-For で渡す。Supabase はこのヘッダーを secret キーのリクエストでしか受け付けない。
// secret キーは RLS をバイパスできるため、このクライアントは Auth の呼び出しにだけ使い、データの読み書きには使わない。
// secret キーが未設定（ローカル開発など）の場合は、IP を渡さずに publishable キーで呼ぶ。
export async function createAuthEndpointClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = supabaseConfig();
  const secretKey = supabaseSecretKey();
  const ip = clientIp(await headers());
  const forward = Boolean(secretKey && ip);

  const client = createServerClient(url, forward ? secretKey! : publishableKey, {
    cookieOptions: authCookieOptions,
    cookies: cookieMethods(cookieStore),
    global: forward ? { headers: { "sb-forwarded-for": ip! } } : undefined,
  });
  return client.auth;
}
