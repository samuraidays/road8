import "server-only";

// 確認メールのリンクの戻り先。リクエストの Host ヘッダーは使わない（偽装された Host でリンクを作らせないため）
export function siteUrl(): string {
  const value = process.env.SITE_URL;
  if (!value) {
    throw new Error("環境変数 SITE_URL が設定されていません");
  }
  return value.replace(/\/$/, "");
}
