import { Suspense } from "react";
import { TenantNav } from "@/components/tenant-nav";

// テナント配下の枠（メニュー）。所属の確認はここでは行わず、各ページ・Server Action で requireTenant() を呼ぶ
export default function TenantLayout({ children }: LayoutProps<"/app/[tenantId]">) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6 md:flex-row">
      <aside className="md:w-48 md:shrink-0">
        <Suspense fallback={null}>
          <TenantNav />
        </Suspense>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
