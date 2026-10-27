-- タスクに「いつやるか」の時間帯を持たせる（設計書 §10-2 で、タスクの画面を作るときに決めるとしたもの）。
-- カレンダーに予定として入れるときの開始・終了になる

alter table public.tasks
  add column scheduled_start timestamptz,
  add column scheduled_end timestamptz,
  -- 時間帯は開始と終了の両方があり、終了が開始より後で、24時間以内
  add constraint tasks_schedule_check check (
    (scheduled_start is null and scheduled_end is null)
    or (scheduled_start is not null and scheduled_end is not null
        and scheduled_end > scheduled_start and scheduled_end <= scheduled_start + interval '24 hours')
  );

create index tasks_tenant_schedule_idx on public.tasks (tenant_id, scheduled_start);

grant insert (scheduled_start, scheduled_end) on public.tasks to authenticated;
grant update (scheduled_start, scheduled_end) on public.tasks to authenticated;
