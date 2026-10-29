"use client";

import { startTransition, useOptimistic, useRef } from "react";
import { toast } from "sonner";
import { controlClassName, type Option } from "@/components/okr-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorText, useFormAction, type ActionResult, type FormAction } from "@/components/ux";
import type { KeyResultGroup } from "@/lib/tasks";
import { cn } from "@/lib/utils";

export type TaskValues = {
  title: string;
  dueDate: string | null;
  scheduleDate: string;
  startTime: string;
  endTime: string;
  assigneeUserId: string | null;
  keyResultId?: string | null;
};

// 「10:30」の1時間後（日をまたぐときは 23:59）
function oneHourLater(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return h >= 23 ? "23:59" : `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// タスクの詳しい入力（ダイアログの中で使う）
export function TaskForm({
  action,
  members,
  values,
  submitLabel,
  idPrefix,
  keyResults,
}: {
  action: FormAction;
  members: Option[];
  values?: TaskValues;
  submitLabel: string;
  idPrefix: string;
  // 渡したときだけ KR の選択欄を出す（OKR 画面では KR が決まっているので出さない）
  keyResults?: KeyResultGroup[];
}) {
  const [state, formAction, pending] = useFormAction(action);
  const v = state.submitted;
  const endRef = useRef<HTMLInputElement>(null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-title`}>タスク</Label>
        <Input id={`${idPrefix}-title`} name="title" defaultValue={v?.title ?? values?.title} required autoFocus placeholder="解説記事を書く" />
      </div>
      {keyResults ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-kr`}>OKR</Label>
          <select id={`${idPrefix}-kr`} name="keyResultId" defaultValue={v?.keyResultId ?? values?.keyResultId ?? ""} className={controlClassName}>
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
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">やる日時（カレンダーに入れる時間帯）</legend>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" name="scheduleDate" aria-label="やる日" defaultValue={v?.scheduleDate ?? values?.scheduleDate ?? ""} className={controlClassName} />
          <input
            type="time"
            name="startTime"
            aria-label="開始"
            defaultValue={v?.startTime ?? values?.startTime ?? ""}
            // 終了がまだ空なら、開始の1時間後を入れておく
            onChange={(e) => {
              if (endRef.current && !endRef.current.value && e.target.value) {
                endRef.current.value = oneHourLater(e.target.value);
              }
            }}
            className={controlClassName}
          />
          <span className="text-sm text-muted-foreground">〜</span>
          <input ref={endRef} type="time" name="endTime" aria-label="終了" defaultValue={v?.endTime ?? values?.endTime ?? ""} className={controlClassName} />
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-due`}>期日</Label>
          <input id={`${idPrefix}-due`} type="date" name="dueDate" defaultValue={v?.dueDate ?? values?.dueDate ?? ""} className={controlClassName} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-assignee`}>担当者</Label>
          <select id={`${idPrefix}-assignee`} name="assigneeUserId" defaultValue={v?.assigneeUserId ?? values?.assigneeUserId ?? ""} className={controlClassName}>
            <option value="">なし</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <ErrorText error={state.error} />
      <Button type="submit" disabled={pending} className="self-end">
        {pending ? "保存中…" : submitLabel}
      </Button>
    </form>
  );
}

// 完了の付け外し。押した瞬間に画面へ反映し、保存は裏で行う（失敗したら元に戻して知らせる）
export function TaskCheckbox({
  setStatus,
  done,
  title,
}: {
  setStatus: (status: "todo" | "done") => Promise<ActionResult>;
  done: boolean;
  title: string;
}) {
  const [optimisticDone, setOptimisticDone] = useOptimistic(done);

  return (
    <input
      type="checkbox"
      checked={optimisticDone}
      aria-label={`${title} を${optimisticDone ? "未完了に戻す" : "完了にする"}`}
      onChange={() =>
        startTransition(async () => {
          const next = !optimisticDone;
          setOptimisticDone(next);
          const result = await setStatus(next ? "done" : "todo");
          if (result.error) {
            toast.error(result.error);
          }
        })
      }
      className={cn("size-4 shrink-0 accent-progress")}
    />
  );
}
