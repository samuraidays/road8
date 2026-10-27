"use client";

import { useState, useTransition } from "react";
import { CalendarPlusIcon } from "lucide-react";
import type { GoogleFormState } from "@/app/app/google/actions";
import type { TaskFormState } from "@/app/app/[tenantId]/tasks/actions";
import { DeleteButton, ErrorMessage } from "@/components/okr-forms";

export function DisconnectGoogleButton({ action }: { action: (prev: GoogleFormState, formData: FormData) => Promise<GoogleFormState> }) {
  return (
    <DeleteButton
      action={action}
      label="連携を解除"
      confirmMessage="Google カレンダーとの連携を解除します。カレンダーに入れた予定は残ります。よろしいですか？"
    />
  );
}

// タスクをカレンダーに入れる（入れたことがあれば予定を更新する）
export function CalendarButton({ add, added }: { add: () => Promise<TaskFormState>; added: boolean }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<TaskFormState>({});

  return (
    <span className="flex flex-col items-start">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setResult(await add()))}
        className="flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs hover:bg-muted disabled:opacity-50"
      >
        <CalendarPlusIcon className="size-3.5" aria-hidden="true" />
        {pending ? "送信中…" : added ? "予定を更新" : "カレンダーに入れる"}
      </button>
      {result.message ? (
        <span role="status" className="text-xs text-muted-foreground">
          {result.message}
        </span>
      ) : null}
      <ErrorMessage error={result.error} />
    </span>
  );
}
