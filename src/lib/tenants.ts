import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { requireUser, type CurrentUser } from "@/lib/auth";
import type { Role } from "@/lib/roles";
import { timed } from "@/lib/perf";
import { createClient } from "@/lib/supabase/server";
import { codePointLength } from "@/lib/text";

export type TenantSummary = {
  id: string;
  name: string;
  role: Role;
};

export type TenantContext = {
  user: CurrentUser;
  tenant: TenantSummary;
};

type MembershipRow = {
  role: Role;
  tenants: { id: string; name: string } | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function toSummary(row: MembershipRow): TenantSummary | null {
  return row.tenants ? { id: row.tenants.id, name: row.tenants.name, role: row.role } : null;
}

// 自分が所属するテナントの一覧（名前順）。RLS で同じテナントの所属は見えるため、自分の行に絞る
export async function listMyTenants(user: CurrentUser): Promise<TenantSummary[]> {
  return listTenantsOf(user.id);
}

// ヘッダー・メニュー・ページ（requireTenant）から呼ばれるため、1回のリクエストの中では1度だけ取得する
const listTenantsOf = cache(async (userId: string): Promise<TenantSummary[]> => {
  const supabase = await createClient();
  const { data, error } = await timed("memberships", async () =>
    supabase.from("memberships").select("role, tenants!inner(id, name)").eq("user_id", userId).returns<MembershipRow[]>(),
  );
  if (error) {
    throw new Error("テナントの一覧を取得できませんでした");
  }
  return data
    .map(toSummary)
    .filter((t): t is TenantSummary => t !== null)
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
});

// テナント配下のページ・Server Action の入口。URL やフォームのテナント ID を信用せず、所属を DB で確かめる。
// 存在しないテナントと所属していないテナントを区別しない（どちらも 404）
export const requireTenant = cache(async (tenantId: string): Promise<TenantContext> => {
  if (!isUuid(tenantId)) {
    notFound();
  }
  const user = await requireUser();
  // 自分の所属の一覧（ヘッダーと共有）から探す。問い合わせを1回にまとめるため。
  // 一覧は利用者の JWT で、自分の行（user_id = 本人）だけを読んでいる
  const tenant = (await listTenantsOf(user.id)).find((t) => t.id === tenantId.toLowerCase());
  if (!tenant) {
    notFound();
  }
  return { user, tenant };
});

// テナント名の決まり（作成と変更で共通）。DB の check（char_length between 1 and 100）と同じく、コードポイントで数える
const TENANT_NAME_MAX = 100;

export function parseTenantName(value: FormDataEntryValue | null): { ok: true; name: string } | { ok: false; name: string; error: string } {
  const name = String(value ?? "").trim();
  const length = codePointLength(name);
  if (length < 1 || length > TENANT_NAME_MAX) {
    return { ok: false, name, error: `テナント名は1〜${TENANT_NAME_MAX}文字で入力してください` };
  }
  return { ok: true, name };
}
