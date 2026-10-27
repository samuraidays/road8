"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// まだ作っていない画面は path を null にして、「準備中」として表示だけする
const ITEMS: { label: string; path: string | null }[] = [
  { label: "ホーム", path: "" },
  { label: "ゴール", path: "/goals" },
  { label: "OKR", path: "/okr" },
  { label: "タスク", path: "/tasks" },
  { label: "振り返り", path: "/reviews/weekly" },
  { label: "メンバー", path: "/members" },
];

export function TenantNav() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const pathname = usePathname();
  const base = `/app/${tenantId}`;

  return (
    <nav aria-label="テナントのメニュー" className="flex flex-row gap-1 md:flex-col">
      {ITEMS.map((item) => {
        if (item.path === null) {
          return (
            <span key={item.label} className="rounded-md px-3 py-2 text-sm text-muted-foreground" aria-disabled="true">
              {item.label}
              <span className="ml-1 text-xs">（準備中）</span>
            </span>
          );
        }
        const href = `${base}${item.path}`;
        // ホームは完全一致、ほかは最初の階層（/reviews など）の配下なら選択中にする
        const section = `${base}${item.path.split("/").slice(0, 2).join("/")}`;
        const active = item.path === "" ? pathname === href : pathname.startsWith(section);
        return (
          <Link
            key={item.label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn("rounded-md px-3 py-2 text-sm hover:bg-muted", active && "bg-muted font-medium")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
