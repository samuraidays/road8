"use server";

import { revalidatePath } from "next/cache";
import {
  accessTokenFrom,
  CalendarNotFoundError,
  createCalendar,
  deleteEvent,
  GoogleAuthError,
  insertEvent,
  updateEvent,
  type CalendarEvent,
} from "@/lib/google";
import { logDbError } from "@/lib/log";
import { parseTask } from "@/lib/okr-input";
import { createClient } from "@/lib/supabase/server";
import { getGoogleConnection, setGoogleCalendarId } from "@/lib/supabase/service";
import type { TaskStatus } from "@/lib/tasks";
import { isUuid, requireTenant, type TenantContext } from "@/lib/tenants";

export type TaskFormState = { error?: string; message?: string };

const STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];
const NOT_FOUND = { error: "タスクが見つかりません" };

// tenantId と各 ID は bind でフォームから届くので信用しない。requireTenant() で所属を確かめ、
// 更新・削除は tenant_id でも絞る（RLS と複合外部キーでも止まる）
function failed(action: string, { user, tenant }: TenantContext, error: { code: string; message: string }): TaskFormState {
  logDbError(action, { userId: user.id, tenantId: tenant.id }, error);
  return { error: "保存できませんでした。時間をおいて試してください" };
}

function revalidate(tenantId: string) {
  revalidatePath(`/app/${tenantId}/tasks`);
  revalidatePath(`/app/${tenantId}/okr`);
}

export async function createTask(
  tenantId: string,
  keyResultId: string,
  _prev: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const context = await requireTenant(tenantId);
  if (!isUuid(keyResultId)) {
    return { error: "Key Result が見つかりません" };
  }
  const parsed = parseTask(formData);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({
    ...parsed.value,
    tenant_id: context.tenant.id,
    key_result_id: keyResultId,
    created_by: context.user.id,
  });
  if (error) {
    // 23503：KR か担当者がこのテナントのものではない（複合外部キー）
    if (error.code === "23503") {
      return { error: "Key Result と担当者は、このテナントのものから選んでください" };
    }
    return failed("task.create", context, error);
  }
  revalidate(context.tenant.id);
  return {};
}

export async function updateTask(
  tenantId: string,
  taskId: string,
  _prev: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const context = await requireTenant(tenantId);
  if (!isUuid(taskId)) {
    return NOT_FOUND;
  }
  const parsed = parseTask(formData);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update(parsed.value)
    .eq("tenant_id", context.tenant.id)
    .eq("id", taskId)
    .select("calendar_event_id")
    .returns<{ calendar_event_id: string | null }[]>();
  if (error) {
    if (error.code === "23503") {
      return { error: "担当者は、このテナントのメンバーから選んでください" };
    }
    return failed("task.update", context, error);
  }
  if (data.length === 0) {
    return NOT_FOUND;
  }
  // カレンダーに入れたタスクなら、予定も合わせる（やる日時を消したら予定も消す）
  if (data[0].calendar_event_id) {
    const synced = parsed.value.scheduled_start
      ? await addTaskToCalendar(tenantId, taskId)
      : await removeFromCalendar(context, taskId, data[0].calendar_event_id);
    revalidate(context.tenant.id);
    return synced.error ? { error: `保存しました。ただし ${synced.error}` } : {};
  }
  revalidate(context.tenant.id);
  return {};
}

export async function setTaskStatus(tenantId: string, taskId: string, status: TaskStatus): Promise<TaskFormState> {
  const context = await requireTenant(tenantId);
  if (!isUuid(taskId) || !STATUSES.includes(status)) {
    return NOT_FOUND;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({ status })
    .eq("tenant_id", context.tenant.id)
    .eq("id", taskId)
    .select("id");
  if (error) {
    return failed("task.update", context, error);
  }
  if (data.length === 0) {
    return NOT_FOUND;
  }
  revalidate(context.tenant.id);
  return {};
}

export async function deleteTask(tenantId: string, taskId: string): Promise<TaskFormState> {
  const context = await requireTenant(tenantId);
  if (!isUuid(taskId)) {
    return NOT_FOUND;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .delete()
    .eq("tenant_id", context.tenant.id)
    .eq("id", taskId)
    .select("calendar_event_id")
    .returns<{ calendar_event_id: string | null }[]>();
  if (error) {
    return failed("task.delete", context, error);
  }
  if (data.length === 0) {
    return NOT_FOUND;
  }
  // カレンダーに入れたタスクなら、予定も消す（タスクの削除は済んでいるので、失敗しても削除は取り消さない）
  if (data[0].calendar_event_id) {
    await removeFromCalendar(context, null, data[0].calendar_event_id);
  }
  revalidate(context.tenant.id);
  return {};
}

// 予定を消し、タスクが残っていれば予定 ID を空にする。連携していなければ何もしない
async function removeFromCalendar(context: TenantContext, taskId: string | null, eventId: string): Promise<TaskFormState> {
  try {
    const connection = await getGoogleConnection(context.user.id);
    if (!connection?.calendarId) {
      return {};
    }
    await deleteEvent(await accessTokenFrom(connection.refreshToken), connection.calendarId, eventId);
  } catch (e) {
    console.error("task.remove_from_calendar failed", {
      userId: context.user.id,
      tenantId: context.tenant.id,
      reason: e instanceof Error ? e.message : "unknown",
    });
    return { error: "カレンダーの予定を消せませんでした" };
  }
  if (taskId) {
    const supabase = await createClient();
    await supabase.from("tasks").update({ calendar_event_id: null }).eq("tenant_id", context.tenant.id).eq("id", taskId);
  }
  return {};
}

// ---- Google カレンダーに入れる（task.add_to_calendar。設計書 §6）----

type CalendarTaskRow = {
  title: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  calendar_event_id: string | null;
  key_results: { title: string } | null;
};

// 予定を作る（すでに入れたタスクなら更新する）。カレンダーや予定が利用者に消されていたら作り直す
async function upsertEvent(
  userId: string,
  accessToken: string,
  calendarId: string | null,
  eventId: string | null,
  event: CalendarEvent,
): Promise<string> {
  let calendar = calendarId;
  if (!calendar) {
    calendar = await createCalendar(accessToken);
    await setGoogleCalendarId(userId, calendar);
  }
  if (eventId) {
    try {
      return await updateEvent(accessToken, calendar, eventId, event);
    } catch (error) {
      if (!(error instanceof CalendarNotFoundError)) {
        throw error;
      }
    }
  }
  try {
    return await insertEvent(accessToken, calendar, event);
  } catch (error) {
    if (!(error instanceof CalendarNotFoundError)) {
      throw error;
    }
    // road8 のカレンダー自体が消されていた
    const recreated = await createCalendar(accessToken);
    await setGoogleCalendarId(userId, recreated);
    return insertEvent(accessToken, recreated, event);
  }
}

export async function addTaskToCalendar(tenantId: string, taskId: string): Promise<TaskFormState> {
  const context = await requireTenant(tenantId);
  if (!isUuid(taskId)) {
    return NOT_FOUND;
  }

  // タスクは利用者の JWT で読む（自分が見られるタスクだけ。RLS）
  const supabase = await createClient();
  const { data: task, error } = await supabase
    .from("tasks")
    .select("title, scheduled_start, scheduled_end, calendar_event_id, key_results(title)")
    .eq("tenant_id", context.tenant.id)
    .eq("id", taskId)
    .returns<CalendarTaskRow[]>()
    .maybeSingle();
  if (error) {
    return failed("task.add_to_calendar", context, error);
  }
  if (!task) {
    return NOT_FOUND;
  }
  if (!task.scheduled_start || !task.scheduled_end) {
    return { error: "先に「やる日時」を入れてください" };
  }

  let eventId: string;
  try {
    const connection = await getGoogleConnection(context.user.id);
    if (!connection) {
      return { error: "Google カレンダーと連携してください" };
    }
    const accessToken = await accessTokenFrom(connection.refreshToken);
    eventId = await upsertEvent(context.user.id, accessToken, connection.calendarId, task.calendar_event_id, {
      summary: task.title,
      description: task.key_results ? `road8：${task.key_results.title}` : "road8",
      start: task.scheduled_start,
      end: task.scheduled_end,
    });
  } catch (e) {
    // トークンや予定の中身はログに出さない
    console.error("task.add_to_calendar failed", {
      userId: context.user.id,
      tenantId: context.tenant.id,
      reason: e instanceof Error ? e.message : "unknown",
    });
    if (e instanceof GoogleAuthError) {
      return { error: "Google カレンダーとの連携が切れています。連携し直してください" };
    }
    return { error: "カレンダーに入れられませんでした。時間をおいて試してください" };
  }

  const saved = await supabase
    .from("tasks")
    .update({ calendar_event_id: eventId })
    .eq("tenant_id", context.tenant.id)
    .eq("id", taskId);
  if (saved.error) {
    return failed("task.add_to_calendar", context, saved.error);
  }
  revalidate(context.tenant.id);
  return { message: task.calendar_event_id ? "予定を更新しました" : "カレンダーに入れました" };
}
