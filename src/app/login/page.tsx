import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { signIn } from "./actions";

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">ログイン</h1>
      <AuthForm action={signIn} submitLabel="ログイン" passwordAutoComplete="current-password" />
      <p className="text-sm">
        アカウントがない場合は <Link href="/signup" className="underline">新規登録</Link>
      </p>
    </main>
  );
}
