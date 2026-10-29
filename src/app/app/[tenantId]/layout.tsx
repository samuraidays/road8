import { Suspense } from "react";
import { TenantNav } from "@/components/tenant-nav";
import { requireTenant } from "@/lib/tenants";

// テナント配下の枠（メニュー。設計書 §11）。所属の確認は各ページ・Server Action でも requireTenant() で行う。
// ここでの requireTenant() は、Owner だけのメニュー項目を出し分けるため（同じリクエストのページの呼び出しと共有される）
export default function TenantLayout({ children, params }: LayoutProps<"/app/[tenantId]">) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 pt-6 pb-24 md:flex-row md:px-6 md:pb-10">
      <aside className="md:w-44 md:shrink-0">
        <Suspense fallback={null}>
          <Nav params={params} />
        </Suspense>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

async function Nav({ params }: Pick<LayoutProps<"/app/[tenantId]">, "params">) {
  const { tenantId } = await params;
  const { tenant } = await requireTenant(tenantId);
  return <TenantNav isOwner={tenant.role === "owner"} />;
}
