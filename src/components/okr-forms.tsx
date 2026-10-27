"use client";

import { useActionState } from "react";
import type { OkrFormState } from "@/app/app/[tenantId]/okr/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Action = (prev: OkrFormState, formData: FormData) => Promise<OkrFormState>;

// 送信後のフォームのリセットで入力が消えないように、エラーのときは送った値を覚えておき、入力欄の初期値に使う
type FormState = OkrFormState & { submitted?: Record<string, string> };

function useOkrAction(action: Action) {
  return useActionState<FormState, FormData>(async (prev, formData) => {
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
}

export type MemberOption = { userId: string; label: string };

type ObjectiveValues = {
  title: string;
  description: string;
  periodStart: string | null;
  periodEnd: string | null;
  ownerUserId: string | null;
};

const fieldClassName = "flex flex-col gap-1.5";
const controlClassName = "rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm";

function ErrorMessage({ error }: { error?: string }) {
  return error ? (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  ) : null;
}

export function ObjectiveForm({
  action,
  members,
  values,
  submitLabel,
  idPrefix,
}: {
  action: Action;
  members: MemberOption[];
  values?: ObjectiveValues;
  submitLabel: string;
  idPrefix: string;
}) {
  const [state, formAction, pending] = useOkrAction(action);
  const v = state.submitted;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className={fieldClassName}>
        <Label htmlFor={`${idPrefix}-title`}>Objective</Label>
        <Input id={`${idPrefix}-title`} name="title" defaultValue={v?.title ?? values?.title} required placeholder="例：顧客に選ばれるプロダクトにする" />
      </div>
      <div className={fieldClassName}>
        <Label htmlFor={`${idPrefix}-description`}>説明（任意）</Label>
        <textarea
          id={`${idPrefix}-description`}
          name="description"
          defaultValue={v?.description ?? values?.description}
          rows={2}
          className={controlClassName}
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <div className={fieldClassName}>
          <Label htmlFor={`${idPrefix}-start`}>開始日</Label>
          <input id={`${idPrefix}-start`} type="date" name="periodStart" defaultValue={v?.periodStart ?? values?.periodStart ?? ""} className={controlClassName} />
        </div>
        <div className={fieldClassName}>
          <Label htmlFor={`${idPrefix}-end`}>終了日</Label>
          <input id={`${idPrefix}-end`} type="date" name="periodEnd" defaultValue={v?.periodEnd ?? values?.periodEnd ?? ""} className={controlClassName} />
        </div>
        <div className={fieldClassName}>
          <Label htmlFor={`${idPrefix}-owner`}>担当者</Label>
          <select id={`${idPrefix}-owner`} name="ownerUserId" defaultValue={v?.ownerUserId ?? values?.ownerUserId ?? ""} className={controlClassName}>
            <option value="">未設定</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <ErrorMessage error={state.error} />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "保存中…" : submitLabel}
      </Button>
    </form>
  );
}

export function KeyResultForm({
  action,
  values,
  submitLabel,
  idPrefix,
}: {
  action: Action;
  values?: { title: string; progress: number };
  submitLabel: string;
  idPrefix: string;
}) {
  const [state, formAction, pending] = useOkrAction(action);
  const v = state.submitted;

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className={`${fieldClassName} min-w-48 flex-1`}>
          <Label htmlFor={`${idPrefix}-title`}>Key Result</Label>
          <Input id={`${idPrefix}-title`} name="title" defaultValue={v?.title ?? values?.title} required placeholder="例：解約率を3%未満にする" />
        </div>
        <div className={`${fieldClassName} w-24`}>
          <Label htmlFor={`${idPrefix}-progress`}>進捗（%）</Label>
          <Input
            id={`${idPrefix}-progress`}
            name="progress"
            type="number"
            min={0}
            max={100}
            step={1}
            defaultValue={v?.progress ?? values?.progress ?? 0}
          />
        </div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "保存中…" : submitLabel}
        </Button>
      </div>
      <ErrorMessage error={state.error} />
    </form>
  );
}

// 削除ボタン。押したら確認ダイアログを出す
export function DeleteButton({ action, label, confirmMessage }: { action: Action; label: string; confirmMessage: string }) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
      className="flex flex-col items-start gap-1"
    >
      <Button type="submit" variant="destructive" size="sm" disabled={pending}>
        {label}
      </Button>
      <ErrorMessage error={state.error} />
    </form>
  );
}
