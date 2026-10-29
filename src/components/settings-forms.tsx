"use client";

import { useActionState } from "react";
import type { SettingsFormState } from "@/app/app/[tenantId]/settings/actions";
import { ErrorMessage } from "@/components/okr-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Action = (prev: SettingsFormState, formData: FormData) => Promise<SettingsFormState>;

export function DeleteTenantForm({ action, name }: { action: Action; name: string }) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Label htmlFor="tenant-delete-confirm">確認のため、テナント名「{name}」を入力してください</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input id="tenant-delete-confirm" name="confirmName" autoComplete="off" className="max-w-sm" />
        <Button type="submit" variant="destructive" disabled={pending}>
          {pending ? "削除中…" : "テナントを削除"}
        </Button>
      </div>
      <ErrorMessage error={state.error} />
    </form>
  );
}
