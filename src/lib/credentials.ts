// メールアドレスとパスワードの入力チェック。
// パスワードの最小文字数は Supabase Auth の設定（ローカル：supabase/config.toml、本番：ダッシュボード）と必ず合わせる。
// Auth API は公開キーで直接呼べるので、本当の制限は Supabase 側の設定であり、ここは画面での案内のため
export const PASSWORD_MIN_LENGTH = 12;
// bcrypt は72バイトを超える部分を無視するため、それより長いパスワードは受け付けない
const PASSWORD_MAX_BYTES = 72;
const EMAIL_MAX_LENGTH = 254;

export type Credentials = { email: string; password: string };
export type ParseResult = { ok: true; value: Credentials } | { ok: false; error: string };

function read(formData: FormData): Credentials {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  return { email, password };
}

function isEmail(email: string): boolean {
  return email.length <= EMAIL_MAX_LENGTH && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ログイン用。パスワードの条件は伝えない（推測の手がかりを与えない）
export function parseLogin(formData: FormData): ParseResult {
  const value = read(formData);
  if (!isEmail(value.email) || value.password.length === 0) {
    return { ok: false, error: "メールアドレスとパスワードを入力してください" };
  }
  return { ok: true, value };
}

// サインアップ用
export function parseSignup(formData: FormData): ParseResult {
  const value = read(formData);
  if (!isEmail(value.email)) {
    return { ok: false, error: "メールアドレスの形式が正しくありません" };
  }
  if (value.password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, error: `パスワードは${PASSWORD_MIN_LENGTH}文字以上にしてください` };
  }
  if (new TextEncoder().encode(value.password).length > PASSWORD_MAX_BYTES) {
    return { ok: false, error: "パスワードが長すぎます" };
  }
  return { ok: true, value };
}
