import "server-only";

// 連携の後に戻るページ。オープンリダイレクトにならないよう、テナントのタスクと OKR の画面だけを許す
const RETURN_PATTERN = /^\/app\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(tasks|okr)$/i;

export function safeReturnTo(value: string | null | undefined): string {
  return value && RETURN_PATTERN.test(value) ? value : "/app";
}
