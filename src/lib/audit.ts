import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { TenantContext } from "@/lib/tenants";

export type AuditEntry = {
  id: number;
  action: string;
  actorUserId: string | null;
  targetType: string | null;
  result: string;
  via: string | null;
  changed: string[];
  createdAt: string;
};

type AuditRow = {
  id: number;
  action: string;
  actor_user_id: string | null;
  target_type: string | null;
  result: string;
  metadata: { via?: string; changed?: string[] } | null;
  created_at: string;
};

export const AUDIT_PAGE_SIZE = 100;

// 自テナントの監査ログ（新しい順）。RLS で Owner だけが読める。before を渡すと、その ID より古いものを返す
export async function listAuditLogs({ tenant }: TenantContext, before: number | null): Promise<AuditEntry[]> {
  const supabase = await createClient();
  let query = supabase
    .from("audit_logs")
    .select("id, action, actor_user_id, target_type, result, metadata, created_at")
    .eq("tenant_id", tenant.id)
    .order("id", { ascending: false })
    .limit(AUDIT_PAGE_SIZE);
  if (before !== null) {
    query = query.lt("id", before);
  }
  const { data, error } = await query.returns<AuditRow[]>();
  if (error) {
    throw new Error("監査ログを取得できませんでした");
  }
  return data.map((row) => ({
    id: row.id,
    action: row.action,
    actorUserId: row.actor_user_id,
    targetType: row.target_type,
    result: row.result,
    via: row.metadata?.via ?? null,
    changed: Array.isArray(row.metadata?.changed) ? row.metadata.changed : [],
    createdAt: row.created_at,
  }));
}

const TABLE_LABEL: Record<string, string> = {
  tenants: "テナント",
  memberships: "所属",
  invitations: "招待",
  objectives: "Objective",
  key_results: "Key Result",
  tasks: "タスク",
  life_goals: "人生のゴール",
  pillars: "柱",
  kr_measurements: "数値の記録",
  habits: "習慣",
  habit_checks: "習慣の実施",
  reasons: "「なぜ」（本人だけ）",
  weekly_reviews: "週の振り返り（本人だけ）",
  quarterly_reviews: "四半期の振り返り（本人だけ）",
};

const OP_LABEL: Record<string, string> = { insert: "作成", update: "変更", delete: "削除" };

// 「objectives.update」→「Objective を変更」
export function actionLabel(action: string): string {
  const [table, op] = action.split(".");
  const target = TABLE_LABEL[table];
  const verb = OP_LABEL[op];
  return target && verb ? `${target}を${verb}` : action;
}
