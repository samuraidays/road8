import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { signOut } from "./actions";

export default function AppPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">road8</h1>
      {/* セッションの読み出しはリクエストごとに行うため、Suspense の内側に置く */}
      <Suspense fallback={<p className="text-zinc-500">読み込み中…</p>}>
        <Account />
      </Suspense>
    </main>
  );
}

async function Account() {
  const user = await requireUser();
  return (
    <div className="flex flex-col items-center gap-4">
      <p>{user.email} でログインしています</p>
      <form action={signOut}>
        <button type="submit" className="rounded border border-zinc-300 px-4 py-2 dark:border-zinc-700">
          ログアウト
        </button>
      </form>
    </div>
  );
}
