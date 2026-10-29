// 読み込み中に、文字ではなく画面の形を先に出す（設計書 §11）
export function PageSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-busy="true" aria-label="読み込み中">
      <div className="h-7 w-40 rounded-md bg-muted" />
      <div className="h-24 rounded-xl bg-muted" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-40 rounded-xl bg-muted" />
        <div className="h-40 rounded-xl bg-muted" />
      </div>
    </div>
  );
}
