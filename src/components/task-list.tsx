import { CalendarCheckIcon, CalendarClockIcon } from "lucide-react";
import { addTaskToCalendar, deleteTask, setTaskStatus, updateTask } from "@/app/app/[tenantId]/tasks/actions";
import type { Option } from "@/components/okr-forms";
import { TaskCheckbox, TaskForm } from "@/components/task-forms";
import { RowActions, type MenuItemSpec } from "@/components/ux";
import { formatSchedule, splitJapanDateTime } from "@/lib/period";
import type { KeyResultGroup, Task } from "@/lib/tasks";
import { cn } from "@/lib/utils";

function formatDue(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

// タスク1件の行：完了のチェック・題名・やる日時・期日、右端の「…」から編集・カレンダー・削除
export function TaskItem({
  tenantId,
  task: t,
  members,
  context,
  googleConnected,
  keyResults,
}: {
  tenantId: string;
  task: Task;
  members: Option[];
  context?: string;
  googleConnected: boolean;
  keyResults?: KeyResultGroup[];
}) {
  const done = t.status === "done";
  const assignee = members.find((m) => m.id === t.assigneeUserId);
  const start = t.scheduledStart ? splitJapanDateTime(t.scheduledStart) : null;
  const end = t.scheduledEnd ? splitJapanDateTime(t.scheduledEnd) : null;
  const items: MenuItemSpec[] =
    googleConnected && t.scheduledStart && !done
      ? [{ label: t.calendarEventId ? "カレンダーの予定を更新" : "カレンダーに入れる", action: addTaskToCalendar.bind(null, tenantId, t.id) }]
      : [];

  return (
    <li className="flex items-start gap-3 text-sm">
      <span className="pt-0.5">
        <TaskCheckbox setStatus={setTaskStatus.bind(null, tenantId, t.id)} done={done} title={t.title} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={cn("break-words", done && "text-muted-foreground line-through")}>{t.title}</span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {t.scheduledStart && t.scheduledEnd ? (
            <span className="flex items-center gap-1">
              {t.calendarEventId ? (
                <CalendarCheckIcon className="size-3.5 text-progress" aria-label="カレンダーに登録済み" />
              ) : (
                <CalendarClockIcon className="size-3.5" aria-hidden="true" />
              )}
              {formatSchedule(t.scheduledStart, t.scheduledEnd)}
            </span>
          ) : null}
          {t.dueDate ? <span>期日 {formatDue(t.dueDate)}</span> : null}
          {assignee ? <span>{assignee.label}</span> : null}
          {context ? <span className="break-words">{context}</span> : null}
        </div>
      </div>
      <RowActions
        label={`「${t.title}」の操作`}
        editTitle="タスクを編集"
        editForm={
          <TaskForm
            action={updateTask.bind(null, tenantId, t.id)}
            members={members}
            values={{
              title: t.title,
              dueDate: t.dueDate,
              scheduleDate: start?.date ?? "",
              startTime: start?.time ?? "",
              endTime: end?.time ?? "",
              assigneeUserId: t.assigneeUserId,
              keyResultId: t.keyResultId,
            }}
            submitLabel="保存"
            idPrefix={`task-${t.id}`}
            keyResults={keyResults}
          />
        }
        items={items}
        deleteTitle="タスクを削除しますか？"
        deleteDescription={t.calendarEventId ? "カレンダーに入れた予定も消えます。" : undefined}
        deleteAction={deleteTask.bind(null, tenantId, t.id)}
      />
    </li>
  );
}
