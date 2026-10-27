import { Suspense } from "react";
import { DeleteButton, KeyResultForm, ObjectiveForm, type MemberOption } from "@/components/okr-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listMembers } from "@/lib/members";
import { listObjectives, type Objective } from "@/lib/okr";
import { requireTenant } from "@/lib/tenants";
import {
  createKeyResult,
  createObjective,
  deleteKeyResult,
  deleteObjective,
  updateKeyResult,
  updateObjective,
} from "./actions";

export default function OkrPage({ params }: PageProps<"/app/[tenantId]/okr">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">読み込み中…</p>}>
      <Okr params={params} />
    </Suspense>
  );
}

async function Okr({ params }: Pick<PageProps<"/app/[tenantId]/okr">, "params">) {
  const { tenantId } = await params;
  const context = await requireTenant(tenantId);
  const [objectives, members] = await Promise.all([listObjectives(context), listMembers(context)]);
  const memberOptions: MemberOption[] = members.map((m) => ({
    userId: m.userId,
    label: m.displayName || "名前未設定",
  }));
  const isOwner = context.tenant.role === "owner";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">OKR</h1>

      {objectives.length === 0 ? (
        <p className="text-sm text-muted-foreground">Objective はまだありません。下から作成してください。</p>
      ) : (
        objectives.map((o) => (
          <ObjectiveCard key={o.id} tenantId={context.tenant.id} objective={o} members={memberOptions} isOwner={isOwner} />
        ))
      )}

      <Card>
        <CardHeader>
          <CardTitle>Objective を作る</CardTitle>
        </CardHeader>
        <CardContent>
          <ObjectiveForm
            action={createObjective.bind(null, context.tenant.id)}
            members={memberOptions}
            submitLabel="作成する"
            idPrefix="new-objective"
          />
        </CardContent>
      </Card>
    </div>
  );
}

function formatPeriod(start: string | null, end: string | null): string | null {
  if (!start && !end) {
    return null;
  }
  return `${start ?? "未設定"} 〜 ${end ?? "未設定"}`;
}

function ObjectiveCard({
  tenantId,
  objective: o,
  members,
  isOwner,
}: {
  tenantId: string;
  objective: Objective;
  members: MemberOption[];
  isOwner: boolean;
}) {
  const owner = members.find((m) => m.userId === o.ownerUserId);
  const period = formatPeriod(o.periodStart, o.periodEnd);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="break-words">{o.title}</CardTitle>
        <CardDescription>
          担当：{owner ? owner.label : "未設定"}
          {period ? `　期間：${period}` : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {o.description ? <p className="text-sm break-words whitespace-pre-wrap">{o.description}</p> : null}

        <ul className="flex flex-col gap-3">
          {o.keyResults.map((kr) => (
            <li key={kr.id} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="min-w-0 break-words">{kr.title}</span>
                <span className="shrink-0 tabular-nums">{kr.progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted" role="progressbar" aria-valuenow={kr.progress} aria-valuemin={0} aria-valuemax={100} aria-label={kr.title}>
                <div className="h-2 rounded-full bg-primary" style={{ width: `${kr.progress}%` }} />
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">編集</summary>
                <div className="mt-2 flex flex-col gap-2">
                  <KeyResultForm
                    // 保存後に新しい値で作り直す
                    key={`${kr.title}:${kr.progress}`}
                    action={updateKeyResult.bind(null, tenantId, kr.id)}
                    values={kr}
                    submitLabel="保存"
                    idPrefix={`kr-${kr.id}`}
                  />
                  <DeleteButton
                    action={deleteKeyResult.bind(null, tenantId, kr.id)}
                    label="Key Result を削除"
                    confirmMessage="この Key Result と、紐づくタスクを削除します。よろしいですか？"
                  />
                </div>
              </details>
            </li>
          ))}
        </ul>

        <KeyResultForm
          action={createKeyResult.bind(null, tenantId, o.id)}
          submitLabel="Key Result を追加"
          idPrefix={`new-kr-${o.id}`}
        />

        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Objective を編集</summary>
          <div className="mt-3 flex flex-col gap-3">
            <ObjectiveForm
              key={JSON.stringify([o.title, o.description, o.periodStart, o.periodEnd, o.ownerUserId])}
              action={updateObjective.bind(null, tenantId, o.id)}
              members={members}
              values={o}
              submitLabel="保存"
              idPrefix={`objective-${o.id}`}
            />
            {isOwner ? (
              <DeleteButton
                action={deleteObjective.bind(null, tenantId, o.id)}
                label="Objective を削除"
                confirmMessage="この Objective と、紐づく Key Result・タスクをすべて削除します。よろしいですか？"
              />
            ) : null}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
