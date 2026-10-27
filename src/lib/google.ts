import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { googleOAuthConfig } from "@/lib/env-server";

// Google カレンダー連携（設計書 §6）。ログインとは別に、カレンダー用のスコープだけを追加で同意してもらう。
// スコープ calendar.app.created は、road8 が作ったカレンダーにだけ書ける（利用者の既存の予定には触れない）
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

// 連携の開始から戻りまでの値（state と PKCE の verifier）。HttpOnly の Cookie に入れて、戻りで照合する
export const OAUTH_COOKIE = "road8_google_oauth";
export const OAUTH_COOKIE_PATH = "/app/google";
export const OAUTH_COOKIE_MAX_AGE = 600;

export type OAuthPending = { state: string; verifier: string; returnTo: string };

export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function buildAuthUrl(state: string, verifier: string): string {
  const { clientId, redirectUri } = googleOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: CALENDAR_SCOPE,
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    // リフレッシュトークンを受け取るため。再連携でも必ず受け取れるよう、毎回同意画面を出す
    access_type: "offline",
    prompt: "consent",
  });
  return `${AUTH_URL}?${params}`;
}

export class GoogleAuthError extends Error {}

type TokenResponse = { access_token?: string; refresh_token?: string; scope?: string; error?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const { clientId, clientSecret } = googleOAuthConfig();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...body, client_id: clientId, client_secret: clientSecret }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  // invalid_grant：リフレッシュトークンが失効・取り消し済み（テスト状態の同意画面では7日で失効する）
  if (!res.ok || json.error) {
    throw new GoogleAuthError(json.error ?? `token endpoint ${res.status}`);
  }
  return json;
}

export async function exchangeCode(code: string, verifier: string): Promise<{ refreshToken: string; scopes: string }> {
  const json = await tokenRequest({
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    redirect_uri: googleOAuthConfig().redirectUri,
  });
  if (!json.refresh_token || !json.scope?.split(" ").includes(CALENDAR_SCOPE)) {
    throw new GoogleAuthError("missing refresh token or calendar scope");
  }
  return { refreshToken: json.refresh_token, scopes: json.scope };
}

export async function accessTokenFrom(refreshToken: string): Promise<string> {
  const json = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
  if (!json.access_token) {
    throw new GoogleAuthError("missing access token");
  }
  return json.access_token;
}

// 失敗しても解除は続ける（Google 側で取り消し済みのこともある）
export async function revokeToken(token: string): Promise<void> {
  await fetch(REVOKE_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
    cache: "no-store",
  }).catch(() => undefined);
}

export class CalendarNotFoundError extends Error {}

async function calendarRequest<T>(accessToken: string, path: string, method: string, body: unknown): Promise<T> {
  const res = await fetch(`${CALENDAR_API}${path}`, {
    method,
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  // 404・410：カレンダーか予定が利用者に消された
  if (res.status === 404 || res.status === 410) {
    throw new CalendarNotFoundError(path);
  }
  if (!res.ok) {
    throw new Error(`calendar api ${method} ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function createCalendar(accessToken: string): Promise<string> {
  const calendar = await calendarRequest<{ id: string }>(accessToken, "/calendars", "POST", {
    summary: "road8",
    description: "road8 のタスク",
    timeZone: "Asia/Tokyo",
  });
  return calendar.id;
}

export type CalendarEvent = { summary: string; description: string; start: string; end: string };

function eventBody(event: CalendarEvent) {
  return {
    summary: event.summary,
    description: event.description,
    start: { dateTime: event.start, timeZone: "Asia/Tokyo" },
    end: { dateTime: event.end, timeZone: "Asia/Tokyo" },
  };
}

export async function insertEvent(accessToken: string, calendarId: string, event: CalendarEvent): Promise<string> {
  const created = await calendarRequest<{ id: string }>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    "POST",
    eventBody(event),
  );
  return created.id;
}

export async function updateEvent(accessToken: string, calendarId: string, eventId: string, event: CalendarEvent): Promise<string> {
  const updated = await calendarRequest<{ id: string }>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    "PATCH",
    eventBody(event),
  );
  return updated.id;
}

// 予定を消す。すでに消されていれば何もしない
export async function deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void> {
  const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`calendar api DELETE ${res.status}`);
  }
}
