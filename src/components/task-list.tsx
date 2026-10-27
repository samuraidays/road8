import { CalendarClockIcon } from "lucide-react";
import { addTaskToCalendar, deleteTask, setTaskStatus, updateTask } from "@/app/app/[tenantId]/tasks/actions";
import { CalendarButton } from "@/components/google-forms";
import { DeleteButton, type Option } from "@/components/okr-forms";
import { TaskCheckbox, TaskForm } from "@/components/task-forms";
import { formatSchedule, splitJapanDateTime } from "@/lib/period";
import type { Task } from "@/lib/tasks";
import { cn } from "@/lib/utils";

function formatDue(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

// タスク1件の行（完了の付け外し・やる日時・期日・編集と削除）
export function TaskItem({
  tenantId,
  task: t,
  members,
  context,
  googleConnected,
}: {
  tenantId: string;
  task: Task;
  members: Option[];
  context?: string;
  googleConnected: boolean;
}) {
  const done = t.status === "done";
  const assignee = members.find((m) => m.id === t.assigneeUserId);
  const start = t.scheduledStart ? splitJapanDateTime(t.scheduledStart) : null;
  const end = t.scheduledEnd ? splitJapanDateTime(t.scheduledEnd) : null;

  return (
    <li className="flex flex-col gap-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <TaskCheckbox setStatus={setTaskStatus.bind(null, tenantId, t.id)} done={done} title={t.title} />
        <span className={cn("min-w-0 flex-1 break-words", done && "text-muted-foreground line-through")}>{t.title}</span>
        {t.scheduledStart && t.scheduledEnd ? (
          <span className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
            <CalendarClockIcon className="size-3.5" aria-hidden="true" />
            {formatSchedule(t.scheduledStart, t.scheduledEnd)}
          </span>
        ) : null}
        {t.dueDate ? <span className="text-xs text-muted-foreground">期日 {formatDue(t.dueDate)}</span> : null}
        {assignee ? <span className="text-xs text-muted-foreground">{assignee.label}</span> : null}
        {googleConnected && t.scheduledStart && !done ? (
          <CalendarButton add={addTaskToCalendar.bind(null, tenantId, t.id)} added={t.calendarEventId !== null} />
        ) : null}
      </div>
      {context ? <p className="pl-6 text-xs break-words text-muted-foreground">{context}</p> : null}
      <details className="pl-6">
        <summary className="cursor-pointer text-xs text-muted-foreground">編集</summary>
        <div className="mt-2 flex flex-col gap-2">
          <TaskForm
            key={JSON.stringify([t.title, t.dueDate, t.scheduledStart, t.scheduledEnd, t.assigneeUserId])}
            action={updateTask.bind(null, tenantId, t.id)}
            members={members}
            values={{
              title: t.title,
              dueDate: t.dueDate,
              scheduleDate: start?.date ?? "",
              startTime: start?.time ?? "",
              endTime: end?.time ?? "",
              assigneeUserId: t.assigneeUserId,
            }}
            submitLabel="保存"
            idPrefix={`task-${t.id}`}
          />
          <DeleteButton action={deleteTask.bind(null, tenantId, t.id)} label="タスクを削除" confirmMessage="このタスクを削除します。よろしいですか？" />
        </div>
      </details>
    </li>
  );
}
