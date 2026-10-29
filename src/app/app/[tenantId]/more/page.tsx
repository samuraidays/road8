import { Suspense } from "react";
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { PageSkeleton } from "@/components/page-skeleton";
import { NAV_ITEMS } from "@/lib/nav";
import { requireTenant } from "@/lib/tenants";

// スマホの「その他」（下部のタブに入らないメニュー）
export default function MorePage({ params }: PageProps<"/app/[tenantId]/more">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <More params={params} />
    </Suspense>
  );
}

async function More({ params }: Pick<PageProps<"/app/[tenantId]/more">, "params">) {
  const { tenantId } = await params;
  const { tenant } = await requireTenant(tenantId);
  const items = NAV_ITEMS.filter((item) => !item.tab && (tenant.role === "owner" || !item.ownerOnly));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">その他</h1>
      <ul className="flex flex-col divide-y rounded-xl border">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.label}>
              <Link href={`/app/${tenant.id}${item.path}`} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted">
                <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className="flex-1">{item.label}</span>
                <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
