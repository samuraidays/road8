import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 確認メールのリンクの戻り先。認可コードをセッションに交換する。
// 戻り先は固定にする（next などのパラメーターでリダイレクト先を変えさせない：オープンリダイレクト対策）
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL("/app", request.url));
    }
  }
  return NextResponse.redirect(new URL("/auth/error", request.url));
}
