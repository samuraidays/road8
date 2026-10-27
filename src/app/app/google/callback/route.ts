import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { siteUrl } from "@/lib/env-server";
import { exchangeCode, OAUTH_COOKIE, OAUTH_COOKIE_PATH, sameToken, type OAuthPending } from "@/lib/google";
import { safeReturnTo } from "@/lib/google-return";
import { saveGoogleConnection } from "@/lib/supabase/service";

function readPending(value: string | undefined): OAuthPending | null {
  try {
    const parsed = JSON.parse(value ?? "") as Partial<OAuthPending>;
    return typeof parsed.state === "string" && typeof parsed.verifier === "string"
      ? { state: parsed.state, verifier: parsed.verifier, returnTo: safeReturnTo(parsed.returnTo) }
      : null;
  } catch {
    return null;
  }
}

// Google の同意画面からの戻り。state を照合し、PKCE の verifier を付けてコードをトークンに換える。
// リフレッシュトークンは Vault に保存する（service_role。設計書 §3-4）
export async function GET(request: NextRequest) {
  const user = await requireUser();
  const cookieStore = await cookies();
  const pending = readPending(cookieStore.get(OAUTH_COOKIE)?.value);
  // 1回限り。結果にかかわらず消す
  cookieStore.set(OAUTH_COOKIE, "", { path: OAUTH_COOKIE_PATH, maxAge: 0 });

  const params = request.nextUrl.searchParams;
  const state = params.get("state") ?? "";
  const code = params.get("code");
  const back = (result: "connected" | "error") =>
    NextResponse.redirect(`${siteUrl()}${pending?.returnTo ?? "/app"}?google=${result}`);

  if (!pending || !code || !sameToken(state, pending.state)) {
    return back("error");
  }
  try {
    const { refreshToken, scopes } = await exchangeCode(code, pending.verifier);
    await saveGoogleConnection(user.id, refreshToken, scopes);
  } catch (error) {
    // トークンやコードはログに出さない
    console.error("google.connect failed", { userId: user.id, reason: error instanceof Error ? error.message : "unknown" });
    return back("error");
  }
  return back("connected");
}
