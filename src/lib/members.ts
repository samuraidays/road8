import "server-only";
import type { Role } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import type { TenantContext } from "@/lib/tenants";

export type Member = {
  userId: string;
  displayName: string;
  role: Role;
  isMe: boolean;
};

type MemberRow = {
  user_id: string;
  role: Role;
  profiles: { display_name: string } | null;
};

// テナントのメンバー一覧（Owner が先、次に表示名順）。requireTenant() で所属を確かめた結果を受け取る。
// 利用者の JWT で読むので、RLS でも自テナントの所属者だけに絞られる
export async function listMembers({ user, tenant }: TenantContext): Promise<Member[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("user_id, role, profiles!inner(display_name)")
    .eq("tenant_id", tenant.id)
    .returns<MemberRow[]>();
  if (error) {
    throw new Error("メンバーの一覧を取得できませんでした");
  }
  return data
    .map((row) => ({
      userId: row.user_id,
      displayName: row.profiles?.display_name ?? "",
      role: row.role,
      isMe: row.user_id === user.id,
    }))
    .sort((a, b) =>
      a.role === b.role ? a.displayName.localeCompare(b.displayName, "ja") : a.role === "owner" ? -1 : 1,
    );
}
