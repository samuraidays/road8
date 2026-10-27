import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { buildAuthUrl, OAUTH_COOKIE, OAUTH_COOKIE_MAX_AGE, OAUTH_COOKIE_PATH, randomToken, type OAuthPending } from "@/lib/google";
import { safeReturnTo } from "@/lib/google-return";

// Google カレンダー連携の開始。state（CSRF 対策）と PKCE の verifier を HttpOnly の Cookie に入れて、Google の同意画面へ送る
export async function GET(request: NextRequest) {
  await requireUser();
  const pending: OAuthPending = {
    state: randomToken(),
    verifier: randomToken(),
    returnTo: safeReturnTo(request.nextUrl.searchParams.get("returnTo")),
  };
  (await cookies()).set(OAUTH_COOKIE, JSON.stringify(pending), {
    httpOnly: true,
    // Google から戻るときはトップレベルの GET なので、Lax でも Cookie が送られる
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: OAUTH_COOKIE_PATH,
    maxAge: OAUTH_COOKIE_MAX_AGE,
  });
  return NextResponse.redirect(buildAuthUrl(pending.state, pending.verifier));
}
