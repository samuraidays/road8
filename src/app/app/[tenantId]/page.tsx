import { Suspense } from "react";
import { requireTenant } from "@/lib/tenants";

const ROLE_LABEL = { owner: "Owner", member: "Member" } as const;

export default function TenantHomePage({ params }: PageProps<"/app/[tenantId]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">読み込み中…</p>}>
      <TenantHome params={params} />
    </Suspense>
  );
}

async function TenantHome({ params }: Pick<PageProps<"/app/[tenantId]">, "params">) {
  const { tenantId } = await params;
  const { tenant } = await requireTenant(tenantId);
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold break-words">{tenant.name}</h1>
      <p className="text-sm text-muted-foreground">あなたのロール：{ROLE_LABEL[tenant.role]}</p>
      <p className="text-sm text-muted-foreground">OKR・タスク・メンバーの画面は、これから追加します。</p>
    </div>
  );
}
