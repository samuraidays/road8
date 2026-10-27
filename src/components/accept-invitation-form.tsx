"use client";

import { useActionState, useSyncExternalStore } from "react";
import { acceptInvitationAction, type AcceptState } from "@/app/invite/actions";
import { Button } from "@/components/ui/button";

// トークンは URL のフラグメント（# 以降）にある。フラグメントはサーバーに送られないので、ブラウザで読んでフォームで送る
function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
const readToken = () => window.location.hash.slice(1);
const noToken = () => "";

export function AcceptInvitationForm() {
  const token = useSyncExternalStore(subscribe, readToken, noToken);
  const [state, formAction, pending] = useActionState<AcceptState, FormData>(acceptInvitationAction, {});

  if (!token) {
    return <p className="text-sm text-muted-foreground">招待リンクが正しくありません。受け取ったリンクをそのまま開いてください。</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "参加しています…" : "テナントに参加する"}
      </Button>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
