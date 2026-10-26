import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">確認できませんでした</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        リンクの有効期限が切れているか、すでに使われています。登録したブラウザで開いているかも確かめてください。
      </p>
      <Link href="/login" className="underline">ログインへ</Link>
    </main>
  );
}
