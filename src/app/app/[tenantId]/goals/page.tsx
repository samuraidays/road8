import { Suspense } from "react";
import Link from "next/link";
import { PillarForm } from "@/components/goal-forms";
import { PrivateLabel } from "@/components/okr-forms";
import { PageSkeleton } from "@/components/page-skeleton";
import { AddDialog, InlineText, RowActions, type MenuItemSpec } from "@/components/ux";
import { getGoals, type Pillar } from "@/lib/goals";
import { currentYearQuarter, quarterMonths } from "@/lib/period";
import { requireTenant } from "@/lib/tenants";
import { cn } from "@/lib/utils";
import { saveReason } from "../okr/actions";
import { createPillar, deletePillar, movePillar, saveLifeGoal, updatePillar } from "./actions";

export default function GoalsPage({ params }: PageProps<"/app/[tenantId]/goals">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
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
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">人生のゴール</h1>
        {isOwner ? (
          <InlineText
            action={saveLifeGoal.bind(null, tid)}
            name="statement"
            value={goals.statement}
            placeholder="クリックして、どんな人生にしたいかを書く"
            label="人生のゴール"
            className="rounded-xl bg-muted/50 px-5 py-4 text-base"
          />
        ) : (
          <p className="rounded-xl bg-muted/50 px-5 py-4 leading-7 whitespace-pre-wrap">{goals.statement || "まだ書かれていません"}</p>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium">柱</h2>
            <p className="text-sm text-muted-foreground">
              ゴールを分野に分けたものです。今期（{year}年 Q{quarter}・{quarterMonths(quarter)}）の Objective の数を出しています。
            </p>
          </div>
          {isOwner ? (
            <AddDialog label="柱を追加" title="柱を追加">
              <PillarForm action={createPillar.bind(null, tid)} submitLabel="追加" idPrefix="new-pillar" />
            </AddDialog>
          ) : null}
        </div>

        {goals.pillars.length === 0 ? (
          <div className="rounded-xl border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
            「事業をつくる」「魅力を高める」のように、ゴールを3〜5個の柱に分けると、OKR を立てやすくなります。
          </div>
        ) : (
          <ol className="grid gap-3 md:grid-cols-2">
            {goals.pillars.map((p, i) => (
              <PillarCard key={p.id} tenantId={tid} pillar={p} index={i} count={goals.pillars.length} isOwner={isOwner} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function PillarCard({
  tenantId,
  pillar: p,
  index,
  count,
  isOwner,
}: {
  tenantId: string;
  pillar: Pillar;
  index: number;
  count: number;
  isOwner: boolean;
}) {
  const items: MenuItemSpec[] = [
    ...(index > 0 ? [{ label: "上へ移動", action: movePillar.bind(null, tenantId, p.id, "up" as const) }] : []),
    ...(index < count - 1 ? [{ label: "下へ移動", action: movePillar.bind(null, tenantId, p.id, "down" as const) }] : []),
  ];

  return (
    <li className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-start gap-3">
        {/* 柱の名前はカードの見出しとして大きく出す（番号も色を付けて目立たせる） */}
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground tabular-nums">
          {index + 1}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="text-lg leading-7 font-semibold break-words">{p.title}</h3>
          {p.description ? <p className="text-sm break-words whitespace-pre-wrap text-muted-foreground">{p.description}</p> : null}
        </div>
        <Link
          href={`/app/${tenantId}/okr`}
          className={cn("shrink-0 text-xs", p.currentObjectiveCount === 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}
        >
          今期 {p.currentObjectiveCount === 0 ? "なし" : `${p.currentObjectiveCount}件`}
        </Link>
        {isOwner ? (
          <RowActions
            label={`柱「${p.title}」の操作`}
            editTitle="柱を編集"
            editForm={<PillarForm action={updatePillar.bind(null, tenantId, p.id)} values={p} submitLabel="保存" idPrefix={`pillar-${p.id}`} />}
            items={items}
            deleteTitle="柱を削除しますか？"
            deleteDescription="ひもづいた Objective は残り、柱が外れます。この柱の「なぜ」は消えます。"
            deleteAction={deletePillar.bind(null, tenantId, p.id)}
          />
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <PrivateLabel>なぜ（本人だけ）</PrivateLabel>
        <InlineText
          action={saveReason.bind(null, tenantId, { pillarId: p.id })}
          name="body"
          value={p.reason}
          placeholder="クリックして、これを目指す理由を書く"
          label="なぜ"
        />
      </div>
    </li>
  );
}
