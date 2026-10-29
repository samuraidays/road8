import { Suspense } from "react";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, RepeatIcon } from "lucide-react";
import { MetricChart } from "@/components/metric-chart";
import { HabitForm, HabitWeek, KeyResultForm, MeasurementForm, ObjectiveForm, PrivateLabel, type Option } from "@/components/okr-forms";
import { PageSkeleton } from "@/components/page-skeleton";
import { TaskItem } from "@/components/task-list";
import { AddDialog, InlineText, QuickAdd, RowActions } from "@/components/ux";
import { listPillarOptions } from "@/lib/goals";
import { listMembers, memberLabel } from "@/lib/members";
import { listObjectives, summarizeQuarters, type KeyResult, type Objective } from "@/lib/okr";
import { parseYearQuarter } from "@/lib/okr-input";
import { currentYearQuarter, quarterMonths, todayInJapan } from "@/lib/period";
import { getGoogleStatus } from "@/lib/tasks";
import { requireTenant } from "@/lib/tenants";
import { cn } from "@/lib/utils";
import { createTask } from "../tasks/actions";
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
    <Suspense fallback={<PageSkeleton />}>
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

  const [objectives, quarters, members, pillars, google] = await Promise.all([
    listObjectives(context, view.year, view.quarter),
    summarizeQuarters(context, view.year),
    listMembers(context),
    listPillarOptions(context),
    getGoogleStatus(context.user.id),
  ]);
  const memberOptions: Option[] = members.map((m) => ({ id: m.userId, label: memberLabel(m, members) }));
  const pillarOptions: Option[] = pillars.map((p) => ({ id: p.id, label: p.title }));
  const tid = context.tenant.id;
  const isOwner = context.tenant.role === "owner";
  const today = todayInJapan();
  const shared = { tenantId: tid, pillars: pillarOptions, members: memberOptions, isOwner, today, googleConnected: google.connected };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">OKR</h1>
        <AddDialog label="Objective を追加" title={`Objective を追加（${view.year} Q${view.quarter}）`} variant="default">
          <ObjectiveForm
            action={createObjective.bind(null, tid)}
            pillars={pillarOptions}
            members={memberOptions}
            values={{ title: "", description: "", pillarId: null, ownerUserId: null, ...view }}
            submitLabel="追加"
            idPrefix="new-objective"
          />
        </AddDialog>
      </div>

      <nav aria-label="年と四半期" className="flex flex-wrap items-center gap-2">
        <Link href={okrHref(tid, { year: view.year - 1, quarter: view.quarter })} aria-label="前の年" className="rounded-md p-1 hover:bg-muted">
          <ChevronLeftIcon className="size-4" />
        </Link>
        <span className="font-medium tabular-nums">{view.year}年</span>
        <Link href={okrHref(tid, { year: view.year + 1, quarter: view.quarter })} aria-label="次の年" className="rounded-md p-1 hover:bg-muted">
          <ChevronRightIcon className="size-4" />
        </Link>
        <div className="ml-2 flex flex-wrap gap-1">
          {[1, 2, 3, 4].map((q) => {
            const selected = q === view.quarter;
            const isCurrent = view.year === current.year && q === current.quarter;
            const summary = quarters[q - 1];
            return (
              <Link
                key={q}
                href={okrHref(tid, { year: view.year, quarter: q })}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "rounded-full px-3 py-1 text-xs",
                  selected ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
                )}
              >
                Q{q}
                <span className="ml-1 opacity-70">{quarterMonths(q)}</span>
                {isCurrent ? <span className="ml-1">・今期</span> : null}
                {summary.score !== null ? <span className="ml-1">・{summary.score.toFixed(1)}</span> : summary.count > 0 ? <span className="ml-1">（{summary.count}）</span> : null}
              </Link>
            );
          })}
        </div>
      </nav>

      {objectives.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-10 text-center">
          <p className="font-medium">
            {view.year}年 Q{view.quarter}（{quarterMonths(view.quarter)}）の OKR を立てましょう
          </p>
          <p className="mt-1 text-sm text-muted-foreground">「Objective を追加」から、この四半期に目指すことを書きます。柱は「ゴール」の画面で作れます。</p>
        </div>
      ) : (
        objectives.map((o) => <ObjectiveCard key={o.id} objective={o} {...shared} />)
      )}
    </div>
  );
}

type Shared = {
  tenantId: string;
  pillars: Option[];
  members: Option[];
  isOwner: boolean;
  today: string;
  googleConnected: boolean;
};

function ObjectiveCard({ objective: o, tenantId, pillars, members, isOwner, today, googleConnected }: Shared & { objective: Objective }) {
  const pillar = pillars.find((p) => p.id === o.pillarId);
  const owner = members.find((m) => m.id === o.ownerUserId);

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-muted px-2 py-0.5">{pillar ? pillar.label : "柱なし"}</span>
            {members.length > 1 && owner ? <span>担当：{owner.label}</span> : null}
          </div>
          <h2 className="text-lg font-medium break-words">{o.title}</h2>
          {o.description ? <p className="text-sm break-words whitespace-pre-wrap text-muted-foreground">{o.description}</p> : null}
        </div>
        <RowActions
          label={`「${o.title}」の操作`}
          editTitle="Objective を編集"
          editForm={
            <ObjectiveForm
              action={updateObjective.bind(null, tenantId, o.id)}
              pillars={pillars}
              members={members}
              values={o}
              submitLabel="保存"
              idPrefix={`objective-${o.id}`}
            />
          }
          deleteTitle="Objective を削除しますか？"
          deleteDescription="Key Result・数値の記録・習慣・ひもづいたタスクもすべて消えます。元に戻せません。"
          deleteAction={isOwner ? deleteObjective.bind(null, tenantId, o.id) : undefined}
        />
      </div>

      <div className="flex flex-col gap-1">
        <PrivateLabel>なぜ この四半期にやるか（本人だけ）</PrivateLabel>
        <InlineText
          action={saveReason.bind(null, tenantId, { objectiveId: o.id })}
          name="body"
          value={o.reason}
          placeholder="クリックして、これを目指す理由を書く"
          label="なぜ"
        />
      </div>

      <ul className="flex flex-col divide-y">
        {o.keyResults.map((kr) => (
          <KeyResultItem key={kr.id} keyResult={kr} tenantId={tenantId} members={members} today={today} googleConnected={googleConnected} />
        ))}
      </ul>

      <AddDialog label="Key Result を追加" title="Key Result を追加" variant="ghost">
        <KeyResultForm action={createKeyResult.bind(null, tenantId, o.id)} submitLabel="追加" idPrefix={`new-kr-${o.id}`} />
      </AddDialog>
    </section>
  );
}

function formatValue(value: number | null, unit: string): string {
  return value === null ? "" : `${value}${unit}`;
}

function KeyResultItem({
  keyResult: kr,
  tenantId,
  members,
  today,
  googleConnected,
}: {
  keyResult: KeyResult;
  tenantId: string;
  members: Option[];
  today: string;
  googleConnected: boolean;
}) {
  const latest = kr.measurements.at(-1);
  const summary =
    kr.kind === "metric"
      ? `${latest ? formatValue(latest.value, kr.unit) : "未記録"} → ${formatValue(kr.targetValue, kr.unit)}`
      : `${kr.progress}%`;

  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="min-w-0 font-medium break-words">{kr.title}</span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {summary}
              {kr.kind === "metric" ? `（${kr.progress}%）` : null}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted" role="progressbar" aria-valuenow={kr.progress} aria-valuemin={0} aria-valuemax={100} aria-label={kr.title}>
            <div className="h-1.5 rounded-full bg-progress" style={{ width: `${kr.progress}%` }} />
          </div>
        </div>
        <RowActions
          label={`「${kr.title}」の操作`}
          editTitle="Key Result を編集"
          editForm={<KeyResultForm action={updateKeyResult.bind(null, tenantId, kr.id)} values={kr} submitLabel="保存" idPrefix={`kr-${kr.id}`} />}
          deleteTitle="Key Result を削除しますか？"
          deleteDescription="数値の記録・習慣・ひもづいたタスクも消えます。元に戻せません。"
          deleteAction={deleteKeyResult.bind(null, tenantId, kr.id)}
        />
      </div>

      {kr.kind === "metric" && kr.startValue !== null && kr.targetValue !== null ? (
        <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3">
          <MetricChart measurements={kr.measurements} startValue={kr.startValue} targetValue={kr.targetValue} unit={kr.unit} />
          <MeasurementForm action={recordMeasurement.bind(null, tenantId, kr.id)} today={today} unit={kr.unit} idPrefix={`measure-${kr.id}`} />
        </div>
      ) : null}

      {kr.habits.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {kr.habits.map((h) => {
            const done = h.week.filter((d) => d.done).length;
            return (
              <li key={h.id} className="flex flex-wrap items-center gap-3 text-sm">
                <RepeatIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 break-words">
                  {h.title}
                  <span className="ml-2 text-xs text-muted-foreground">週{h.timesPerWeek}回</span>
                </span>
                <span className={cn("text-xs tabular-nums", done >= h.timesPerWeek ? "text-progress" : "text-muted-foreground")}>
                  {done}/{h.timesPerWeek}
                </span>
                <HabitWeek toggle={toggleHabitCheck.bind(null, tenantId, h.id)} week={h.week} today={today} title={h.title} />
                <RowActions
                  label={`習慣「${h.title}」の操作`}
                  deleteTitle="習慣を削除しますか？"
                  deleteDescription="実施の記録も消えます。"
                  deleteAction={deleteHabit.bind(null, tenantId, h.id)}
                />
              </li>
            );
          })}
        </ul>
      ) : null}

      {kr.tasks.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {kr.tasks.map((t) => (
            <TaskItem key={t.id} tenantId={tenantId} task={t} members={members} googleConnected={googleConnected} />
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-56 flex-1">
          <QuickAdd action={createTask.bind(null, tenantId, kr.id)} placeholder="タスクを追加（Enter で作成）" label={`「${kr.title}」にタスクを追加`} />
        </div>
        <AddDialog label="習慣" title="習慣を追加" variant="ghost">
          <HabitForm action={createHabit.bind(null, tenantId, kr.id)} idPrefix={`habit-${kr.id}`} />
        </AddDialog>
      </div>
    </li>
  );
}
