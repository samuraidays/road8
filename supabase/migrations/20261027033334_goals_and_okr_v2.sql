-- 人生のゴールと OKR の見直し（設計書 §10、計画書 v1.5）の前半：
-- 人生のゴール・柱・「なぜ」（本人だけ）、四半期単位の Objective、数値型の Key Result と記録、習慣と実施の記録。
-- 振り返り（週・四半期）は後半のマイグレーションで追加する。
--
-- 方針は初期スキーマと同じ：権限は列単位で明示する、anon には与えない、全テーブルで RLS を有効にする、
-- 親子のテナントの食い違いは複合外部キーで止める

------------------------------------------------------------------------------
-- 1. 人生のゴールと柱（テナントのメンバーに見せる。編集は Owner）
------------------------------------------------------------------------------

create table public.life_goals (
  tenant_id  uuid primary key references public.tenants (id) on delete cascade,
  statement  text not null default '' check (char_length(statement) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pillars (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  position    smallint not null default 0 check (position between 0 and 99),
  title       text not null check (char_length(title) between 1 and 100),
  description text not null default '' check (char_length(description) <= 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, tenant_id)
);
create index pillars_tenant_id_idx on public.pillars (tenant_id);

------------------------------------------------------------------------------
-- 2. Objective：期間（日付）を年と四半期に置き換え、柱にひもづける
------------------------------------------------------------------------------

-- 既定値は日本時間の今の年と四半期
alter table public.objectives
  add column pillar_id uuid,
  add column year smallint not null default extract(year from (now() at time zone 'Asia/Tokyo'))::smallint,
  add column quarter smallint not null default extract(quarter from (now() at time zone 'Asia/Tokyo'))::smallint;

-- 既存の行は、開始日（なければ作成日）から年と四半期を埋める
update public.objectives
   set year = extract(year from coalesce(period_start, (created_at at time zone 'Asia/Tokyo')::date))::smallint,
       quarter = extract(quarter from coalesce(period_start, (created_at at time zone 'Asia/Tokyo')::date))::smallint;

alter table public.objectives
  add constraint objectives_year_check check (year between 2000 and 2100),
  add constraint objectives_quarter_check check (quarter between 1 and 4),
  -- 柱は同じテナントのものだけ。柱を消したら Objective のひもづけを外す
  add constraint objectives_pillar_fkey foreign key (pillar_id, tenant_id)
    references public.pillars (id, tenant_id) on delete set null (pillar_id),
  drop column period_start,
  drop column period_end;

create index objectives_tenant_period_idx on public.objectives (tenant_id, year, quarter);
create index objectives_pillar_id_idx on public.objectives (pillar_id);

grant insert (pillar_id, year, quarter) on public.objectives to authenticated;
grant update (pillar_id, year, quarter) on public.objectives to authenticated;

------------------------------------------------------------------------------
-- 3. Key Result：数値型（開始値・目標値・単位）。数値型の進捗は記録から計算する
------------------------------------------------------------------------------

alter table public.key_results
  add column kind text not null default 'manual' check (kind in ('manual', 'metric')),
  add column start_value numeric(14, 2),
  add column target_value numeric(14, 2),
  add column unit text not null default '' check (char_length(unit) <= 20),
  add constraint key_results_metric_check check (
    kind = 'manual'
    or (start_value is not null and target_value is not null and start_value <> target_value)
  );

grant insert (kind, start_value, target_value, unit) on public.key_results to authenticated;
grant update (kind, start_value, target_value, unit) on public.key_results to authenticated;

create table public.kr_measurements (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  key_result_id uuid not null,
  measured_on   date not null,
  value         numeric(14, 2) not null,
  created_by    uuid default auth.uid() references public.profiles (user_id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- 同じ日の記録は1つ（アプリは上書きする）
  unique (key_result_id, measured_on),
  foreign key (key_result_id, tenant_id) references public.key_results (id, tenant_id) on delete cascade
);
create index kr_measurements_tenant_id_idx on public.kr_measurements (tenant_id);

------------------------------------------------------------------------------
-- 4. 習慣（週○回）と実施の記録
------------------------------------------------------------------------------

create table public.habits (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  key_result_id  uuid not null,
  title          text not null check (char_length(title) between 1 and 200),
  times_per_week smallint not null default 3 check (times_per_week between 1 and 7),
  archived_at    timestamptz,
  created_by     uuid default auth.uid() references public.profiles (user_id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (key_result_id, tenant_id) references public.key_results (id, tenant_id) on delete cascade
);
create index habits_tenant_id_idx on public.habits (tenant_id);
create index habits_key_result_id_idx on public.habits (key_result_id);

create table public.habit_checks (
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  habit_id   uuid not null,
  done_on    date not null,
  created_by uuid default auth.uid() references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (habit_id, done_on),
  foreign key (habit_id, tenant_id) references public.habits (id, tenant_id) on delete cascade
);
create index habit_checks_tenant_id_idx on public.habit_checks (tenant_id);

------------------------------------------------------------------------------
-- 5. 「なぜ」（同じテナントでも本人だけ。設計書 §10-1）
------------------------------------------------------------------------------

create table public.reasons (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  user_id      uuid not null default auth.uid(),
  pillar_id    uuid,
  objective_id uuid,
  body         text not null check (char_length(body) <= 2000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- 柱か Objective のどちらか1つにひもづく
  check (num_nonnulls(pillar_id, objective_id) = 1),
  -- 本人はそのテナントのメンバー。テナントを抜けたら消える
  foreign key (tenant_id, user_id) references public.memberships (tenant_id, user_id) on delete cascade,
  foreign key (pillar_id, tenant_id) references public.pillars (id, tenant_id) on delete cascade,
  foreign key (objective_id, tenant_id) references public.objectives (id, tenant_id) on delete cascade,
  unique (user_id, pillar_id),
  unique (user_id, objective_id)
);
create index reasons_tenant_user_idx on public.reasons (tenant_id, user_id);

------------------------------------------------------------------------------
-- 6. トリガー（updated_at と監査ログ。監査ログには中身を残さない）
------------------------------------------------------------------------------

create trigger set_updated_at before update on public.life_goals
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.pillars
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.kr_measurements
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.habits
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.reasons
  for each row execute function private.set_updated_at();

create trigger audit_row_change after insert or update or delete on public.life_goals
  for each row execute function private.audit_row_change();
create trigger audit_row_change after insert or update or delete on public.pillars
  for each row execute function private.audit_row_change();
create trigger audit_row_change after insert or update or delete on public.kr_measurements
  for each row execute function private.audit_row_change();
create trigger audit_row_change after insert or update or delete on public.habits
  for each row execute function private.audit_row_change();
create trigger audit_row_change after insert or update or delete on public.habit_checks
  for each row execute function private.audit_row_change();
create trigger audit_row_change after insert or update or delete on public.reasons
  for each row execute function private.audit_row_change();

------------------------------------------------------------------------------
-- 7. 権限（grant）。設計書 §10-3
------------------------------------------------------------------------------

grant select on public.life_goals to authenticated;
grant insert (tenant_id, statement) on public.life_goals to authenticated;
grant update (statement) on public.life_goals to authenticated;

grant select on public.pillars to authenticated;
grant insert (id, tenant_id, position, title, description) on public.pillars to authenticated;
grant update (position, title, description) on public.pillars to authenticated;
grant delete on public.pillars to authenticated;

grant select on public.kr_measurements to authenticated;
grant insert (id, tenant_id, key_result_id, measured_on, value, created_by) on public.kr_measurements to authenticated;
grant update (value) on public.kr_measurements to authenticated;
grant delete on public.kr_measurements to authenticated;

grant select on public.habits to authenticated;
grant insert (id, tenant_id, key_result_id, title, times_per_week, created_by) on public.habits to authenticated;
grant update (title, times_per_week, archived_at) on public.habits to authenticated;
grant delete on public.habits to authenticated;

grant select on public.habit_checks to authenticated;
grant insert (tenant_id, habit_id, done_on, created_by) on public.habit_checks to authenticated;
grant delete on public.habit_checks to authenticated;

grant select on public.reasons to authenticated;
grant insert (id, tenant_id, user_id, pillar_id, objective_id, body) on public.reasons to authenticated;
grant update (body) on public.reasons to authenticated;
grant delete on public.reasons to authenticated;

grant select, insert, update, delete on public.life_goals, public.pillars, public.kr_measurements,
  public.habits, public.habit_checks, public.reasons to service_role;

------------------------------------------------------------------------------
-- 8. RLS
------------------------------------------------------------------------------

alter table public.life_goals enable row level security;
alter table public.pillars enable row level security;
alter table public.kr_measurements enable row level security;
alter table public.habits enable row level security;
alter table public.habit_checks enable row level security;
alter table public.reasons enable row level security;

-- life_goals・pillars：見るのはメンバー、書くのは Owner
create policy life_goals_select on public.life_goals for select to authenticated
  using (private.is_member(tenant_id));
create policy life_goals_insert on public.life_goals for insert to authenticated
  with check (private.is_owner(tenant_id));
create policy life_goals_update on public.life_goals for update to authenticated
  using (private.is_owner(tenant_id))
  with check (private.is_owner(tenant_id));

create policy pillars_select on public.pillars for select to authenticated
  using (private.is_member(tenant_id));
create policy pillars_insert on public.pillars for insert to authenticated
  with check (private.is_owner(tenant_id));
create policy pillars_update on public.pillars for update to authenticated
  using (private.is_owner(tenant_id))
  with check (private.is_owner(tenant_id));
create policy pillars_delete on public.pillars for delete to authenticated
  using (private.is_owner(tenant_id));

-- kr_measurements・habits・habit_checks：メンバー
create policy kr_measurements_select on public.kr_measurements for select to authenticated
  using (private.is_member(tenant_id));
create policy kr_measurements_insert on public.kr_measurements for insert to authenticated
  with check (private.is_member(tenant_id) and created_by = (select auth.uid()));
create policy kr_measurements_update on public.kr_measurements for update to authenticated
  using (private.is_member(tenant_id))
  with check (private.is_member(tenant_id));
create policy kr_measurements_delete on public.kr_measurements for delete to authenticated
  using (private.is_member(tenant_id));

create policy habits_select on public.habits for select to authenticated
  using (private.is_member(tenant_id));
create policy habits_insert on public.habits for insert to authenticated
  with check (private.is_member(tenant_id) and created_by = (select auth.uid()));
create policy habits_update on public.habits for update to authenticated
  using (private.is_member(tenant_id))
  with check (private.is_member(tenant_id));
create policy habits_delete on public.habits for delete to authenticated
  using (private.is_member(tenant_id));

create policy habit_checks_select on public.habit_checks for select to authenticated
  using (private.is_member(tenant_id));
create policy habit_checks_insert on public.habit_checks for insert to authenticated
  with check (private.is_member(tenant_id) and created_by = (select auth.uid()));
create policy habit_checks_delete on public.habit_checks for delete to authenticated
  using (private.is_member(tenant_id));

-- reasons：同じテナントでも本人だけ（Owner も他人の分は見られない）
create policy reasons_select on public.reasons for select to authenticated
  using (user_id = (select auth.uid()) and private.is_member(tenant_id));
create policy reasons_insert on public.reasons for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_member(tenant_id));
create policy reasons_update on public.reasons for update to authenticated
  using (user_id = (select auth.uid()) and private.is_member(tenant_id))
  with check (user_id = (select auth.uid()) and private.is_member(tenant_id));
create policy reasons_delete on public.reasons for delete to authenticated
  using (user_id = (select auth.uid()) and private.is_member(tenant_id));
