import { Suspense } from "react";
import Link from "next/link";
import type { Option } from "@/components/okr-forms";
import { TaskItem } from "@/components/task-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listMembers, memberLabel } from "@/lib/members";
import { getGoogleStatus, listTasks, type TaskWithContext } from "@/lib/tasks";
import { DisconnectGoogleButton } from "@/components/google-forms";
import { disconnectGoogle } from "../../google/actions";
import { requireTenant } from "@/lib/tenants";

export default function TasksPage({ params, searchParams }: PageProps<"/app/[tenantId]/tasks">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">読み込み中…</p>}>
      <Tasks params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function TaskSection({
  title,
  tasks,
  tenantId,
  members,
  empty,
  googleConnected,
}: {
  title: string;
  tasks: TaskWithContext[];
  tenantId: string;
  members: Option[];
  empty: string;
  googleConnected: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {title}（{tasks.length}）
        </CardTitle>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {tasks.map((t) => (
              <TaskItem
                key={t.id}
                tenantId={tenantId}
                task={t}
                members={members}
                context={`${t.objectiveTitle} ／ ${t.keyResultTitle}`}
                googleConnected={googleConnected}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

async function Tasks({ params, searchParams }: Pick<PageProps<"/app/[tenantId]/tasks">, "params" | "searchParams">) {
  const [{ tenantId }, query] = await Promise.all([params, searchParams]);
  const context = await requireTenant(tenantId);
  const [tasks, members, google] = await Promise.all([listTasks(context), listMembers(context), getGoogleStatus(context.user.id)]);
  const memberOptions: Option[] = members.map((m) => ({ id: m.userId, label: memberLabel(m, members) }));
  const tid = context.tenant.id;
  const scheduled = tasks.open.filter((t) => t.scheduledStart);
  const unscheduled = tasks.open.filter((t) => !t.scheduledStart);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">タスク</h1>
      <p className="text-sm text-muted-foreground">
        タスクは <Link href={`/app/${tid}/okr`} className="underline">OKR</Link> の Key Result から作ります。やる日時を入れたタスクは、Google カレンダーに予定として入れられます。
      </p>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Google カレンダー</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {query.google === "connected" ? <p role="status" className="text-green-700 dark:text-green-400">連携しました</p> : null}
          {query.google === "error" ? <p role="alert" className="text-destructive">連携できませんでした。もう一度試してください</p> : null}
          {google.connected ? (
            <div className="flex flex-wrap items-center gap-3">
              <span>連携しています。予定は「road8」という名前のカレンダーに入ります。</span>
              <a href={`/app/google/connect?returnTo=/app/${tid}/tasks`} className="underline">連携し直す</a>
              <DisconnectGoogleButton action={disconnectGoogle} />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-muted-foreground">まだ連携していません。road8 専用のカレンダーを作り、そこにだけ予定を書き込みます（既存の予定には触れません）。</span>
              <a href={`/app/google/connect?returnTo=/app/${tid}/tasks`} className="rounded-md border px-3 py-1.5 hover:bg-muted">
                連携する
              </a>
            </div>
          )}
        </CardContent>
      </Card>
      <TaskSection title="やる日時が決まっているもの" tasks={scheduled} tenantId={tid} members={memberOptions} empty="ありません" googleConnected={google.connected} />
      <TaskSection title="まだ日時を決めていないもの" tasks={unscheduled} tenantId={tid} members={memberOptions} empty="ありません" googleConnected={google.connected} />
      <TaskSection title="最近完了したもの（2週間）" tasks={tasks.done} tenantId={tid} members={memberOptions} empty="ありません" googleConnected={google.connected} />
    </div>
  );
}
