// Supabase のセッション Cookie の属性。
// このアプリはブラウザ側で Supabase を使わない（サーバーだけ）ので、HttpOnly にして JavaScript から読めなくする（XSS でのセッション窃取を防ぐ）
export const authCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;
