import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { TenantContext } from "@/lib/tenants";

export type KeyResult = {
  id: string;
  title: string;
  progress: number;
};

export type Objective = {
  id: string;
  title: string;
  description: string;
  periodStart: string | null;
  periodEnd: string | null;
  ownerUserId: string | null;
  keyResults: KeyResult[];
};

type ObjectiveRow = {
  id: string;
  title: string;
  description: string;
  period_start: string | null;
  period_end: string | null;
  owner_user_id: string | null;
  key_results: { id: string; title: string; progress: number; created_at: string }[];
};

// テナントの Objective と Key Result（作成順）。requireTenant() で所属を確かめた結果を受け取る。
// 利用者の JWT で読むので、RLS でも自テナントの行だけに絞られる
export async function listObjectives({ tenant }: TenantContext): Promise<Objective[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("objectives")
    .select(
      "id, title, description, period_start, period_end, owner_user_id, key_results(id, title, progress, created_at)",
    )
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: true })
    .returns<ObjectiveRow[]>();
  if (error) {
    throw new Error("OKR を取得できませんでした");
  }
  return data.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    ownerUserId: row.owner_user_id,
    keyResults: [...row.key_results]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(({ id, title, progress }) => ({ id, title, progress })),
  }));
}
