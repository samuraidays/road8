"use client";

import { useActionState } from "react";
import type {
  DisplayNameState,
  InviteState,
  RoleChangeState,
} from "@/app/app/[tenantId]/members/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_LABEL, type Role } from "@/lib/roles";

type Action<S> = (prev: S, formData: FormData) => Promise<S>;

const selectClassName = "h-8 rounded-lg border border-input bg-transparent px-2 text-sm";

function RoleOptions() {
  return (
    <>
      <option value="member">{ROLE_LABEL.member}</option>
      <option value="owner">{ROLE_LABEL.owner}</option>
    </>
  );
}

export function InviteForm({ action }: { action: Action<InviteState> }) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-role">ロール</Label>
          <select id="invite-role" name="role" defaultValue="member" className={selectClassName}>
            <RoleOptions />
          </select>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "作成中…" : "招待リンクを作る"}
        </Button>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.link ? (
        <div className="flex flex-col gap-1.5" role="status">
          <Label htmlFor="invite-link">招待リンク（この画面を離れると二度と表示されません。72時間有効）</Label>
          <Input id="invite-link" readOnly value={state.link} onFocus={(e) => e.currentTarget.select()} />
        </div>
      ) : null}
    </form>
  );
}

export function RoleForm({ action, userId, role }: { action: Action<RoleChangeState>; userId: string; role: Role }) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <input type="hidden" name="userId" value={userId} />
        <select name="role" defaultValue={role} aria-label="ロール" className={selectClassName}>
          <RoleOptions />
        </select>
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          変更
        </Button>
      </div>
      {state.error ? (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function DisplayNameForm({ action, displayName }: { action: Action<DisplayNameState>; displayName: string }) {
  const [state, formAction, pending] = useActionState(action, { displayName });

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="display-name">あなたの表示名</Label>
          <Input id="display-name" name="displayName" defaultValue={state.displayName} placeholder="例：山田" />
        </div>
        <Button type="submit" variant="outline" disabled={pending}>
          保存
        </Button>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
