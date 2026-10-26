"use client";

import { useActionState } from "react";

export type FormState = { error?: string; message?: string };

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  passwordAutoComplete: "current-password" | "new-password";
  passwordHint?: string;
};

export function AuthForm({ action, submitLabel, passwordAutoComplete, passwordHint }: Props) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm">メールアドレス</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm">パスワード</span>
        <input
          name="password"
          type="password"
          autoComplete={passwordAutoComplete}
          required
          className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
        {passwordHint ? <span className="text-xs text-zinc-500">{passwordHint}</span> : null}
      </label>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "送信中…" : submitLabel}
      </button>
    </form>
  );
}
