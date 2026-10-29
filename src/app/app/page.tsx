import { Suspense } from "react";
import Link from "next/link";
import { QuickAdd } from "@/components/ux";
import { createTenant } from "./actions";
import { requireUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/roles";
import { listMyTenants } from "@/lib/tenants";

export default function AppPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6">
      <section className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">テナント</h1>
        <Suspense fallback={<div className="h-24 animate-pulse rounded-lg bg-muted" aria-busy="true" aria-label="読み込み中" />}>
          <TenantList />
        </Suspense>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">新しいテナントを作る</h2>
        <QuickAdd action={createTenant} name="name" placeholder="テナント名（例：私の人生）を入れて Enter" label="新しいテナント名" />
        <p className="text-xs text-muted-foreground">作った人が Owner になります。ひとりで使うなら、自分用のテナントを1つ作れば十分です。</p>
      </section>
    </main>
  );
}

async function TenantList() {
  const user = await requireUser();
  const tenants = await listMyTenants(user);
  if (tenants.length === 0) {
    return <p className="text-sm text-muted-foreground">まだテナントがありません。下で名前を入れて Enter を押すと作れます。</p>;
  }
  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {tenants.map((t) => (
        <li key={t.id}>
          <Link href={`/app/${t.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted">
            <span className="truncate font-medium">{t.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{ROLE_LABEL[t.role]}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
