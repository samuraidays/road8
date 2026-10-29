import Link from "next/link";

// 利用規約・プライバシーポリシーの共通の枠
export function LegalPage({ title, effective, children }: { title: string; effective: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 text-sm leading-7">
      <Link href="/" className="font-semibold">
        road8
      </Link>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">制定日：{effective}</p>
      {children}
    </main>
  );
}

export function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="flex flex-col gap-2">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}
