"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ErrorText, useFormAction, type FormAction } from "@/components/ux";

// 柱の入力（ダイアログの中で使う）。番号は自動で付く
export function PillarForm({
  action,
  values,
  submitLabel,
  idPrefix,
}: {
  action: FormAction;
  values?: { title: string; description: string };
  submitLabel: string;
  idPrefix: string;
}) {
  const [state, formAction, pending] = useFormAction(action);
  const v = state.submitted;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-title`}>柱の名前</Label>
        <Input id={`${idPrefix}-title`} name="title" defaultValue={v?.title ?? values?.title} required autoFocus placeholder="自分の力で稼ぐ事業をつくる" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-description`}>説明（任意）</Label>
        <Textarea id={`${idPrefix}-description`} name="description" defaultValue={v?.description ?? values?.description} rows={3} />
      </div>
      <ErrorText error={state.error} />
      <Button type="submit" disabled={pending} className="self-end">
        {pending ? "保存中…" : submitLabel}
      </Button>
    </form>
  );
}
