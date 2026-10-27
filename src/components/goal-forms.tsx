"use client";

import { useActionState } from "react";
import type { GoalFormState } from "@/app/app/[tenantId]/goals/actions";
import { controlClassName, ErrorMessage } from "@/components/okr-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Action = (prev: GoalFormState, formData: FormData) => Promise<GoalFormState>;

export function LifeGoalForm({ action, statement }: { action: Action; statement: string }) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Label htmlFor="life-goal">最終ゴール</Label>
      <textarea id="life-goal" name="statement" defaultValue={statement} rows={4} className={controlClassName} placeholder="どんな人生にしたいか" />
      <div className="flex items-center gap-2">
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          保存
        </Button>
        <ErrorMessage error={state.error} />
      </div>
    </form>
  );
}

export function PillarForm({
  action,
  values,
  submitLabel,
  idPrefix,
}: {
  action: Action;
  values?: { title: string; description: string; position: number };
  submitLabel: string;
  idPrefix: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex w-20 flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-position`}>番号</Label>
          <Input id={`${idPrefix}-position`} name="position" type="number" min={0} max={99} defaultValue={values?.position ?? 1} />
        </div>
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-title`}>柱の名前</Label>
          <Input id={`${idPrefix}-title`} name="title" defaultValue={values?.title} required placeholder="例：自分の力で稼ぐ事業をつくる" />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-description`}>説明（任意）</Label>
        <textarea id={`${idPrefix}-description`} name="description" defaultValue={values?.description} rows={2} className={controlClassName} />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {submitLabel}
        </Button>
        <ErrorMessage error={state.error} />
      </div>
    </form>
  );
}
