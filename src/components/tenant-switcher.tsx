"use client";

import { useParams, useRouter } from "next/navigation";
import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TenantSummary } from "@/lib/tenants";

// テナントの切り替えは URL の移動だけ。所属の確認は移動先のページがサーバーで行う
export function TenantSwitcher({ tenants }: { tenants: TenantSummary[] }) {
  const router = useRouter();
  const { tenantId } = useParams<{ tenantId?: string }>();
  const current = tenants.find((t) => t.id === tenantId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className="max-w-64 justify-between" />}>
        <span className="truncate">{current ? current.name : "テナントを選ぶ"}</span>
        <ChevronsUpDownIcon className="opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>テナント</DropdownMenuLabel>
          {tenants.map((t) => (
            <DropdownMenuItem key={t.id} onClick={() => router.push(`/app/${t.id}`)}>
              <span className="truncate">{t.name}</span>
              {t.id === current?.id ? <CheckIcon className="ml-auto" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/app")}>
          <PlusIcon />
          新しいテナントを作る
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
