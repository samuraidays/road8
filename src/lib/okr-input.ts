import "server-only";
import { isUuid } from "@/lib/tenants";
import { japanDateTime } from "@/lib/period";
import { codePointLength as length } from "@/lib/text";

// OKR のフォーム入力の検証。上限は DB の check と同じく、コードポイントで数える
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 2000;
const UNIT_MAX = 20;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PROGRESS_PATTERN = /^\d{1,3}$/;
// numeric(14, 2) に収まる10進数（符号・小数2桁まで）
const DECIMAL_PATTERN = /^-?\d{1,12}(\.\d{1,2})?$/;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export type ObjectiveInput = {
  title: string;
  description: string;
  pillar_id: string | null;
  owner_user_id: string | null;
  year: number;
  quarter: number;
};

export type KeyResultInput =
  | { kind: "manual"; title: string; progress: number; start_value: null; target_value: null; unit: string }
  | { kind: "metric"; title: string; progress: number; start_value: number; target_value: number; unit: string };

export type MeasurementInput = { measured_on: string; value: number };
export type TaskInput = {
  title: string;
  due_date: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  assignee_user_id: string | null;
  // フォームに KR の選択欄があるときだけ入る（null は「ひもづけない」）
  key_result_id?: string | null;
};
export type HabitInput = { title: string; times_per_week: number };

export function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function parseTitle(formData: FormData): Parsed<string> {
  const title = text(formData, "title");
  if (length(title) < 1 || length(title) > TITLE_MAX) {
    return { ok: false, error: `タイトルは1〜${TITLE_MAX}文字で入力してください` };
  }
  return { ok: true, value: title };
}

function parseOptionalId(formData: FormData, name: string, label: string): Parsed<string | null> {
  const value = text(formData, name);
  if (value === "") {
    return { ok: true, value: null };
  }
  return isUuid(value) ? { ok: true, value } : { ok: false, error: `${label}が正しくありません` };
}

function parseDecimal(value: string, label: string): Parsed<number> {
  if (!DECIMAL_PATTERN.test(value)) {
    return { ok: false, error: `${label}は数値（小数2桁まで）で入力してください` };
  }
  return { ok: true, value: Number(value) };
}

// 日付として存在しない値（2026-02-30 など）は拒否する
export function parseDate(value: string): Parsed<string> {
  const date = new Date(`${value}T00:00:00Z`);
  if (!DATE_PATTERN.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return { ok: false, error: "日付が正しくありません" };
  }
  return { ok: true, value };
}

export function parseYearQuarter(yearText: string, quarterText: string): Parsed<{ year: number; quarter: number }> {
  const year = Number(yearText);
  const quarter = Number(quarterText);
  if (!/^\d{4}$/.test(yearText) || year < 2000 || year > 2100 || !/^[1-4]$/.test(quarterText)) {
    return { ok: false, error: "年と四半期が正しくありません" };
  }
  return { ok: true, value: { year, quarter } };
}

export function parseObjective(formData: FormData): Parsed<ObjectiveInput> {
  const title = parseTitle(formData);
  if (!title.ok) {
    return title;
  }
  const description = text(formData, "description");
  if (length(description) > DESCRIPTION_MAX) {
    return { ok: false, error: `説明は${DESCRIPTION_MAX}文字以内で入力してください` };
  }
  // 柱・担当者がこのテナントのものかは、DB の複合外部キーが確かめる
  const pillar = parseOptionalId(formData, "pillarId", "柱");
  if (!pillar.ok) {
    return pillar;
  }
  const owner = parseOptionalId(formData, "ownerUserId", "担当者");
  if (!owner.ok) {
    return owner;
  }
  const period = parseYearQuarter(text(formData, "year"), text(formData, "quarter"));
  if (!period.ok) {
    return period;
  }
  return {
    ok: true,
    value: {
      title: title.value,
      description,
      pillar_id: pillar.value,
      owner_user_id: owner.value,
      ...period.value,
    },
  };
}

export function parseKeyResult(formData: FormData): Parsed<KeyResultInput> {
  const title = parseTitle(formData);
  if (!title.ok) {
    return title;
  }
  const unit = text(formData, "unit");
  if (length(unit) > UNIT_MAX) {
    return { ok: false, error: `単位は${UNIT_MAX}文字以内で入力してください` };
  }

  if (text(formData, "kind") === "metric") {
    const start = parseDecimal(text(formData, "startValue"), "開始値");
    if (!start.ok) {
      return start;
    }
    const target = parseDecimal(text(formData, "targetValue"), "目標値");
    if (!target.ok) {
      return target;
    }
    if (start.value === target.value) {
      return { ok: false, error: "開始値と目標値は違う値にしてください" };
    }
    return {
      ok: true,
      value: { kind: "metric", title: title.value, progress: 0, start_value: start.value, target_value: target.value, unit },
    };
  }

  // 手入力：0〜100 の10進の整数だけを受け付ける（Number() だと 1e2 や 0x32 も通るため、先に形を確かめる）
  const raw = text(formData, "progress");
  const progress = raw === "" ? 0 : PROGRESS_PATTERN.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
    return { ok: false, error: "進捗は0〜100の整数で入力してください" };
  }
  return { ok: true, value: { kind: "manual", title: title.value, progress, start_value: null, target_value: null, unit } };
}

// 数値の記録。未来の日付は受け付けない
export function parseMeasurement(formData: FormData, today: string): Parsed<MeasurementInput> {
  const date = parseDate(text(formData, "measuredOn"));
  if (!date.ok) {
    return date;
  }
  if (date.value > today) {
    return { ok: false, error: "未来の日付には記録できません" };
  }
  const value = parseDecimal(text(formData, "value"), "値");
  if (!value.ok) {
    return value;
  }
  return { ok: true, value: { measured_on: date.value, value: value.value } };
}

export function parseHabit(formData: FormData): Parsed<HabitInput> {
  const title = parseTitle(formData);
  if (!title.ok) {
    return title;
  }
  const times = text(formData, "timesPerWeek");
  if (!/^[1-7]$/.test(times)) {
    return { ok: false, error: "週の回数は1〜7で選んでください" };
  }
  return { ok: true, value: { title: title.value, times_per_week: Number(times) } };
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// タスク。時間帯は「日付・開始・終了」をそろえて入れる（日をまたぐ時間帯は扱わない）。担当者がテナントのメンバーかは DB の複合外部キーが確かめる
export function parseTask(formData: FormData): Parsed<TaskInput> {
  const title = parseTitle(formData);
  if (!title.ok) {
    return title;
  }
  const dueText = text(formData, "dueDate");
  const due = dueText === "" ? null : parseDate(dueText);
  if (due && !due.ok) {
    return due;
  }
  const assignee = parseOptionalId(formData, "assigneeUserId", "担当者");
  if (!assignee.ok) {
    return assignee;
  }
  // KR が同じテナントのものかは、DB の複合外部キーが確かめる
  const keyResult = formData.has("keyResultId") ? parseOptionalId(formData, "keyResultId", "Key Result") : null;
  if (keyResult && !keyResult.ok) {
    return keyResult;
  }

  const date = text(formData, "scheduleDate");
  const start = text(formData, "startTime");
  const end = text(formData, "endTime");
  let scheduled: { start: string; end: string } | null = null;
  if (date !== "" || start !== "" || end !== "") {
    const day = parseDate(date);
    if (!day.ok || !TIME_PATTERN.test(start) || !TIME_PATTERN.test(end)) {
      return { ok: false, error: "やる日時は、日付・開始・終了をそろえて入力してください" };
    }
    if (end <= start) {
      return { ok: false, error: "終了は開始より後の時刻にしてください" };
    }
    scheduled = { start: japanDateTime(day.value, start), end: japanDateTime(day.value, end) };
  }

  return {
    ok: true,
    value: {
      title: title.value,
      due_date: due ? due.value : null,
      scheduled_start: scheduled?.start ?? null,
      scheduled_end: scheduled?.end ?? null,
      assignee_user_id: assignee.value,
      ...(keyResult ? { key_result_id: keyResult.value } : {}),
    },
  };
}
