import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TenantSwitcher } from "@/components/tenant-switcher";
import { requireUser } from "@/lib/auth";
import { listMyTenants } from "@/lib/tenants";
import { signOut } from "./actions";

// ログイン後の共通の枠。ここでの requireUser() は表示のため。認可は各ページ・Server Action でも行う
export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-14 items-center gap-4 border-b px-4">
        <Link href="/app" className="font-semibold">
          road8
        </Link>
        {/* セッションの読み出しはリクエストごとに行うため、Suspense の内側に置く */}
        <Suspense fallback={null}>
          <HeaderContent />
        </Suspense>
      </header>
      {children}
    </div>
  );
}

async function HeaderContent() {
  const user = await requireUser();
  const tenants = await listMyTenants(user);
  return (
    <>
      <TenantSwitcher tenants={tenants} />
      <div className="ml-auto flex items-center gap-3">
        <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
        <form action={signOut}>
          <Button type="submit" variant="outline" size="sm">
            ログアウト
          </Button>
        </form>
      </div>
    </>
  );
}
