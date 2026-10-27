import { Suspense } from "react";
import { DisplayNameForm, InviteForm, RoleForm } from "@/components/member-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listMembers, memberLabel } from "@/lib/members";
import { ROLE_LABEL } from "@/lib/roles";
import { requireTenant } from "@/lib/tenants";
import { changeRole, createInvitation, updateDisplayName } from "./actions";

export default function MembersPage({ params }: PageProps<"/app/[tenantId]/members">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">読み込み中…</p>}>
      <Members params={params} />
    </Suspense>
  );
}

async function Members({ params }: Pick<PageProps<"/app/[tenantId]/members">, "params">) {
  const { tenantId } = await params;
  const context = await requireTenant(tenantId);
  const members = await listMembers(context);
  const isOwner = context.tenant.role === "owner";
  const me = members.find((m) => m.isMe);
  // だれかのロールが変わったら全行のフォームを作り直す（選択欄を DB の値に戻し、ほかの行の古いエラーも消す）
  const rolesKey = members.map((m) => `${m.userId}:${m.role}`).join(",");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">メンバー</h1>

      <ul className="flex flex-col divide-y rounded-lg border">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="min-w-0 truncate">
              <span className={m.displayName ? undefined : "text-muted-foreground"}>{memberLabel(m, members)}</span>
              {m.isMe ? <span className="ml-2 text-xs text-muted-foreground">（あなた）</span> : null}
            </span>
            {isOwner ? (
              <RoleForm
                key={rolesKey}
                action={changeRole.bind(null, context.tenant.id)}
                userId={m.userId}
                role={m.role}
              />
            ) : (
              <span className="shrink-0 text-xs text-muted-foreground">{ROLE_LABEL[m.role]}</span>
            )}
          </li>
        ))}
      </ul>

      {me ? <DisplayNameForm action={updateDisplayName} displayName={me.displayName} /> : null}

      {isOwner ? (
        <Card>
          <CardHeader>
            <CardTitle>メンバーを招待する</CardTitle>
            <CardDescription>
              作ったリンクを、招待したい人に直接渡してください。リンクは1回だけ使えます。発行したリンクは取り消せません。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InviteForm action={createInvitation.bind(null, context.tenant.id)} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
