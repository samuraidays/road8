import { Suspense } from "react";
import Link from "next/link";
import { CreateTenantForm } from "@/components/create-tenant-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { listMyTenants } from "@/lib/tenants";

const ROLE_LABEL = { owner: "Owner", member: "Member" } as const;

export default function AppPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6">
      <section className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">テナント</h1>
        <Suspense fallback={<p className="text-sm text-muted-foreground">読み込み中…</p>}>
          <TenantList />
        </Suspense>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>新しいテナントを作る</CardTitle>
          <CardDescription>作った人が Owner になります。メンバーはあとから招待できます。</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateTenantForm />
        </CardContent>
      </Card>
    </main>
  );
}

async function TenantList() {
  const user = await requireUser();
  const tenants = await listMyTenants(user);
  if (tenants.length === 0) {
    return <p className="text-sm text-muted-foreground">所属しているテナントはまだありません。下から作成してください。</p>;
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
