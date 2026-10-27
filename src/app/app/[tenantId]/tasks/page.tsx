import { Suspense } from "react";
import Link from "next/link";
import type { Option } from "@/components/okr-forms";
import { TaskItem } from "@/components/task-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listMembers, memberLabel } from "@/lib/members";
import { listTasks, type TaskWithContext } from "@/lib/tasks";
import { requireTenant } from "@/lib/tenants";

export default function TasksPage({ params }: PageProps<"/app/[tenantId]/tasks">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">読み込み中…</p>}>
      <Tasks params={params} />
    </Suspense>
  );
}

function TaskSection({ title, tasks, tenantId, members, empty }: { title: string; tasks: TaskWithContext[]; tenantId: string; members: Option[]; empty: string }) {
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
              <TaskItem key={t.id} tenantId={tenantId} task={t} members={members} context={`${t.objectiveTitle} ／ ${t.keyResultTitle}`} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

async function Tasks({ params }: Pick<PageProps<"/app/[tenantId]/tasks">, "params">) {
  const { tenantId } = await params;
  const context = await requireTenant(tenantId);
  const [tasks, members] = await Promise.all([listTasks(context), listMembers(context)]);
  const memberOptions: Option[] = members.map((m) => ({ id: m.userId, label: memberLabel(m, members) }));
  const tid = context.tenant.id;
  const scheduled = tasks.open.filter((t) => t.scheduledStart);
  const unscheduled = tasks.open.filter((t) => !t.scheduledStart);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">タスク</h1>
      <p className="text-sm text-muted-foreground">
        タスクは <Link href={`/app/${tid}/okr`} className="underline">OKR</Link> の Key Result から作ります。やる日時を入れたタスクは、カレンダーに予定として入れられるようにします（Google カレンダー連携は準備中）。
      </p>
      <TaskSection title="やる日時が決まっているもの" tasks={scheduled} tenantId={tid} members={memberOptions} empty="ありません" />
      <TaskSection title="まだ日時を決めていないもの" tasks={unscheduled} tenantId={tid} members={memberOptions} empty="ありません" />
      <TaskSection title="最近完了したもの（2週間）" tasks={tasks.done} tenantId={tid} members={memberOptions} empty="ありません" />
    </div>
  );
}
