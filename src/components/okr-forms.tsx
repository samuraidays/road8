"use client";

import { useActionState, useState, useTransition } from "react";
import { LockIcon } from "lucide-react";
import type { OkrFormState } from "@/app/app/[tenantId]/okr/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Action = (prev: OkrFormState, formData: FormData) => Promise<OkrFormState>;

export type Option = { id: string; label: string };

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

const fieldClassName = "flex flex-col gap-1.5";
export const controlClassName = "rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm";

export function ErrorMessage({ error }: { error?: string }) {
  return error ? (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  ) : null;
}

// 本人だけに見える項目の目印
export function PrivateLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <Label htmlFor={htmlFor} className="text-muted-foreground">
      <LockIcon className="size-3.5" aria-hidden="true" />
      {children}
      <span className="sr-only">（本人だけに見えます）</span>
    </Label>
  );
}

type ObjectiveValues = {
  title: string;
  description: string;
  pillarId: string | null;
  ownerUserId: string | null;
  year: number;
  quarter: number;
};

export function ObjectiveForm({
  action,
  pillars,
  members,
  values,
  submitLabel,
  idPrefix,
}: {
  action: Action;
  pillars: Option[];
  members: Option[];
  values: ObjectiveValues;
  submitLabel: string;
  idPrefix: string;
}) {
  const [state, formAction, pending] = useOkrAction(action);
  const v = state.submitted;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className={fieldClassName}>
        <Label htmlFor={`${idPrefix}-title`}>Objective</Label>
        <Input id={`${idPrefix}-title`} name="title" defaultValue={v?.title ?? values.title} required placeholder="例：体型と見た目を整えて、自信を持って人と会える状態にする" />
      </div>
      <div className={fieldClassName}>
        <Label htmlFor={`${idPrefix}-description`}>説明（任意）</Label>
        <textarea id={`${idPrefix}-description`} name="description" defaultValue={v?.description ?? values.description} rows={2} className={controlClassName} />
      </div>
      <div className="flex flex-wrap gap-3">
        <div className={fieldClassName}>
          <Label htmlFor={`${idPrefix}-pillar`}>柱</Label>
          <select id={`${idPrefix}-pillar`} name="pillarId" defaultValue={v?.pillarId ?? values.pillarId ?? ""} className={controlClassName}>
            <option value="">なし</option>
            {pillars.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className={fieldClassName}>
          <Label htmlFor={`${idPrefix}-year`}>年</Label>
          <Input id={`${idPrefix}-year`} name="year" type="number" min={2000} max={2100} defaultValue={v?.year ?? values.year} className="w-24" />
        </div>
        <div className={fieldClassName}>
          <Label htmlFor={`${idPrefix}-quarter`}>四半期</Label>
          <select id={`${idPrefix}-quarter`} name="quarter" defaultValue={v?.quarter ?? String(values.quarter)} className={controlClassName}>
            <option value="1">Q1（1〜3月）</option>
            <option value="2">Q2（4〜6月）</option>
            <option value="3">Q3（7〜9月）</option>
            <option value="4">Q4（10〜12月）</option>
          </select>
        </div>
        <div className={fieldClassName}>
          <Label htmlFor={`${idPrefix}-owner`}>担当者</Label>
          <select id={`${idPrefix}-owner`} name="ownerUserId" defaultValue={v?.ownerUserId ?? values.ownerUserId ?? ""} className={controlClassName}>
            <option value="">未設定</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
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

type KeyResultValues = {
  title: string;
  kind: "manual" | "metric";
  manualProgress: number;
  startValue: number | null;
  targetValue: number | null;
  unit: string;
};

export function KeyResultForm({
  action,
  values,
  submitLabel,
  idPrefix,
}: {
  action: Action;
  values?: KeyResultValues;
  submitLabel: string;
  idPrefix: string;
}) {
  const [state, formAction, pending] = useOkrAction(action);
  const v = state.submitted;
  const [kind, setKind] = useState<"manual" | "metric">(values?.kind ?? "manual");

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className={`${fieldClassName} min-w-48 flex-1`}>
          <Label htmlFor={`${idPrefix}-title`}>Key Result</Label>
          <Input id={`${idPrefix}-title`} name="title" defaultValue={v?.title ?? values?.title} required placeholder="例：体重を 72kg から 69kg にする" />
        </div>
        <div className={fieldClassName}>
          <Label htmlFor={`${idPrefix}-kind`}>進捗の測り方</Label>
          <select
            id={`${idPrefix}-kind`}
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value === "metric" ? "metric" : "manual")}
            className={controlClassName}
          >
            <option value="manual">手入力（%）</option>
            <option value="metric">数値を記録</option>
          </select>
        </div>
      </div>
      {kind === "metric" ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className={`${fieldClassName} w-28`}>
            <Label htmlFor={`${idPrefix}-start`}>開始値</Label>
            <Input id={`${idPrefix}-start`} name="startValue" inputMode="decimal" defaultValue={v?.startValue ?? values?.startValue ?? ""} required placeholder="72.0" />
          </div>
          <div className={`${fieldClassName} w-28`}>
            <Label htmlFor={`${idPrefix}-target`}>目標値</Label>
            <Input id={`${idPrefix}-target`} name="targetValue" inputMode="decimal" defaultValue={v?.targetValue ?? values?.targetValue ?? ""} required placeholder="69.0" />
          </div>
          <div className={`${fieldClassName} w-24`}>
            <Label htmlFor={`${idPrefix}-unit`}>単位</Label>
            <Input id={`${idPrefix}-unit`} name="unit" defaultValue={v?.unit ?? values?.unit ?? ""} placeholder="kg" />
          </div>
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? "保存中…" : submitLabel}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <div className={`${fieldClassName} w-24`}>
            <Label htmlFor={`${idPrefix}-progress`}>進捗（%）</Label>
            <Input id={`${idPrefix}-progress`} name="progress" type="number" min={0} max={100} step={1} defaultValue={v?.progress ?? values?.manualProgress ?? 0} />
          </div>
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? "保存中…" : submitLabel}
          </Button>
        </div>
      )}
      <ErrorMessage error={state.error} />
    </form>
  );
}

export function MeasurementForm({
  action,
  today,
  unit,
  idPrefix,
}: {
  action: Action;
  today: string;
  unit: string;
  idPrefix: string;
}) {
  const [state, formAction, pending] = useOkrAction(action);
  const v = state.submitted;

  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" name="measuredOn" max={today} defaultValue={v?.measuredOn ?? today} aria-label="記録する日" className={controlClassName} />
        <Input name="value" inputMode="decimal" defaultValue={v?.value} required placeholder="値" aria-label="値" className="w-24" id={`${idPrefix}-value`} />
        {unit ? <span className="text-sm text-muted-foreground">{unit}</span> : null}
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          記録する
        </Button>
      </div>
      <ErrorMessage error={state.error} />
    </form>
  );
}

export function HabitForm({ action, idPrefix }: { action: Action; idPrefix: string }) {
  const [state, formAction, pending] = useOkrAction(action);
  const v = state.submitted;

  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Input name="title" defaultValue={v?.title} required placeholder="習慣を追加（例：筋トレ）" aria-label="習慣" className="min-w-48 flex-1" id={`${idPrefix}-title`} />
        <select name="timesPerWeek" defaultValue={v?.timesPerWeek ?? "3"} aria-label="週の回数" className={controlClassName}>
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <option key={n} value={n}>
              週{n}回
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          追加
        </Button>
      </div>
      <ErrorMessage error={state.error} />
    </form>
  );
}

const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];

// 今週の実施の記録。押すと付け外しする（今日より先の日は押せない）
export function HabitWeek({
  toggle,
  week,
  today,
  title,
}: {
  toggle: (date: string, done: boolean) => Promise<OkrFormState>;
  week: { date: string; done: boolean }[];
  today: string;
  title: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1" role="group" aria-label={`${title} の今週の実施`}>
        {week.map((d, i) => {
          const future = d.date > today;
          return (
            <button
              key={d.date}
              type="button"
              disabled={pending || future}
              aria-pressed={d.done}
              aria-label={`${WEEKDAYS[i]}曜日（${d.date}）${d.done ? "実施済み" : "未実施"}`}
              onClick={() =>
                startTransition(async () => {
                  const result = await toggle(d.date, !d.done);
                  setError(result.error);
                })
              }
              className={cn(
                "size-7 rounded-full border text-xs",
                d.done ? "border-primary bg-primary text-primary-foreground" : "border-input",
                future && "opacity-40",
              )}
            >
              {WEEKDAYS[i]}
            </button>
          );
        })}
      </div>
      <ErrorMessage error={error} />
    </div>
  );
}

// 「なぜ」の欄（本人だけ）。空にして保存すると消える
export function ReasonForm({ action, body, idPrefix, label }: { action: Action; body: string; idPrefix: string; label: string }) {
  const [state, formAction, pending] = useOkrAction(action);
  const v = state.submitted;

  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <PrivateLabel htmlFor={`${idPrefix}-reason`}>{label}</PrivateLabel>
      <textarea id={`${idPrefix}-reason`} name="body" defaultValue={v?.body ?? body} rows={2} className={controlClassName} placeholder="これを目指す理由" />
      <div className="flex items-center gap-2">
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          保存
        </Button>
        <ErrorMessage error={state.error} />
      </div>
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
