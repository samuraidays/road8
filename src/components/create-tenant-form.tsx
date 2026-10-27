"use client";

import { useActionState } from "react";
import { createTenant, type CreateTenantState } from "@/app/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// 文字数の上限はサーバーで確かめる（HTML の maxLength は UTF-16 単位で数え、DB の文字数と合わないため付けない）
export function CreateTenantForm() {
  const [state, formAction, pending] = useActionState<CreateTenantState, FormData>(createTenant, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tenant-name">テナント名</Label>
        <Input id="tenant-name" name="name" defaultValue={state.name} required placeholder="例：開発チーム" />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "作成中…" : "作成する"}
      </Button>
    </form>
  );
}
