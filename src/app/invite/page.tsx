import { Suspense } from "react";
import Link from "next/link";
import { AcceptInvitationForm } from "@/components/accept-invitation-form";
import { getCurrentUser } from "@/lib/auth";

export default function InvitePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">テナントへの招待</h1>
      {/* セッションの読み出しはリクエストごとに行うため、Suspense の内側に置く */}
      <Suspense fallback={<p className="text-sm text-muted-foreground">読み込み中…</p>}>
        <InviteContent />
      </Suspense>
    </main>
  );
}

async function InviteContent() {
  // ログイン画面に転送すると URL のフラグメント（トークン）が失われるため、転送せずに案内する
  const user = await getCurrentUser();
  if (!user) {
    return (
      <p className="text-sm">
        参加するには <Link href="/login" className="underline">ログイン</Link>
        （アカウントがない場合は <Link href="/signup" className="underline">新規登録</Link>）してから、受け取った招待リンクをもう一度開いてください。
      </p>
    );
  }
  return (
    <>
      <p className="text-sm">{user.email} として参加します。</p>
      <AcceptInvitationForm />
    </>
  );
}
