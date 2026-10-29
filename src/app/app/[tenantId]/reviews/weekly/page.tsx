import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, LockIcon } from "lucide-react";
import { WeeklyReviewForm } from "@/components/review-forms";
import { ReviewTabs } from "@/components/review-tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { parseDate } from "@/lib/okr-input";
import { addDays, currentWeekDates, formatWeek, mondayOf } from "@/lib/period";
import { getWeeklyReview } from "@/lib/reviews";
import { requireTenant } from "@/lib/tenants";
import { saveWeeklyReview } from "../actions";

export default function WeeklyReviewPage({ params, searchParams }: PageProps<"/app/[tenantId]/reviews/weekly">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <WeeklyReview params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

async function WeeklyReview({ params, searchParams }: Pick<PageProps<"/app/[tenantId]/reviews/weekly">, "params" | "searchParams">) {
  const [{ tenantId }, query] = await Promise.all([params, searchParams]);
  const context = await requireTenant(tenantId);
  const thisWeek = currentWeekDates()[0];
  // 表示する週は URL から（その日を含む週の月曜日に直す）。正しくないか未来なら今週
  const requested = parseDate(String(query.week ?? ""));
  const weekStart = requested.ok && mondayOf(requested.value) <= thisWeek ? mondayOf(requested.value) : thisWeek;
  const review = await getWeeklyReview(context, weekStart);
  const tid = context.tenant.id;

  const habitDone = review.habits.reduce((sum, h) => sum + Math.min(h.done, h.target), 0);
  const habitTarget = review.habits.reduce((sum, h) => sum + h.target, 0);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">振り返り</h1>
      <ReviewTabs tenantId={tid} current="weekly" />

      <nav aria-label="週の切り替え" className="flex items-center gap-2">
        <Link href={`/app/${tid}/reviews/weekly?week=${addDays(weekStart, -7)}`} aria-label="前の週" className="rounded-md p-1 hover:bg-muted">
          <ChevronLeftIcon className="size-4" />
        </Link>
        <span className="font-medium">
          {weekStart.slice(0, 4)}年 {formatWeek(weekStart)}
          {weekStart === thisWeek ? "（今週）" : ""}
        </span>
        {weekStart < thisWeek ? (
          <Link href={`/app/${tid}/reviews/weekly?week=${addDays(weekStart, 7)}`} aria-label="次の週" className="rounded-md p-1 hover:bg-muted">
            <ChevronRightIcon className="size-4" />
          </Link>
        ) : null}
      </nav>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm font-normal text-muted-foreground">習慣の達成</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-2xl font-medium tabular-nums">{habitTarget === 0 ? "—" : `${habitDone} / ${habitTarget}`}</p>
            <ul className="flex flex-col gap-1 text-sm">
              {review.habits.map((h, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className="min-w-0 break-words">{h.title}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {h.done}/{h.target}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm font-normal text-muted-foreground">数値の変化（この週の記録）</CardTitle>
          </CardHeader>
          <CardContent>
            {review.metrics.length === 0 ? (
              <p className="text-sm text-muted-foreground">この週の記録はありません</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {review.metrics.map((m, i) => {
                  const diff = m.last - m.first;
                  return (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="min-w-0 break-words">{m.title}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatNumber(m.last)}
                        {m.unit}（{diff > 0 ? "+" : ""}
                        {formatNumber(diff)}）
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <LockIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            この週を振り返る
          </CardTitle>
          <p className="text-sm text-muted-foreground">ここに書いたことは本人だけに見えます（同じテナントの Owner にも見えません）。</p>
        </CardHeader>
        <CardContent>
          <WeeklyReviewForm
            key={`${weekStart}:${review.wentWell}:${review.wentWrong}:${review.nextFocus}`}
            action={saveWeeklyReview.bind(null, tid, weekStart)}
            values={review}
          />
        </CardContent>
      </Card>
    </div>
  );
}
