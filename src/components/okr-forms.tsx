"use client";

import { startTransition, useActionState, useOptimistic, useState } from "react";
import { LockIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ErrorText, useFormAction, type ActionResult, type FormAction } from "@/components/ux";
import { cn } from "@/lib/utils";

export type Option = { id: string; label: string };

const fieldClassName = "flex flex-col gap-1.5";
export const controlClassName = "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm";

// 以前の名前のまま使っている画面のため
export const ErrorMessage = ErrorText;

// 本人だけに見える項目の目印
export function PrivateLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <Label htmlFor={htmlFor} className="text-xs font-normal text-muted-foreground">
      <LockIcon className="size-3" aria-hidden="true" />
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

// Objective の入力（ダイアログの中で使う）
export function ObjectiveForm({
  action,
  pillars,
  members,
  values,
  submitLabel,
  idPrefix,
}: {
  action: FormAction;
  pillars: Option[];
  members: Option[];
  values: ObjectiveValues;
  submitLabel: string;
  idPrefix: string;
}) {
  const [state, formAction, pending] = useFormAction(action);
  const v = state.submitted;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className={fieldClassName}>
        <Label htmlFor={`${idPrefix}-title`}>Objective</Label>
        <Input id={`${idPrefix}-title`} name="title" defaultValue={v?.title ?? values.title} required autoFocus placeholder="体型と見た目を整えて、自信を持って人と会える状態にする" />
      </div>
      <div className="flex flex-wrap gap-4">
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
          <Label htmlFor={`${idPrefix}-quarter`}>四半期</Label>
          <div className="flex gap-2">
            <Input id={`${idPrefix}-year`} name="year" type="number" min={2000} max={2100} defaultValue={v?.year ?? values.year} aria-label="年" className="w-20" />
            <select id={`${idPrefix}-quarter`} name="quarter" defaultValue={v?.quarter ?? String(values.quarter)} className={controlClassName}>
              <option value="1">Q1（1〜3月）</option>
              <option value="2">Q2（4〜6月）</option>
              <option value="3">Q3（7〜9月）</option>
              <option value="4">Q4（10〜12月）</option>
            </select>
          </div>
        </div>
        {members.length > 1 ? (
          <div className={fieldClassName}>
            <Label htmlFor={`${idPrefix}-owner`}>担当者</Label>
            <select id={`${idPrefix}-owner`} name="ownerUserId" defaultValue={v?.ownerUserId ?? values.ownerUserId ?? ""} className={controlClassName}>
              <option value="">なし</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          // ひとりで使っているときは担当者を選ばせない（自分が担当）
          <input type="hidden" name="ownerUserId" value={members[0]?.id ?? ""} />
        )}
      </div>
      <div className={fieldClassName}>
        <Label htmlFor={`${idPrefix}-description`}>説明（任意）</Label>
        <Textarea id={`${idPrefix}-description`} name="description" defaultValue={v?.description ?? values.description} rows={2} />
      </div>
      <ErrorText error={state.error} />
      <Button type="submit" disabled={pending} className="self-end">
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

// Key Result の入力（ダイアログの中で使う）。進捗を「数値で記録する」か「％で手入力する」かを選ぶ
export function KeyResultForm({
  action,
  values,
  submitLabel,
  idPrefix,
}: {
  action: FormAction;
  values?: KeyResultValues;
  submitLabel: string;
  idPrefix: string;
}) {
  const [state, formAction, pending] = useFormAction(action);
  const v = state.submitted;
  const [kind, setKind] = useState<"manual" | "metric">(values?.kind ?? "metric");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className={fieldClassName}>
        <Label htmlFor={`${idPrefix}-title`}>Key Result</Label>
        <Input id={`${idPrefix}-title`} name="title" defaultValue={v?.title ?? values?.title} required autoFocus placeholder="体重を 72kg から 69kg にする" />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">進捗の測り方</legend>
        <input type="hidden" name="kind" value={kind} />
        <div className="flex gap-2" role="radiogroup">
          {(
            [
              ["metric", "数値を記録する（体重・本数など）"],
              ["manual", "％で手入力する"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={kind === value}
              onClick={() => setKind(value)}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-left text-sm",
                kind === value ? "border-foreground bg-muted font-medium" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      {kind === "metric" ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className={`${fieldClassName} w-28`}>
            <Label htmlFor={`${idPrefix}-start`}>今の値</Label>
            <Input id={`${idPrefix}-start`} name="startValue" inputMode="decimal" defaultValue={v?.startValue ?? values?.startValue ?? ""} required placeholder="72.0" />
          </div>
          <span className="pb-2 text-muted-foreground">→</span>
          <div className={`${fieldClassName} w-28`}>
            <Label htmlFor={`${idPrefix}-target`}>目標</Label>
            <Input id={`${idPrefix}-target`} name="targetValue" inputMode="decimal" defaultValue={v?.targetValue ?? values?.targetValue ?? ""} required placeholder="69.0" />
          </div>
          <div className={`${fieldClassName} w-24`}>
            <Label htmlFor={`${idPrefix}-unit`}>単位</Label>
            <Input id={`${idPrefix}-unit`} name="unit" defaultValue={v?.unit ?? values?.unit ?? ""} placeholder="kg" />
          </div>
        </div>
      ) : (
        <div className={`${fieldClassName} w-28`}>
          <Label htmlFor={`${idPrefix}-progress`}>進捗（%）</Label>
          <Input id={`${idPrefix}-progress`} name="progress" type="number" min={0} max={100} step={1} defaultValue={v?.progress ?? values?.manualProgress ?? 0} />
        </div>
      )}
      <ErrorText error={state.error} />
      <Button type="submit" disabled={pending} className="self-end">
        {pending ? "保存中…" : submitLabel}
      </Button>
    </form>
  );
}

// 数値の記録（KR の下にそのまま出す）。今日の日付が入っていて、値を入れて Enter で記録する
export function MeasurementForm({ action, today, unit, idPrefix }: { action: FormAction; today: string; unit: string; idPrefix: string }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(async (prev, formData) => {
    const result = await action(prev, formData);
    if (!result.error) {
      toast.success("記録しました");
    }
    return result;
  }, {});

  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" name="measuredOn" max={today} defaultValue={today} aria-label="記録する日" className={controlClassName} />
        <Input name="value" inputMode="decimal" required placeholder="今日の値" aria-label="値" className="w-28" id={`${idPrefix}-value`} />
        {unit ? <span className="text-sm text-muted-foreground">{unit}</span> : null}
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          記録
        </Button>
      </div>
      <ErrorText error={state.error} />
    </form>
  );
}

// 習慣の追加（ダイアログの中で使う）
export function HabitForm({ action, idPrefix }: { action: FormAction; idPrefix: string }) {
  const [state, formAction, pending] = useFormAction(action, "習慣を追加しました");
  const v = state.submitted;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className={fieldClassName}>
        <Label htmlFor={`${idPrefix}-title`}>習慣</Label>
        <Input id={`${idPrefix}-title`} name="title" defaultValue={v?.title} required autoFocus placeholder="筋トレ" />
      </div>
      <div className={fieldClassName}>
        <Label htmlFor={`${idPrefix}-times`}>週に何回</Label>
        <select id={`${idPrefix}-times`} name="timesPerWeek" defaultValue={v?.timesPerWeek ?? "3"} className={`${controlClassName} w-28`}>
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <option key={n} value={n}>
              週{n}回
            </option>
          ))}
        </select>
      </div>
      <ErrorText error={state.error} />
      <Button type="submit" disabled={pending} className="self-end">
        {pending ? "追加中…" : "追加"}
      </Button>
    </form>
  );
}

const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];

// 今週の実施の記録。押した瞬間に画面へ反映し、保存は裏で行う（今日より先の日は押せない）
export function HabitWeek({
  toggle,
  week,
  today,
  title,
}: {
  toggle: (date: string, done: boolean) => Promise<ActionResult>;
  week: { date: string; done: boolean }[];
  today: string;
  title: string;
}) {
  const [optimisticWeek, setOptimisticWeek] = useOptimistic(week, (current, date: string) =>
    current.map((d) => (d.date === date ? { ...d, done: !d.done } : d)),
  );

  return (
    <div className="flex gap-1" role="group" aria-label={`${title} の今週の実施`}>
      {optimisticWeek.map((d, i) => {
        const future = d.date > today;
        return (
          <button
            key={d.date}
            type="button"
            disabled={future}
            aria-pressed={d.done}
            aria-label={`${WEEKDAYS[i]}曜日（${d.date}）${d.done ? "実施済み" : "未実施"}`}
            onClick={() =>
              startTransition(async () => {
                setOptimisticWeek(d.date);
                const result = await toggle(d.date, !d.done);
                if (result.error) {
                  toast.error(result.error);
                }
              })
            }
            className={cn(
              "size-7 rounded-full border text-xs transition-colors",
              d.done ? "border-progress bg-progress text-progress-foreground" : "border-input hover:bg-muted",
              d.date === today && !d.done && "border-foreground",
              future && "opacity-30",
            )}
          >
            {WEEKDAYS[i]}
          </button>
        );
      })}
    </div>
  );
}
