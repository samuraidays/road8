import Link from "next/link";
import { cn } from "@/lib/utils";

// 週の振り返りと四半期の振り返りの切り替え
export function ReviewTabs({ tenantId, current }: { tenantId: string; current: "weekly" | "quarterly" }) {
  const tabs = [
    { key: "weekly", label: "週の振り返り" },
    { key: "quarterly", label: "四半期の振り返り" },
  ] as const;
  return (
    <nav aria-label="振り返りの種類" className="flex gap-1">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={`/app/${tenantId}/reviews/${t.key}`}
          aria-current={t.key === current ? "page" : undefined}
          className={cn("rounded-md px-3 py-1.5 text-sm", t.key === current ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted")}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
