import "server-only";
import { isUuid } from "@/lib/tenants";
import { codePointLength as length } from "@/lib/text";

// OKR のフォーム入力の検証。上限は DB の check と同じく、コードポイントで数える
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 2000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PROGRESS_PATTERN = /^\d{1,3}$/;

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export type ObjectiveInput = {
  title: string;
  description: string;
  period_start: string | null;
  period_end: string | null;
  owner_user_id: string | null;
};

export type KeyResultInput = {
  title: string;
  progress: number;
};

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function parseTitle(formData: FormData): Parsed<string> {
  const title = text(formData, "title");
  if (length(title) < 1 || length(title) > TITLE_MAX) {
    return { ok: false, error: `タイトルは1〜${TITLE_MAX}文字で入力してください` };
  }
  return { ok: true, value: title };
}

// 空なら null。日付として存在しない値（2026-02-30 など）は拒否する
function parseDate(value: string): Parsed<string | null> {
  if (value === "") {
    return { ok: true, value: null };
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (!DATE_PATTERN.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return { ok: false, error: "日付が正しくありません" };
  }
  return { ok: true, value };
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
  const start = parseDate(text(formData, "periodStart"));
  const end = parseDate(text(formData, "periodEnd"));
  if (!start.ok) {
    return start;
  }
  if (!end.ok) {
    return end;
  }
  if (start.value && end.value && end.value < start.value) {
    return { ok: false, error: "終了日は開始日以降にしてください" };
  }
  // 担当者がテナントのメンバーかは、DB の複合外部キーが確かめる
  const owner = text(formData, "ownerUserId");
  if (owner !== "" && !isUuid(owner)) {
    return { ok: false, error: "担当者が正しくありません" };
  }
  return {
    ok: true,
    value: {
      title: title.value,
      description,
      period_start: start.value,
      period_end: end.value,
      owner_user_id: owner === "" ? null : owner,
    },
  };
}

export function parseKeyResult(formData: FormData): Parsed<KeyResultInput> {
  const title = parseTitle(formData);
  if (!title.ok) {
    return title;
  }
  // 0〜100 の10進の整数だけを受け付ける（Number() だと 1e2 や 0x32 も通るため、先に形を確かめる）
  const raw = text(formData, "progress");
  const progress = raw === "" ? 0 : PROGRESS_PATTERN.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
    return { ok: false, error: "進捗は0〜100の整数で入力してください" };
  }
  return { ok: true, value: { title: title.value, progress } };
}
