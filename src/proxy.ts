import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfig } from "@/lib/env";
import { authCookieOptions } from "@/lib/supabase/cookie-options";

// セッションの Cookie を更新するだけ。認可はここで行わない（各 Server Action・ページで requireUser() を呼ぶ）
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, publishableKey } = supabaseConfig();

  const supabase = createServerClient(
    url,
    publishableKey,
    {
      cookieOptions: authCookieOptions,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // 期限が近いトークンをここで更新する
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  // セッションを使うのはログイン後のページ（/app 配下）、招待の受け取り（/invite）と、そこでの Server Action だけ。公開ページでは Auth を呼ばない
  matcher: ["/app/:path*", "/invite"],
};
