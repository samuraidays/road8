import { Suspense } from "react";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, RepeatIcon } from "lucide-react";
import { MetricChart } from "@/components/metric-chart";
import {
  DeleteButton,
  HabitForm,
  HabitWeek,
  KeyResultForm,
  MeasurementForm,
  ObjectiveForm,
  ReasonForm,
  type Option,
} from "@/components/okr-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listPillarOptions } from "@/lib/goals";
import { listMembers, memberLabel } from "@/lib/members";
import { listObjectives, summarizeQuarters, type KeyResult, type Objective } from "@/lib/okr";
import { parseYearQuarter } from "@/lib/okr-input";
import { currentYearQuarter, quarterMonths, todayInJapan } from "@/lib/period";
import { requireTenant } from "@/lib/tenants";
import { cn } from "@/lib/utils";
import {
  createHabit,
  createKeyResult,
  createObjective,
  deleteHabit,
  deleteKeyResult,
  deleteObjective,
  recordMeasurement,
  saveReason,
  toggleHabitCheck,
  updateKeyResult,
  updateObjective,
} from "./actions";

export default function OkrPage({ params, searchParams }: PageProps<"/app/[tenantId]/okr">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">読み込み中…</p>}>
      <Okr params={params} searchParams={searchParams} />
    </Suspense>
  );
}

type View = { year: number; quarter: number };

function okrHref(tenantId: string, { year, quarter }: View): string {
  return `/app/${tenantId}/okr?year=${year}&q=${quarter}`;
}

async function Okr({ params, searchParams }: Pick<PageProps<"/app/[tenantId]/okr">, "params" | "searchParams">) {
  const [{ tenantId }, query] = await Promise.all([params, searchParams]);
  const context = await requireTenant(tenantId);
  const current = currentYearQuarter();
  // 表示する年と四半期は URL から。正しくなければ今期を出す
  const requested = parseYearQuarter(String(query.year ?? ""), String(query.q ?? ""));
  const view: View = requested.ok ? requested.value : current;

  const [objectives, quarters, members, pillars] = await Promise.all([
    listObjectives(context, view.year, view.quarter),
    summarizeQuarters(context, view.year),
    listMembers(context),
    listPillarOptions(context),
  ]);
  const memberOptions: Option[] = members.map((m) => ({ id: m.userId, label: memberLabel(m, members) }));
  const pillarOptions: Option[] = pillars.map((p) => ({ id: p.id, label: p.title }));
  const tid = context.tenant.id;
  const isOwner = context.tenant.role === "owner";
  const today = todayInJapan();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">OKR</h1>

      <nav aria-label="年と四半期" className="flex flex-wrap items-center gap-2">
        <Link href={okrHref(tid, { year: view.year - 1, quarter: view.quarter })} aria-label="前の年" className="rounded-md p-1 hover:bg-muted">
          <ChevronLeftIcon className="size-4" />
        </Link>
        <span className="font-medium">{view.year}年</span>
        <Link href={okrHref(tid, { year: view.year + 1, quarter: view.quarter })} aria-label="次の年" className="rounded-md p-1 hover:bg-muted">
          <ChevronRightIcon className="size-4" />
        </Link>
        <span className="flex-1" />
        {[1, 2, 3, 4].map((q) => {
          const selected = q === view.quarter;
          const isCurrent = view.year === current.year && q === current.quarter;
          const ended = view.year < current.year || (view.year === current.year && q < current.quarter);
          return (
            <Link
              key={q}
              href={okrHref(tid, { year: view.year, quarter: q })}
              aria-current={selected ? "page" : undefined}
              className={cn(
                "rounded-md px-2 py-1 text-xs",
                selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              Q{q} {quarterMonths(q)}
              {isCurrent ? "・進行中" : ended ? "・終了" : ""}（{quarters[q - 1].count}）
              {quarters[q - 1].score !== null ? ` ${quarters[q - 1].score?.toFixed(1)}` : ""}
            </Link>
          );
        })}
      </nav>

      {objectives.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {view.year}年 Q{view.quarter}（{quarterMonths(view.quarter)}）の Objective はまだありません。
        </p>
      ) : (
        objectives.map((o) => (
          <ObjectiveCard
            key={o.id}
            tenantId={tid}
            objective={o}
            pillars={pillarOptions}
            members={memberOptions}
            isOwner={isOwner}
            today={today}
          />
        ))
      )}

      <Card>
        <CardHeader>
          <CardTitle>Objective を作る</CardTitle>
          <CardDescription>柱がまだなければ、先に「ゴール」の画面で作ってください。</CardDescription>
        </CardHeader>
        <CardContent>
          <ObjectiveForm
            action={createObjective.bind(null, tid)}
            pillars={pillarOptions}
            members={memberOptions}
            values={{ title: "", description: "", pillarId: null, ownerUserId: null, ...view }}
            submitLabel="作成する"
            idPrefix="new-objective"
          />
        </CardContent>
      </Card>
    </div>
  );
}

function ObjectiveCard({
  tenantId,
  objective: o,
  pillars,
  members,
  isOwner,
  today,
}: {
  tenantId: string;
  objective: Objective;
  pillars: Option[];
  members: Option[];
  isOwner: boolean;
  today: string;
}) {
  const owner = members.find((m) => m.id === o.ownerUserId);
  const pillar = pillars.find((p) => p.id === o.pillarId);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{pillar ? pillar.label : "柱なし"}</span>
          <span className="text-xs text-muted-foreground">
            {o.year} Q{o.quarter}（{quarterMonths(o.quarter)}）
          </span>
        </div>
        <CardTitle className="break-words">{o.title}</CardTitle>
        <CardDescription>担当：{owner ? owner.label : "未設定"}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {o.description ? <p className="text-sm break-words whitespace-pre-wrap">{o.description}</p> : null}

        <ReasonForm
          key={o.reason}
          action={saveReason.bind(null, tenantId, { objectiveId: o.id })}
          body={o.reason}
          idPrefix={`objective-${o.id}`}
          label="なぜ この四半期にやるか（本人だけ）"
        />

        <ul className="flex flex-col gap-5">
          {o.keyResults.map((kr) => (
            <KeyResultItem key={kr.id} tenantId={tenantId} keyResult={kr} today={today} />
          ))}
        </ul>

        <div className="rounded-lg border border-dashed p-3">
          <KeyResultForm action={createKeyResult.bind(null, tenantId, o.id)} submitLabel="Key Result を追加" idPrefix={`new-kr-${o.id}`} />
        </div>

        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Objective を編集</summary>
          <div className="mt-3 flex flex-col gap-3">
            <ObjectiveForm
              key={JSON.stringify([o.title, o.description, o.pillarId, o.ownerUserId, o.year, o.quarter])}
              action={updateObjective.bind(null, tenantId, o.id)}
              pillars={pillars}
              members={members}
              values={o}
              submitLabel="保存"
              idPrefix={`objective-${o.id}`}
            />
            {isOwner ? (
              <DeleteButton
                action={deleteObjective.bind(null, tenantId, o.id)}
                label="Objective を削除"
                confirmMessage="この Objective と、紐づく Key Result・数値の記録・習慣・タスクをすべて削除します。よろしいですか？"
              />
            ) : null}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function formatValue(value: number | null, unit: string): string {
  return value === null ? "" : `${value}${unit}`;
}

function KeyResultItem({ tenantId, keyResult: kr, today }: { tenantId: string; keyResult: KeyResult; today: string }) {
  const latest = kr.measurements.at(-1);
  const summary =
    kr.kind === "metric"
      ? `${latest ? formatValue(latest.value, kr.unit) : "未記録"} / 目標 ${formatValue(kr.targetValue, kr.unit)}（${kr.progress}%）`
      : `${kr.progress}%`;

  return (
    <li className="flex flex-col gap-2 border-t pt-4">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="min-w-0 font-medium break-words">{kr.title}</span>
        <span className="shrink-0 text-muted-foreground tabular-nums">{summary}</span>
      </div>
      <div className="h-2 rounded-full bg-muted" role="progressbar" aria-valuenow={kr.progress} aria-valuemin={0} aria-valuemax={100} aria-label={kr.title}>
        <div className="h-2 rounded-full bg-primary" style={{ width: `${kr.progress}%` }} />
      </div>

      {kr.kind === "metric" && kr.startValue !== null && kr.targetValue !== null ? (
        <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">
            数値の記録（開始 {formatValue(kr.startValue, kr.unit)} → 目標 {formatValue(kr.targetValue, kr.unit)}）
          </p>
          <MetricChart measurements={kr.measurements} startValue={kr.startValue} targetValue={kr.targetValue} unit={kr.unit} />
          <MeasurementForm action={recordMeasurement.bind(null, tenantId, kr.id)} today={today} unit={kr.unit} idPrefix={`measure-${kr.id}`} />
        </div>
      ) : null}

      <ul className="flex flex-col gap-2 pl-3">
        {kr.habits.map((h) => {
          const doneCount = h.week.filter((d) => d.done).length;
          return (
            <li key={h.id} className="flex flex-wrap items-center gap-2 text-sm">
              <RepeatIcon className="size-4 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 break-words">
                習慣：{h.title}（週{h.timesPerWeek}回）
              </span>
              <span className={cn("text-xs tabular-nums", doneCount >= h.timesPerWeek ? "text-green-700 dark:text-green-400" : "text-muted-foreground")}>
                今週 {doneCount}/{h.timesPerWeek}
              </span>
              <HabitWeek toggle={toggleHabitCheck.bind(null, tenantId, h.id)} week={h.week} today={today} title={h.title} />
            </li>
          );
        })}
      </ul>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">習慣を追加・Key Result を編集</summary>
        <div className="mt-2 flex flex-col gap-3">
          <HabitForm action={createHabit.bind(null, tenantId, kr.id)} idPrefix={`habit-${kr.id}`} />
          {kr.habits.map((h) => (
            <DeleteButton
              key={h.id}
              action={deleteHabit.bind(null, tenantId, h.id)}
              label={`習慣「${h.title}」を削除`}
              confirmMessage="この習慣と、実施の記録を削除します。よろしいですか？"
            />
          ))}
          <KeyResultForm
            key={JSON.stringify([kr.title, kr.kind, kr.manualProgress, kr.startValue, kr.targetValue, kr.unit])}
            action={updateKeyResult.bind(null, tenantId, kr.id)}
            values={kr}
            submitLabel="保存"
            idPrefix={`kr-${kr.id}`}
          />
          <DeleteButton
            action={deleteKeyResult.bind(null, tenantId, kr.id)}
            label="Key Result を削除"
            confirmMessage="この Key Result と、紐づく数値の記録・習慣・タスクを削除します。よろしいですか？"
          />
        </div>
      </details>
    </li>
  );
}
