import { Suspense } from "react";
import { DeleteTenantForm, RenameTenantForm } from "@/components/settings-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireTenant } from "@/lib/tenants";
import { deleteTenant, renameTenant } from "./actions";

export default function SettingsPage({ params }: PageProps<"/app/[tenantId]/settings">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">読み込み中…</p>}>
      <Settings params={params} />
    </Suspense>
  );
}

async function Settings({ params }: Pick<PageProps<"/app/[tenantId]/settings">, "params">) {
  const { tenantId } = await params;
  const { tenant } = await requireTenant(tenantId);

  if (tenant.role !== "owner") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">設定</h1>
        <p className="text-sm text-muted-foreground">テナントの設定を変えられるのは Owner だけです。</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">設定</h1>
      <Card>
        <CardHeader>
          <CardTitle>テナント名</CardTitle>
        </CardHeader>
        <CardContent>
          <RenameTenantForm key={tenant.name} action={renameTenant.bind(null, tenant.id)} name={tenant.name} />
        </CardContent>
      </Card>
      <Card className="ring-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">テナントを削除する</CardTitle>
          <CardDescription>
            人生のゴール・OKR・タスク・習慣・振り返り・メンバーの所属など、このテナントのデータをすべて削除します。元に戻せません。監査ログ（操作の記録）は残ります。Google カレンダーに入れた予定は消えません。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteTenantForm action={deleteTenant.bind(null, tenant.id)} name={tenant.name} />
        </CardContent>
      </Card>
    </div>
  );
}
