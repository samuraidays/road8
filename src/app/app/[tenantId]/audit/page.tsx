import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { actionLabel, AUDIT_PAGE_SIZE, listAuditLogs } from "@/lib/audit";
import { listMembers, memberLabel } from "@/lib/members";
import { requireTenant } from "@/lib/tenants";

export default function AuditPage({ params, searchParams }: PageProps<"/app/[tenantId]/audit">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Audit params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const FORMAT = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

async function Audit({ params, searchParams }: Pick<PageProps<"/app/[tenantId]/audit">, "params" | "searchParams">) {
  const [{ tenantId }, query] = await Promise.all([params, searchParams]);
  const context = await requireTenant(tenantId);
  const tid = context.tenant.id;

  // 監査ログを見られるのは Owner だけ（audit_log.list。RLS でも Owner 以外には0件になる）
  if (context.tenant.role !== "owner") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">監査ログ</h1>
        <p className="text-sm text-muted-foreground">監査ログを見られるのは Owner だけです。</p>
      </div>
    );
  }

  const beforeText = String(query.before ?? "");
  const before = /^\d{1,18}$/.test(beforeText) ? Number(beforeText) : null;
  const [entries, members] = await Promise.all([listAuditLogs(context, before), listMembers(context)]);
  const actorLabel = (id: string | null) => {
    if (!id) {
      return "（操作者なし）";
    }
    const member = members.find((m) => m.userId === id);
    // テナントを抜けた人は名前が分からないので、ID の先頭だけ出す
    return member ? memberLabel(member, members) : `元メンバー（${id.slice(0, 8)}）`;
  };
  const oldest = entries.at(-1);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">監査ログ</h1>
      <Card>
        <CardHeader>
          <CardTitle>このテナントでの操作（新しい順）</CardTitle>
          <CardDescription>
            だれが・いつ・何をしたかを記録しています。中身（題名や文章）は残さず、変更された項目の名前だけを残します。本人だけの「なぜ」や振り返りも、書いた時刻だけはここに出ます。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">記録はありません。</p>
          ) : (
            <ul className="flex flex-col divide-y text-sm">
              {entries.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                  <span className="w-40 shrink-0 tabular-nums text-muted-foreground">{FORMAT.format(new Date(e.createdAt))}</span>
                  <span className="min-w-0 flex-1 break-words">
                    {actorLabel(e.actorUserId)} が {actionLabel(e.action)}
                    {e.changed.length > 0 ? <span className="text-muted-foreground">（{e.changed.join("・")}）</span> : null}
                  </span>
                  {e.via ? <span className="text-xs text-muted-foreground">サーバー経由</span> : null}
                  {e.result !== "success" ? <span className="text-xs text-destructive">{e.result}</span> : null}
                </li>
              ))}
            </ul>
          )}
          {entries.length === AUDIT_PAGE_SIZE && oldest ? (
            <Link href={`/app/${tid}/audit?before=${oldest.id}`} className="mt-4 inline-block text-sm underline">
              もっと古い記録
            </Link>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
