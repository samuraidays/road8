import "server-only";

type DbError = { code: string; message: string };

// DB 操作の失敗をサーバーのログに残す。利用者には詳細を返さないので、調査はこのログで行う。
// 項目をそろえておく（後続フェーズで SIEM に取り込むため）。入力値・トークンは渡さない
export function logDbError(
  action: string,
  context: { userId: string; tenantId?: string },
  error: DbError,
): void {
  console.error(`${action} failed`, {
    action,
    userId: context.userId,
    tenantId: context.tenantId ?? null,
    code: error.code,
    message: error.message,
  });
}
