import { Suspense } from "react";
import { InviteForm } from "@/components/member-forms";
import { PageSkeleton } from "@/components/page-skeleton";
import { AddDialog, InlineText, RowActions } from "@/components/ux";
import { listMembers, memberLabel } from "@/lib/members";
import { ROLE_LABEL } from "@/lib/roles";
import { requireTenant } from "@/lib/tenants";
import { createInvitation, setRole, updateDisplayName } from "./actions";

export default function MembersPage({ params }: PageProps<"/app/[tenantId]/members">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Members params={params} />
    </Suspense>
  );
}

async function Members({ params }: Pick<PageProps<"/app/[tenantId]/members">, "params">) {
  const { tenantId } = await params;
  const context = await requireTenant(tenantId);
  const members = await listMembers(context);
  const isOwner = context.tenant.role === "owner";
  const tid = context.tenant.id;
  // 最後の Owner は降格できない（DB のトリガーでも止まる）ので、Owner が1人のときは「Member にする」を出さない
  const ownerCount = members.filter((m) => m.role === "owner").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">メンバー</h1>
        {isOwner ? (
          <AddDialog label="メンバーを招待" title="メンバーを招待" variant="default">
            <InviteForm action={createInvitation.bind(null, tid)} />
          </AddDialog>
        ) : null}
      </div>

      <ul className="flex flex-col divide-y rounded-xl border">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              {m.isMe ? (
                // 自分の表示名は、クリックしてその場で直せる
                <InlineText
                  action={updateDisplayName}
                  name="displayName"
                  value={m.displayName}
                  placeholder="クリックして、表示名を入れる"
                  label="あなたの表示名"
                  multiline={false}
                  className="-mx-2 w-auto"
                />
              ) : (
                <span className="text-sm">{memberLabel(m, members)}</span>
              )}
            </div>
            {m.isMe ? <span className="text-xs text-muted-foreground">あなた</span> : null}
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{ROLE_LABEL[m.role]}</span>
            {isOwner && !(m.role === "owner" && ownerCount === 1) ? (
              <RowActions
                label={`${memberLabel(m, members)} の操作`}
                items={[
                  m.role === "owner"
                    ? { label: "Member にする", action: setRole.bind(null, tid, m.userId, "member" as const) }
                    : { label: "Owner にする", action: setRole.bind(null, tid, m.userId, "owner" as const) },
                ]}
              />
            ) : null}
          </li>
        ))}
      </ul>
      {members.length === 1 ? (
        <p className="text-sm text-muted-foreground">いまはあなただけです。招待しなければ、ここに入れた内容はあなたにしか見えません。</p>
      ) : null}
    </div>
  );
}
