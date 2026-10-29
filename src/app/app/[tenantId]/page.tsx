import { Suspense } from "react";
import Link from "next/link";
import { RepeatIcon } from "lucide-react";
import { HabitWeek, type Option } from "@/components/okr-forms";
import { PageSkeleton } from "@/components/page-skeleton";
import { TaskItem } from "@/components/task-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listMembers, memberLabel } from "@/lib/members";
import { listObjectives } from "@/lib/okr";
import { addDays, currentWeekDates, currentYearQuarter, quarterMonths, splitJapanDateTime, todayInJapan } from "@/lib/period";
import { getWeeklyFocus } from "@/lib/reviews";
import { getGoogleStatus, listTasks, type TaskWithContext } from "@/lib/tasks";
import { requireTenant } from "@/lib/tenants";
import { cn } from "@/lib/utils";
import { toggleHabitCheck } from "./okr/actions";

// ホーム「今日」（設計書 §11）：今週のフォーカス・今日のタスク・今週の習慣・今期の Key Result
export default function TodayPage({ params }: PageProps<"/app/[tenantId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Today params={params} />
    </Suspense>
  );
}

const DATE_LABEL = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "long", day: "numeric", weekday: "short" });

// 今日のタスク：やる日時が今日以前（未完了）、または期日が3日以内（期日切れを含む）
function isForToday(t: TaskWithContext, today: string): boolean {
  const scheduledDay = t.scheduledStart ? splitJapanDateTime(t.scheduledStart).date : null;
  return (scheduledDay !== null && scheduledDay <= today) || (t.dueDate !== null && t.dueDate <= addDays(today, 3));
}

async function Today({ params }: Pick<PageProps<"/app/[tenantId]">, "params">) {
  const { tenantId } = await params;
  const context = await requireTenant(tenantId);
  const { year, quarter } = currentYearQuarter();
  const today = todayInJapan();
  const thisWeek = currentWeekDates();
  const [objectives, tasks, focus, members, google] = await Promise.all([
    listObjectives(context, year, quarter),
    listTasks(context),
    getWeeklyFocus(context, addDays(thisWeek[0], -7)),
    listMembers(context),
    getGoogleStatus(context.user.id),
  ]);
  const tid = context.tenant.id;
  const memberOptions: Option[] = members.map((m) => ({ id: m.userId, label: memberLabel(m, members) }));
  const todayTasks = tasks.open.filter((t) => isForToday(t, today));
  const keyResults = objectives.flatMap((o) => o.keyResults);
  const habits = keyResults.flatMap((kr) => kr.habits);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-sm text-muted-foreground">
          {DATE_LABEL.format(new Date())}・{year} Q{quarter}（{quarterMonths(quarter)}）
        </p>
        <h1 className="text-2xl font-semibold">今日やること</h1>
      </div>

      <section className="rounded-xl bg-muted/60 px-5 py-4">
        <h2 className="mb-2 text-xs text-muted-foreground">今週のフォーカス</h2>
        {focus ? (
          <p className="text-sm leading-7 whitespace-pre-wrap">{focus}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            先週の振り返りで「来週やる3つ」を書くと、ここに出ます。
            <Link href={`/app/${tid}/reviews/weekly?week=${addDays(thisWeek[0], -7)}`} className="ml-1 underline">
              先週を振り返る
            </Link>
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>タスク（{todayTasks.length}）</CardTitle>
          </CardHeader>
          <CardContent>
            {todayTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                今日やるタスクはありません。
                <Link href={`/app/${tid}/tasks`} className="ml-1 underline">
                  タスクを見る
                </Link>
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {todayTasks.map((t) => (
                  <TaskItem key={t.id} tenantId={tid} task={t} members={memberOptions} googleConnected={google.connected} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>習慣（今週）</CardTitle>
          </CardHeader>
          <CardContent>
            {habits.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                習慣はまだありません。
                <Link href={`/app/${tid}/okr`} className="ml-1 underline">
                  OKR の Key Result から追加する
                </Link>
              </p>
            ) : (
              <ul className="flex flex-col gap-4">
                {habits.map((h) => {
                  const done = h.week.filter((d) => d.done).length;
                  return (
                    <li key={h.id} className="flex flex-col gap-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5 break-words">
                          <RepeatIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          {h.title}
                        </span>
                        <span className={cn("shrink-0 text-xs tabular-nums", done >= h.timesPerWeek ? "text-progress" : "text-muted-foreground")}>
                          {done} / {h.timesPerWeek}
                        </span>
                      </div>
                      <HabitWeek toggle={toggleHabitCheck.bind(null, tid, h.id)} week={h.week} today={today} title={h.title} />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs text-muted-foreground">今期の Key Result</h2>
        {keyResults.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            今期の OKR はまだありません。
            <Link href={`/app/${tid}/okr`} className="ml-1 underline">
              OKR を作る
            </Link>
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {keyResults.map((kr) => (
              <li key={kr.id} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="min-w-0 break-words">{kr.title}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{kr.progress}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted" role="progressbar" aria-valuenow={kr.progress} aria-valuemin={0} aria-valuemax={100} aria-label={kr.title}>
                  <div className="h-1.5 rounded-full bg-progress" style={{ width: `${kr.progress}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
