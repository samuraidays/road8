import "server-only";
import { currentYearQuarter } from "@/lib/period";
import { createClient } from "@/lib/supabase/server";
import type { TenantContext } from "@/lib/tenants";

export type Pillar = {
  id: string;
  position: number;
  title: string;
  description: string;
  currentObjectiveCount: number;
  reason: string;
};

export type GoalsView = {
  statement: string;
  pillars: Pillar[];
};

// 人生のゴールと柱、柱ごとの今期の Objective の数、本人の「なぜ」。
// 利用者の JWT で読むので、「なぜ」は RLS で本人の分だけに絞られる（設計書 §10-1）
export async function getGoals({ user, tenant }: TenantContext): Promise<GoalsView> {
  const supabase = await createClient();
  const { year, quarter } = currentYearQuarter();
  const [goal, pillars, objectives, reasons] = await Promise.all([
    supabase.from("life_goals").select("statement").eq("tenant_id", tenant.id).maybeSingle(),
    supabase
      .from("pillars")
      .select("id, position, title, description")
      .eq("tenant_id", tenant.id)
      .order("position")
      .order("created_at"),
    supabase.from("objectives").select("pillar_id").eq("tenant_id", tenant.id).eq("year", year).eq("quarter", quarter),
    supabase
      .from("reasons")
      .select("pillar_id, body")
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .not("pillar_id", "is", null),
  ]);
  const error = goal.error ?? pillars.error ?? objectives.error ?? reasons.error;
  if (error) {
    throw new Error("人生のゴールを取得できませんでした");
  }

  return {
    statement: goal.data?.statement ?? "",
    pillars: (pillars.data ?? []).map((p) => ({
      id: p.id,
      position: p.position,
      title: p.title,
      description: p.description,
      currentObjectiveCount: (objectives.data ?? []).filter((o) => o.pillar_id === p.id).length,
      reason: (reasons.data ?? []).find((r) => r.pillar_id === p.id)?.body ?? "",
    })),
  };
}

export type PillarOption = { id: string; title: string };

// Objective のフォームと表示に使う柱の一覧
export async function listPillarOptions({ tenant }: TenantContext): Promise<PillarOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pillars")
    .select("id, title")
    .eq("tenant_id", tenant.id)
    .order("position")
    .order("created_at");
  if (error) {
    throw new Error("柱を取得できませんでした");
  }
  return data;
}
