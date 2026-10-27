import { Suspense } from "react";
import Link from "next/link";
import { LifeGoalForm, PillarForm } from "@/components/goal-forms";
import { DeleteButton, ReasonForm } from "@/components/okr-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getGoals, type Pillar } from "@/lib/goals";
import { currentYearQuarter, quarterMonths } from "@/lib/period";
import { requireTenant } from "@/lib/tenants";
import { saveReason } from "../okr/actions";
import { createPillar, deletePillar, saveLifeGoal, updatePillar } from "./actions";

export default function GoalsPage({ params }: PageProps<"/app/[tenantId]/goals">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">読み込み中…</p>}>
      <Goals params={params} />
    </Suspense>
  );
}

async function Goals({ params }: Pick<PageProps<"/app/[tenantId]/goals">, "params">) {
  const { tenantId } = await params;
  const context = await requireTenant(tenantId);
  const goals = await getGoals(context);
  const isOwner = context.tenant.role === "owner";
  const tid = context.tenant.id;
  const { year, quarter } = currentYearQuarter();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">人生のゴール</h1>

      <Card>
        <CardContent className="pt-1">
          {isOwner ? (
            <LifeGoalForm key={goals.statement} action={saveLifeGoal.bind(null, tid)} statement={goals.statement} />
          ) : (
            <p className="text-sm break-words whitespace-pre-wrap">{goals.statement || "まだ書かれていません"}</p>
          )}
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">柱</h2>
        <p className="text-sm text-muted-foreground">
          今期は {year}年 Q{quarter}（{quarterMonths(quarter)}）です。柱ごとに今期の Objective の数を出しています。
        </p>
        {goals.pillars.length === 0 ? (
          <p className="text-sm text-muted-foreground">柱はまだありません。{isOwner ? "下から作成してください。" : ""}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {goals.pillars.map((p) => (
              <PillarCard key={p.id} tenantId={tid} pillar={p} isOwner={isOwner} />
            ))}
          </div>
        )}
      </section>

      {isOwner ? (
        <Card>
          <CardHeader>
            <CardTitle>柱を作る</CardTitle>
            <CardDescription>最終ゴールを、取り組む分野に分けたものです。Objective はどれかの柱にひもづけます。</CardDescription>
          </CardHeader>
          <CardContent>
            <PillarForm action={createPillar.bind(null, tid)} submitLabel="作成する" idPrefix="new-pillar" values={{ title: "", description: "", position: goals.pillars.length + 1 }} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function PillarCard({ tenantId, pillar: p, isOwner }: { tenantId: string; pillar: Pillar; isOwner: boolean }) {
  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="break-words">{p.title}</CardTitle>
          <Link
            href={`/app/${tenantId}/okr`}
            className={p.currentObjectiveCount === 0 ? "shrink-0 text-xs text-amber-700 dark:text-amber-400" : "shrink-0 text-xs text-muted-foreground"}
          >
            今期 {p.currentObjectiveCount === 0 ? "なし" : `${p.currentObjectiveCount}件`}
          </Link>
        </div>
        {p.description ? <CardDescription className="break-words whitespace-pre-wrap">{p.description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ReasonForm key={p.reason} action={saveReason.bind(null, tenantId, { pillarId: p.id })} body={p.reason} idPrefix={`pillar-${p.id}`} label="なぜ（本人だけ）" />
        {isOwner ? (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">柱を編集</summary>
            <div className="mt-2 flex flex-col gap-3">
              <PillarForm key={JSON.stringify([p.title, p.description, p.position])} action={updatePillar.bind(null, tenantId, p.id)} values={p} submitLabel="保存" idPrefix={`pillar-${p.id}`} />
              <DeleteButton
                action={deletePillar.bind(null, tenantId, p.id)}
                label="柱を削除"
                confirmMessage="この柱を削除します。ひもづいた Objective は残り、柱が外れます。柱の「なぜ」は消えます。よろしいですか？"
              />
            </div>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}
