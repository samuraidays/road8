import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { PASSWORD_MIN_LENGTH } from "@/lib/credentials";
import { signUp } from "./actions";

export default function SignupPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">新規登録</h1>
      <AuthForm
        action={signUp}
        submitLabel="登録する"
        passwordAutoComplete="new-password"
        passwordHint={`${PASSWORD_MIN_LENGTH}文字以上`}
      />
      <p className="text-sm">
        登録済みの場合は <Link href="/login" className="underline">ログイン</Link>
      </p>
    </main>
  );
}
