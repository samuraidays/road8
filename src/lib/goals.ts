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
};

export type GoalsView = {
  statement: string;
  pillars: Pillar[];
};

// 人生のゴールと柱、柱ごとの今期の Objective の数
export async function getGoals({ tenant }: TenantContext): Promise<GoalsView> {
  const supabase = await createClient();
  const { year, quarter } = currentYearQuarter();
  const [goal, pillars, objectives] = await Promise.all([
    supabase.from("life_goals").select("statement").eq("tenant_id", tenant.id).maybeSingle(),
    supabase
      .from("pillars")
      .select("id, position, title, description")
      .eq("tenant_id", tenant.id)
      .order("position")
      .order("created_at"),
    supabase.from("objectives").select("pillar_id").eq("tenant_id", tenant.id).eq("year", year).eq("quarter", quarter),
  ]);
  const error = goal.error ?? pillars.error ?? objectives.error;
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
