-- road8 初期スキーマ
-- 設計書: docs/design/p1-design.md（§2 データモデル、§3 grant と RLS、§5 監査ログ）
-- 権限マトリクス: security/permissions.yaml
--
-- 方針:
--   - 既定の自動付与に頼らず、必要な権限だけを明示的に付与する（設計書 §3-1、§7 #2）
--   - anon には業務テーブルの権限を一切与えない
--   - 全テーブルで RLS を有効にする
--   - 所属確認の関数・トリガー関数は Data API に公開しない private スキーマに置く

------------------------------------------------------------------------------
-- 0. 既定の権限の取り消し
------------------------------------------------------------------------------

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;
-- 関数は PostgreSQL 全体の既定で PUBLIC に実行権限が付くため、スキーマを指定せずに取り消す
alter default privileges for role postgres
  revoke execute on functions from public;

------------------------------------------------------------------------------
-- 1. private スキーマ（Data API に公開しない）
------------------------------------------------------------------------------

create schema private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

------------------------------------------------------------------------------
-- 2. 型
------------------------------------------------------------------------------

create type public.membership_role as enum ('owner', 'member');
create type public.task_status as enum ('todo', 'in_progress', 'done');

------------------------------------------------------------------------------
-- 3. テーブル
------------------------------------------------------------------------------

create table public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 50),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.tenants (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 100),
  created_by uuid default auth.uid() references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 所属とロールの唯一の正本（JWT には入れない）
create table public.memberships (
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  user_id    uuid not null references public.profiles (user_id) on delete cascade,
  role       public.membership_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index memberships_user_id_idx on public.memberships (user_id);

-- 招待トークンはハッシュだけを保存する（設計書 §2-2、§8 #7）
create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  role        public.membership_role not null default 'member',
  token_hash  text not null unique,
  invited_by  uuid default auth.uid() references public.profiles (user_id) on delete set null,
  expires_at  timestamptz not null default now() + interval '72 hours',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (user_id) on delete set null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index invitations_tenant_id_idx on public.invitations (tenant_id);

create table public.objectives (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 200),
  description   text not null default '' check (char_length(description) <= 2000),
  period_start  date,
  period_end    date,
  owner_user_id uuid,
  created_by    uuid default auth.uid() references public.profiles (user_id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, tenant_id),
  check (period_end is null or period_start is null or period_end >= period_start),
  -- 担当者は同じテナントのメンバーだけ。メンバーを外したら担当者を空にする（設計書 §2-3、§8 #3）
  foreign key (tenant_id, owner_user_id)
    references public.memberships (tenant_id, user_id) on delete set null (owner_user_id)
);
create index objectives_tenant_id_idx on public.objectives (tenant_id);

create table public.key_results (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  objective_id uuid not null,
  title        text not null check (char_length(title) between 1 and 200),
  progress     integer not null default 0 check (progress between 0 and 100),
  created_by   uuid default auth.uid() references public.profiles (user_id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, tenant_id),
  -- 親の Objective と同じテナントでなければ作れない（設計書 §2-3）
  foreign key (objective_id, tenant_id)
    references public.objectives (id, tenant_id) on delete cascade
);
create index key_results_tenant_id_idx on public.key_results (tenant_id);
create index key_results_objective_id_idx on public.key_results (objective_id);

create table public.tasks (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  key_result_id     uuid not null,
  title             text not null check (char_length(title) between 1 and 200),
  assignee_user_id  uuid,
  due_date          date,
  status            public.task_status not null default 'todo',
  calendar_event_id text,
  created_by        uuid default auth.uid() references public.profiles (user_id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (key_result_id, tenant_id)
    references public.key_results (id, tenant_id) on delete cascade,
  foreign key (tenant_id, assignee_user_id)
    references public.memberships (tenant_id, user_id) on delete set null (assignee_user_id)
);
create index tasks_tenant_id_idx on public.tasks (tenant_id);
create index tasks_key_result_id_idx on public.tasks (key_result_id);

-- リフレッシュトークン本体は Vault に置き、ここには参照 ID だけ（設計書 §6、§8 #5）
create table public.google_connections (
  user_id         uuid primary key references public.profiles (user_id) on delete cascade,
  vault_secret_id uuid not null,
  scopes          text not null,
  connected_at    timestamptz not null default now(),
  revoked_at      timestamptz,
  updated_at      timestamptz not null default now()
);

-- 追記専用。テナントを削除してもログは残すため、tenant_id に外部キーを付けない（設計書 §5）
create table public.audit_logs (
  id            bigint generated always as identity primary key,
  tenant_id     uuid,
  actor_user_id uuid,
  action        text not null,
  target_type   text,
  target_id     text,
  result        text not null default 'success' check (result in ('success', 'denied', 'error')),
  ip            inet,
  user_agent    text,
  request_id    text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index audit_logs_tenant_id_created_at_idx on public.audit_logs (tenant_id, created_at desc);

------------------------------------------------------------------------------
-- 4. 所属確認の関数（RLS から使う。設計書 §3-2）
------------------------------------------------------------------------------

create function private.is_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = p_tenant_id
      and m.user_id = (select auth.uid())
  );
$$;

create function private.is_owner(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = p_tenant_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;

create function private.shares_tenant(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.tenant_id = mine.tenant_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = p_user_id
  );
$$;

grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.is_owner(uuid) to authenticated;
grant execute on function private.shares_tenant(uuid) to authenticated;

------------------------------------------------------------------------------
-- 5. トリガー
------------------------------------------------------------------------------

-- updated_at の自動更新
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.tenants
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.objectives
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.key_results
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.tasks
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.google_connections
  for each row execute function private.set_updated_at();

-- サインアップ時にプロフィールを作る
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 50)
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- テナントを作った人を Owner にする
create function private.handle_new_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is null then
    raise exception 'tenant must have a creator' using errcode = 'check_violation';
  end if;
  insert into public.memberships (tenant_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create trigger on_tenant_created after insert on public.tenants
  for each row execute function private.handle_new_tenant();

-- 最後の Owner を降格・削除させない（テナント自体の削除に伴うものは許す）
create function private.protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role <> 'owner' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.role = 'owner' then
    return new;
  end if;
  -- テナントの削除による連鎖削除では、親のテナントはもう見えない
  if not exists (select 1 from public.tenants t where t.id = old.tenant_id) then
    return coalesce(new, old);
  end if;
  if not exists (
    select 1 from public.memberships m
    where m.tenant_id = old.tenant_id
      and m.role = 'owner'
      and m.user_id <> old.user_id
  ) then
    raise exception 'cannot remove or demote the last owner' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger protect_last_owner before update or delete on public.memberships
  for each row execute function private.protect_last_owner();

-- データ変更の監査ログ（設計書 §5）。値そのもの（招待トークンのハッシュなど）は記録せず、変更された列名だけを残す
create function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row       jsonb;
  v_old       jsonb;
  v_tenant_id uuid;
  v_target_id text;
  v_changed   text[];
begin
  v_row := to_jsonb(coalesce(new, old));
  v_old := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  v_tenant_id := case when tg_table_name = 'tenants' then (v_row ->> 'id')::uuid
                      else (v_row ->> 'tenant_id')::uuid end;
  v_target_id := case when tg_table_name = 'memberships' then v_row ->> 'user_id'
                      else v_row ->> 'id' end;
  if tg_op = 'UPDATE' then
    select array_agg(key order by key) into v_changed
    from jsonb_each(v_row) n
    where n.value is distinct from v_old -> n.key
      and n.key not in ('updated_at');
  end if;

  insert into public.audit_logs (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (
    v_tenant_id,
    (select auth.uid()),
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    v_target_id,
    case when v_changed is not null then jsonb_build_object('changed', to_jsonb(v_changed)) else '{}'::jsonb end
  );
  return coalesce(new, old);
end;
$$;

create trigger audit_row_change after insert or update or delete on public.tenants
  for each row execute function private.audit_row_change();
create trigger audit_row_change after insert or update or delete on public.memberships
  for each row execute function private.audit_row_change();
create trigger audit_row_change after insert or update or delete on public.invitations
  for each row execute function private.audit_row_change();
create trigger audit_row_change after insert or update or delete on public.objectives
  for each row execute function private.audit_row_change();
create trigger audit_row_change after insert or update or delete on public.key_results
  for each row execute function private.audit_row_change();
create trigger audit_row_change after insert or update or delete on public.tasks
  for each row execute function private.audit_row_change();

------------------------------------------------------------------------------
-- 6. 権限（grant）。設計書 §3-1
--    列単位で付与し、tenant_id・id・created_by などを後から書き換えられないようにする
------------------------------------------------------------------------------

-- authenticated
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

grant select on public.tenants to authenticated;
grant insert (id, name, created_by) on public.tenants to authenticated;
grant update (name) on public.tenants to authenticated;
grant delete on public.tenants to authenticated;

grant select on public.memberships to authenticated;
grant update (role) on public.memberships to authenticated;
grant delete on public.memberships to authenticated;

grant select (id, tenant_id, role, invited_by, expires_at, accepted_at, accepted_by, revoked_at, created_at)
  on public.invitations to authenticated;
grant insert (tenant_id, role, token_hash, invited_by) on public.invitations to authenticated;
grant update (revoked_at) on public.invitations to authenticated;

grant select on public.objectives to authenticated;
grant insert (id, tenant_id, title, description, period_start, period_end, owner_user_id, created_by)
  on public.objectives to authenticated;
grant update (title, description, period_start, period_end, owner_user_id) on public.objectives to authenticated;
grant delete on public.objectives to authenticated;

grant select on public.key_results to authenticated;
grant insert (id, tenant_id, objective_id, title, progress, created_by) on public.key_results to authenticated;
grant update (title, progress) on public.key_results to authenticated;
grant delete on public.key_results to authenticated;

grant select on public.tasks to authenticated;
grant insert (id, tenant_id, key_result_id, title, assignee_user_id, due_date, status, created_by)
  on public.tasks to authenticated;
grant update (title, assignee_user_id, due_date, status) on public.tasks to authenticated;
grant delete on public.tasks to authenticated;

grant select (user_id, scopes, connected_at, revoked_at) on public.google_connections to authenticated;

grant select on public.audit_logs to authenticated;

-- service_role（サーバーだけが使う。利用箇所は設計書 §3-4 の3つに限る）
grant select, insert, update, delete on public.profiles, public.tenants, public.memberships, public.invitations,
  public.objectives, public.key_results, public.tasks, public.google_connections to service_role;
-- 監査ログは service_role でも追記と参照だけ（書き換え・削除はさせない）
grant select, insert on public.audit_logs to service_role;

------------------------------------------------------------------------------
-- 7. RLS（設計書 §3-3）
------------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.objectives enable row level security;
alter table public.key_results enable row level security;
alter table public.tasks enable row level security;
alter table public.google_connections enable row level security;
alter table public.audit_logs enable row level security;

-- profiles: 自分、または同じテナントの所属者
create policy profiles_select on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select private.shares_tenant(user_id)));
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- tenants
create policy tenants_select on public.tenants for select to authenticated
  using ((select private.is_member(id)));
create policy tenants_insert on public.tenants for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy tenants_update on public.tenants for update to authenticated
  using ((select private.is_owner(id)))
  with check ((select private.is_owner(id)));
create policy tenants_delete on public.tenants for delete to authenticated
  using ((select private.is_owner(id)));

-- memberships: INSERT のポリシーは作らない（招待の受諾はサーバーが service_role で行う）
create policy memberships_select on public.memberships for select to authenticated
  using ((select private.is_member(tenant_id)));
create policy memberships_update on public.memberships for update to authenticated
  using ((select private.is_owner(tenant_id)))
  with check ((select private.is_owner(tenant_id)));
create policy memberships_delete on public.memberships for delete to authenticated
  using ((select private.is_owner(tenant_id)) or user_id = (select auth.uid()));

-- invitations: Owner だけ
create policy invitations_select on public.invitations for select to authenticated
  using ((select private.is_owner(tenant_id)));
create policy invitations_insert on public.invitations for insert to authenticated
  with check ((select private.is_owner(tenant_id)) and invited_by = (select auth.uid()));
create policy invitations_update on public.invitations for update to authenticated
  using ((select private.is_owner(tenant_id)))
  with check ((select private.is_owner(tenant_id)));

-- objectives: 削除は Owner だけ（設計書 §8 #2）
create policy objectives_select on public.objectives for select to authenticated
  using ((select private.is_member(tenant_id)));
create policy objectives_insert on public.objectives for insert to authenticated
  with check ((select private.is_member(tenant_id)) and created_by = (select auth.uid()));
create policy objectives_update on public.objectives for update to authenticated
  using ((select private.is_member(tenant_id)))
  with check ((select private.is_member(tenant_id)));
create policy objectives_delete on public.objectives for delete to authenticated
  using ((select private.is_owner(tenant_id)));

-- key_results
create policy key_results_select on public.key_results for select to authenticated
  using ((select private.is_member(tenant_id)));
create policy key_results_insert on public.key_results for insert to authenticated
  with check ((select private.is_member(tenant_id)) and created_by = (select auth.uid()));
create policy key_results_update on public.key_results for update to authenticated
  using ((select private.is_member(tenant_id)))
  with check ((select private.is_member(tenant_id)));
create policy key_results_delete on public.key_results for delete to authenticated
  using ((select private.is_member(tenant_id)));

-- tasks
create policy tasks_select on public.tasks for select to authenticated
  using ((select private.is_member(tenant_id)));
create policy tasks_insert on public.tasks for insert to authenticated
  with check ((select private.is_member(tenant_id)) and created_by = (select auth.uid()));
create policy tasks_update on public.tasks for update to authenticated
  using ((select private.is_member(tenant_id)))
  with check ((select private.is_member(tenant_id)));
create policy tasks_delete on public.tasks for delete to authenticated
  using ((select private.is_member(tenant_id)));

-- google_connections: 自分の行のメタ情報だけ
create policy google_connections_select on public.google_connections for select to authenticated
  using (user_id = (select auth.uid()));

-- audit_logs: 自テナントの Owner だけが読める。書き込みのポリシーは作らない
create policy audit_logs_select on public.audit_logs for select to authenticated
  using ((select private.is_owner(tenant_id)));
