import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, LockIcon } from "lucide-react";
import { CarryOverButton, QuarterlyReviewForm, ScoreForm, type ScoreRow } from "@/components/review-forms";
import { ReviewTabs } from "@/components/review-tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listObjectives } from "@/lib/okr";
import { parseYearQuarter } from "@/lib/okr-input";
import { currentYearQuarter, nextQuarter, quarterMonths, todayInJapan, type YearQuarter } from "@/lib/period";
import { getQuarterlyReview } from "@/lib/reviews";
import { requireTenant } from "@/lib/tenants";
import { carryOver, saveQuarterlyReview, saveScores } from "../actions";

export default function QuarterlyReviewPage({ params, searchParams }: PageProps<"/app/[tenantId]/reviews/quarterly">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <QuarterlyReview params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function previousQuarter({ year, quarter }: YearQuarter): YearQuarter {
  return quarter === 1 ? { year: year - 1, quarter: 4 } : { year, quarter: quarter - 1 };
}

function href(tenantId: string, { year, quarter }: YearQuarter): string {
  return `/app/${tenantId}/reviews/quarterly?year=${year}&q=${quarter}`;
}

async function QuarterlyReview({ params, searchParams }: Pick<PageProps<"/app/[tenantId]/reviews/quarterly">, "params" | "searchParams">) {
  const [{ tenantId }, query] = await Promise.all([params, searchParams]);
  const context = await requireTenant(tenantId);
  const current = currentYearQuarter();
  const requested = parseYearQuarter(String(query.year ?? ""), String(query.q ?? ""));
  // 指定がなければ今期。ただし四半期の最初の2週間は、終わったばかりの前の四半期を出す（振り返りはその時期に書くため）
  const [, month, day] = todayInJapan().split("-").map(Number);
  const justStarted = (month - 1) % 3 === 0 && day <= 14;
  const view = requested.ok ? requested.value : justStarted ? previousQuarter(current) : current;
  const [objectives, review] = await Promise.all([
    listObjectives(context, view.year, view.quarter),
    getQuarterlyReview(context, view.year, view.quarter),
  ]);
  const tid = context.tenant.id;
  const next = nextQuarter(view);

  const rows: ScoreRow[] = objectives.flatMap((o) =>
    o.keyResults.map((kr) => ({
      id: kr.id,
      objectiveTitle: o.title,
      title: kr.title,
      progress: kr.progress,
      score: kr.score,
      nextAction: kr.nextAction,
    })),
  );
  const scored = rows.filter((r) => r.score !== null);
  const average = scored.length === 0 ? null : scored.reduce((sum, r) => sum + (r.score ?? 0), 0) / scored.length;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">振り返り</h1>
      <ReviewTabs tenantId={tid} current="quarterly" />

      <nav aria-label="四半期の切り替え" className="flex items-center gap-2">
        <Link href={href(tid, previousQuarter(view))} aria-label="前の四半期" className="rounded-md p-1 hover:bg-muted">
          <ChevronLeftIcon className="size-4" />
        </Link>
        <span className="font-medium">
          {view.year}年 Q{view.quarter}（{quarterMonths(view.quarter)}）
        </span>
        <Link href={href(tid, next)} aria-label="次の四半期" className="rounded-md p-1 hover:bg-muted">
          <ChevronRightIcon className="size-4" />
        </Link>
        <span className="flex-1" />
        <span className="text-sm text-muted-foreground">
          スコア <span className="text-lg font-medium text-foreground tabular-nums">{average === null ? "—" : average.toFixed(1)}</span>
        </span>
      </nav>

      <Card>
        <CardHeader>
          <CardTitle>Key Result の採点</CardTitle>
          <CardDescription>0.0〜1.0 で採点し、次の四半期の扱いを決めます（0.7 前後なら良い挑戦だった目安）。採点はテナントのメンバーに見えます。</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">この四半期の Key Result はありません。</p>
          ) : (
            <ScoreForm key={JSON.stringify(rows.map((r) => [r.id, r.score, r.nextAction]))} action={saveScores.bind(null, tid)} rows={rows} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <LockIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            四半期を振り返る
          </CardTitle>
          <CardDescription>ここに書いたことは本人だけに見えます。</CardDescription>
        </CardHeader>
        <CardContent>
          <QuarterlyReviewForm
            key={`${view.year}-${view.quarter}:${review.learned}:${review.nextSteps}`}
            action={saveQuarterlyReview.bind(null, tid, view.year, view.quarter)}
            values={review}
          />
        </CardContent>
      </Card>

      {rows.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>次の四半期へ引き継ぐ</CardTitle>
            <CardDescription>
              「続ける」「変える」にした Key Result を、{next.year}年 Q{next.quarter} の Objective として作ります。数値型の KR は、最新の記録が次の開始値になります。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CarryOverButton action={carryOver.bind(null, tid, view.year, view.quarter)} label={`${next.year}年 Q${next.quarter} の下書きを作る`} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
