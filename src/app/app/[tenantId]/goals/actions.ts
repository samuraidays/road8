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

type PillarInput = { title: string; description: string; position: number };

function parsePillar(formData: FormData): { ok: true; value: PillarInput } | { ok: false; error: string } {
  const title = text(formData, "title");
  if (codePointLength(title) < 1 || codePointLength(title) > PILLAR_TITLE_MAX) {
    return { ok: false, error: `柱の名前は1〜${PILLAR_TITLE_MAX}文字で入力してください` };
  }
  const description = text(formData, "description");
  if (codePointLength(description) > PILLAR_DESCRIPTION_MAX) {
    return { ok: false, error: `説明は${PILLAR_DESCRIPTION_MAX}文字以内で入力してください` };
  }
  const position = text(formData, "position");
  if (!/^\d{1,2}$/.test(position)) {
    return { ok: false, error: "番号は0〜99で入力してください" };
  }
  return { ok: true, value: { title, description, position: Number(position) } };
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

  const supabase = await createClient();
  const { error } = await supabase.from("pillars").insert({ ...parsed.value, tenant_id: context.tenant.id });
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

// 柱を消すと、ひもづいた Objective からは柱が外れ（Objective は残る）、柱の「なぜ」は消える
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
