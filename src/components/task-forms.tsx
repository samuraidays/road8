"use client";

import { useActionState, useState, useTransition } from "react";
import type { TaskFormState } from "@/app/app/[tenantId]/tasks/actions";
import type { KeyResultGroup } from "@/lib/tasks";
import { controlClassName, ErrorMessage, type Option } from "@/components/okr-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Action = (prev: TaskFormState, formData: FormData) => Promise<TaskFormState>;

export type TaskValues = {
  title: string;
  dueDate: string | null;
  scheduleDate: string;
  startTime: string;
  endTime: string;
  assigneeUserId: string | null;
  keyResultId?: string | null;
};

// 送信後のフォームのリセットで入力が消えないように、エラーのときは送った値を覚えておく
type FormState = TaskFormState & { submitted?: Record<string, string> };

export function TaskForm({
  action,
  members,
  values,
  submitLabel,
  idPrefix,
  keyResults,
}: {
  action: Action;
  members: Option[];
  values?: TaskValues;
  submitLabel: string;
  idPrefix: string;
  // 渡したときだけ KR の選択欄を出す（OKR 画面では KR が決まっているので出さない）
  keyResults?: KeyResultGroup[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await action(prev, formData);
    if (!result.error) {
      return result;
    }
    const submitted: Record<string, string> = {};
    formData.forEach((value, key) => {
      if (typeof value === "string") {
        submitted[key] = value;
      }
    });
    return { ...result, submitted };
  }, {});
  const v = state.submitted;

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-title`}>タスク</Label>
          <Input id={`${idPrefix}-title`} name="title" defaultValue={v?.title ?? values?.title} required placeholder="例：初期侵入ブローカーの解説記事を書く" />
        </div>
        {keyResults ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${idPrefix}-kr`}>OKR</Label>
            <select
              id={`${idPrefix}-kr`}
              name="keyResultId"
              defaultValue={v?.keyResultId ?? values?.keyResultId ?? ""}
              className={`${controlClassName} max-w-72`}
            >
              <option value="">ひもづけない</option>
              {keyResults.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-due`}>期日</Label>
          <input id={`${idPrefix}-due`} type="date" name="dueDate" defaultValue={v?.dueDate ?? values?.dueDate ?? ""} className={controlClassName} />
        </div>
      </div>
      <fieldset className="flex flex-wrap items-end gap-2">
        <legend className="mb-1.5 text-sm font-medium">やる日時（カレンダーに入れる時間帯）</legend>
        <input type="date" name="scheduleDate" aria-label="やる日" defaultValue={v?.scheduleDate ?? values?.scheduleDate ?? ""} className={controlClassName} />
        <input type="time" name="startTime" aria-label="開始" defaultValue={v?.startTime ?? values?.startTime ?? ""} className={controlClassName} />
        <span className="text-sm text-muted-foreground">〜</span>
        <input type="time" name="endTime" aria-label="終了" defaultValue={v?.endTime ?? values?.endTime ?? ""} className={controlClassName} />
        <select name="assigneeUserId" aria-label="担当者" defaultValue={v?.assigneeUserId ?? values?.assigneeUserId ?? ""} className={controlClassName}>
          <option value="">担当者なし</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "保存中…" : submitLabel}
        </Button>
      </fieldset>
      <ErrorMessage error={state.error} />
    </form>
  );
}

// 完了の付け外し
export function TaskCheckbox({
  setStatus,
  done,
  title,
}: {
  setStatus: (status: "todo" | "done") => Promise<TaskFormState>;
  done: boolean;
  title: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <span className="flex flex-col">
      <input
        type="checkbox"
        checked={done}
        disabled={pending}
        aria-label={`${title} を${done ? "未完了に戻す" : "完了にする"}`}
        onChange={() =>
          startTransition(async () => {
            const result = await setStatus(done ? "todo" : "done");
            setError(result.error);
          })
        }
        className={cn("size-4 accent-primary", pending && "opacity-50")}
      />
      <ErrorMessage error={error} />
    </span>
  );
}
