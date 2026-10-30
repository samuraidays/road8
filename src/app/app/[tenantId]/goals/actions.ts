"use server";

import { revalidatePath } from "next/cache";
import { logDbError } from "@/lib/log";
import { text } from "@/lib/okr-input";
import { createClient } from "@/lib/supabase/server";
import { isUuid, requireTenant, type TenantContext } from "@/lib/tenants";
import { codePointLength } from "@/lib/text";

export type GoalFormState = { error?: string };

const STATEMENT_MAX = 2000;
const PILLAR_TITLE_MAX = 100;
const PILLAR_DESCRIPTION_MAX = 1000;

// 人生のゴールと柱を書けるのは Owner だけ（設計書 §10-3。RLS でも止まる）
async function requireOwner(tenantId: string): Promise<TenantContext | GoalFormState> {
  const context = await requireTenant(tenantId);
  if (context.tenant.role !== "owner") {
    return { error: "人生のゴールと柱を編集できるのは Owner だけです" };
  }
  return context;
}

function failed(action: string, { user, tenant }: TenantContext, error: { code: string; message: string }): GoalFormState {
  logDbError(action, { userId: user.id, tenantId: tenant.id }, error);
  return { error: "保存できませんでした。時間をおいて試してください" };
}

function revalidate(tenantId: string) {
  revalidatePath(`/app/${tenantId}/goals`);
  // OKR の画面に柱の名前を出しているため
  revalidatePath(`/app/${tenantId}/okr`);
}

type PillarInput = { title: string; description: string };

function parsePillar(formData: FormData): { ok: true; value: PillarInput } | { ok: false; error: string } {
  const title = text(formData, "title");
  if (codePointLength(title) < 1 || codePointLength(title) > PILLAR_TITLE_MAX) {
    return { ok: false, error: `柱の名前は1〜${PILLAR_TITLE_MAX}文字で入力してください` };
  }
  const description = text(formData, "description");
  if (codePointLength(description) > PILLAR_DESCRIPTION_MAX) {
    return { ok: false, error: `説明は${PILLAR_DESCRIPTION_MAX}文字以内で入力してください` };
  }
  return { ok: true, value: { title, description } };
}

export async function saveLifeGoal(tenantId: string, _prev: GoalFormState, formData: FormData): Promise<GoalFormState> {
  const context = await requireOwner(tenantId);
  if (!("tenant" in context)) {
    return context;
  }
  const statement = text(formData, "statement");
  if (codePointLength(statement) > STATEMENT_MAX) {
    return { error: `${STATEMENT_MAX}文字以内で入力してください` };
  }

  // 1テナントに1行。あれば更新、なければ作る（upsert は列単位の UPDATE 権限と合わないため）
  const supabase = await createClient();
  const updated = await supabase
    .from("life_goals")
    .update({ statement })
    .eq("tenant_id", context.tenant.id)
    .select("tenant_id");
  if (updated.error) {
    return failed("life_goal.write", context, updated.error);
  }
  if (updated.data.length === 0) {
    const { error } = await supabase.from("life_goals").insert({ tenant_id: context.tenant.id, statement });
    if (error) {
      return failed("life_goal.write", context, error);
    }
  }
  revalidate(context.tenant.id);
  return {};
}

export async function createPillar(tenantId: string, _prev: GoalFormState, formData: FormData): Promise<GoalFormState> {
  const context = await requireOwner(tenantId);
  if (!("tenant" in context)) {
    return context;
  }
  const parsed = parsePillar(formData);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  // 番号は自動で、いまの最後の次にする
  const supabase = await createClient();
  const last = await supabase
    .from("pillars")
    .select("position")
    .eq("tenant_id", context.tenant.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last.error) {
    return failed("pillar.create", context, last.error);
  }
  const position = Math.min((last.data?.position ?? 0) + 1, 99);
  const { error } = await supabase.from("pillars").insert({ ...parsed.value, position, tenant_id: context.tenant.id });
  if (error) {
    return failed("pillar.create", context, error);
  }
  revalidate(context.tenant.id);
  return {};
}

export async function updatePillar(
  tenantId: string,
  pillarId: string,
  _prev: GoalFormState,
  formData: FormData,
): Promise<GoalFormState> {
  const context = await requireOwner(tenantId);
  if (!("tenant" in context)) {
    return context;
  }
  if (!isUuid(pillarId)) {
    return { error: "柱が見つかりません" };
  }
  const parsed = parsePillar(formData);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pillars")
    .update(parsed.value)
    .eq("tenant_id", context.tenant.id)
    .eq("id", pillarId)
    .select("id");
  if (error) {
    return failed("pillar.update", context, error);
  }
  if (data.length === 0) {
    return { error: "柱が見つかりません" };
  }
  revalidate(context.tenant.id);
  return {};
}

// 柱を消すと、ひもづいた Objective からは柱が外れる（Objective は残る）
export async function deletePillar(tenantId: string, pillarId: string): Promise<GoalFormState> {
  const context = await requireOwner(tenantId);
  if (!("tenant" in context)) {
    return context;
  }
  if (!isUuid(pillarId)) {
    return { error: "柱が見つかりません" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pillars")
    .delete()
    .eq("tenant_id", context.tenant.id)
    .eq("id", pillarId)
    .select("id");
  if (error) {
    return failed("pillar.delete", context, error);
  }
  if (data.length === 0) {
    return { error: "柱が見つかりません" };
  }
  revalidate(context.tenant.id);
  return {};
}

// 柱の並べ替え。ひとつ上（または下）の柱と番号を入れ替える
export async function movePillar(tenantId: string, pillarId: string, direction: "up" | "down"): Promise<GoalFormState> {
  const context = await requireOwner(tenantId);
  if (!("tenant" in context)) {
    return context;
  }
  if (!isUuid(pillarId)) {
    return { error: "柱が見つかりません" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pillars")
    .select("id, position")
    .eq("tenant_id", context.tenant.id)
    .order("position")
    .order("created_at");
  if (error) {
    return failed("pillar.update", context, error);
  }
  const index = data.findIndex((p) => p.id === pillarId);
  const neighbor = data[direction === "up" ? index - 1 : index + 1];
  if (index < 0 || !neighbor) {
    return {};
  }
  // 番号を振り直してから入れ替える（同じ番号が並んでいても順番が決まるように）
  const order = data.map((p) => p.id);
  [order[index], order[direction === "up" ? index - 1 : index + 1]] = [neighbor.id, pillarId];
  for (const [i, id] of order.entries()) {
    const { error: updateError } = await supabase.from("pillars").update({ position: i + 1 }).eq("tenant_id", context.tenant.id).eq("id", id);
    if (updateError) {
      return failed("pillar.update", context, updateError);
    }
  }
  revalidate(context.tenant.id);
  return {};
}
