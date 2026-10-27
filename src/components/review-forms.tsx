"use client";

import { useActionState } from "react";
import type { ReviewFormState } from "@/app/app/[tenantId]/reviews/actions";
import { controlClassName, ErrorMessage, PrivateLabel } from "@/components/okr-forms";
import { Button } from "@/components/ui/button";

type Action = (prev: ReviewFormState, formData: FormData) => Promise<ReviewFormState>;

function Message({ message }: { message?: string }) {
  return message ? (
    <p role="status" className="text-sm text-muted-foreground">
      {message}
    </p>
  ) : null;
}

function TextField({ name, label, value, placeholder }: { name: string; label: string; value: string; placeholder: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <PrivateLabel htmlFor={`review-${name}`}>{label}</PrivateLabel>
      <textarea id={`review-${name}`} name={name} defaultValue={value} rows={3} placeholder={placeholder} className={controlClassName} />
    </div>
  );
}

export function WeeklyReviewForm({
  action,
  values,
}: {
  action: Action;
  values: { wentWell: string; wentWrong: string; nextFocus: string };
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <TextField name="wentWell" label="うまくいったこと" value={values.wentWell} placeholder="記事を1本出せた。朝の30分メモが続いている" />
      <TextField name="wentWrong" label="うまくいかなかったこと・理由" value={values.wentWrong} placeholder="筋トレが1回だけ。平日夜に予定を入れていなかった" />
      <TextField name="nextFocus" label="来週やる3つ" value={values.nextFocus} placeholder={"筋トレを火・木・土の朝に入れる\n記事の下書きを日曜に書く\n…"} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "保存中…" : "振り返りを保存"}
        </Button>
        <Message message={state.message} />
        <ErrorMessage error={state.error} />
      </div>
    </form>
  );
}

export function QuarterlyReviewForm({ action, values }: { action: Action; values: { learned: string; nextSteps: string } }) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <TextField name="learned" label="この四半期で学んだこと" value={values.learned} placeholder="記事は締め切りを予定に入れると書ける" />
      <TextField name="nextSteps" label="次の四半期に向けて" value={values.nextSteps} placeholder="登壇は応募だけ済ませる KR に変える" />
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "保存中…" : "保存"}
        </Button>
        <Message message={state.message} />
        <ErrorMessage error={state.error} />
      </div>
    </form>
  );
}

export type ScoreRow = {
  id: string;
  objectiveTitle: string;
  title: string;
  progress: number;
  score: number | null;
  nextAction: "continue" | "stop" | "change" | null;
};

const SCORES = ["0.0", "0.1", "0.2", "0.3", "0.4", "0.5", "0.6", "0.7", "0.8", "0.9", "1.0"];

// KR の採点（メンバーに見える）。未採点なら進捗から出した候補を表示する（選ぶまで採点は付かない）
export function ScoreForm({ action, rows }: { action: Action; rows: ScoreRow[] }) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y">
        {rows.map((r) => {
          const suggested = (Math.round(r.progress / 10) / 10).toFixed(1);
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className="min-w-48 flex-1 break-words">
                <span className="text-muted-foreground">{r.objectiveTitle} ／ </span>
                {r.title}
                <span className="ml-2 text-xs text-muted-foreground">進捗 {r.progress}%</span>
              </span>
              <select name={`score:${r.id}`} defaultValue={r.score === null ? "" : r.score.toFixed(1)} aria-label={`${r.title} の採点`} className={controlClassName}>
                {/* 未採点のまま保存しても採点は付かない。進捗から出した候補を見出しに出す */}
                <option value="">未採点（候補 {suggested}）</option>
                {SCORES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select name={`next:${r.id}`} defaultValue={r.nextAction ?? ""} aria-label={`${r.title} の次の扱い`} className={controlClassName}>
                <option value="">次の扱い</option>
                <option value="continue">続ける</option>
                <option value="change">変える</option>
                <option value="stop">やめる</option>
              </select>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "保存中…" : "採点を保存"}
        </Button>
        <Message message={state.message} />
        <ErrorMessage error={state.error} />
      </div>
    </form>
  );
}

export function CarryOverButton({ action, label }: { action: Action; label: string }) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm("「続ける」「変える」にした Key Result を、次の四半期の Objective として作ります。よろしいですか？")) {
          e.preventDefault();
        }
      }}
      className="flex flex-col items-start gap-1"
    >
      <Button type="submit" disabled={pending}>
        {pending ? "作成中…" : label}
      </Button>
      <Message message={state.message} />
      <ErrorMessage error={state.error} />
    </form>
  );
}
