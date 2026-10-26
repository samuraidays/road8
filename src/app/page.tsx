import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold">road8</h1>
      <p className="text-zinc-600 dark:text-zinc-400">OKR とタスク管理（準備中）</p>
      <div className="flex gap-4">
        <Link href="/login" className="underline">ログイン</Link>
        <Link href="/signup" className="underline">新規登録</Link>
      </div>
    </main>
  );
}
