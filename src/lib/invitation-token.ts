import "server-only";
import { createHash, randomBytes } from "node:crypto";

// 招待トークン（設計書 §9-2）。本体はリンクにだけ載せ、DB にはハッシュだけを保存する
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isInvitationToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
