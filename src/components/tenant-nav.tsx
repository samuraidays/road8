"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { EllipsisIcon } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";

// 選択中か。今日（ホーム）は完全一致、ほかは最初の階層（/reviews など）の配下なら選択中
function isActive(pathname: string, base: string, path: string): boolean {
  if (path === "") {
    return pathname === base;
  }
  return pathname.startsWith(`${base}${path.split("/").slice(0, 2).join("/")}`);
}

export function TenantNav({ isOwner }: { isOwner: boolean }) {
  const { tenantId } = useParams<{ tenantId: string }>();
  const pathname = usePathname();
  const base = `/app/${tenantId}`;
  const items = NAV_ITEMS.filter((item) => isOwner || !item.ownerOnly);
  const moreActive = !items.some((item) => item.tab && isActive(pathname, base, item.path));

  return (
    <>
      {/* PC：左のメニュー */}
      <nav aria-label="メニュー" className="hidden flex-col gap-0.5 md:flex">
        {items.map((item, i) => {
          const active = isActive(pathname, base, item.path);
          const Icon = item.icon;
          return (
            <div key={item.label}>
              {item.secondary && !items[i - 1]?.secondary ? <div className="mx-2 my-2 border-t" /> : null}
              <Link
                href={`${base}${item.path}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
                  active && "bg-muted font-medium text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {item.label}
              </Link>
            </div>
          );
        })}
      </nav>

      {/* スマホ：下部のタブ */}
      <nav
        aria-label="メニュー"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {items
          .filter((item) => item.tab)
          .map((item) => {
            const active = isActive(pathname, base, item.path);
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={`${base}${item.path}`}
                aria-current={active ? "page" : undefined}
                className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground", active && "text-foreground")}
              >
                <Icon className="size-5" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        <Link
          href={`${base}/more`}
          aria-current={moreActive ? "page" : undefined}
          className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground", moreActive && "text-foreground")}
        >
          <EllipsisIcon className="size-5" aria-hidden="true" />
          その他
        </Link>
      </nav>
    </>
  );
}
