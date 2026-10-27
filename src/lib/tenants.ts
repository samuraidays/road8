import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { requireUser, type CurrentUser } from "@/lib/auth";
import type { Role } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

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

// ヘッダーとページの両方から呼ばれるため、1回のリクエストの中では1度だけ取得する
const listTenantsOf = cache(async (userId: string): Promise<TenantSummary[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("role, tenants!inner(id, name)")
    .eq("user_id", userId)
    .returns<MembershipRow[]>();
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
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("role, tenants!inner(id, name)")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .returns<MembershipRow[]>()
    .maybeSingle();
  if (error) {
    throw new Error("テナントを取得できませんでした");
  }
  const tenant = data ? toSummary(data) : null;
  if (!tenant) {
    notFound();
  }
  return { user, tenant };
});
