-- 人生のゴールと OKR の見直し（設計書 §10、計画書 v1.5）の後半：
-- 週の振り返り・四半期の振り返り（文章は同じテナントでも本人だけ）と、KR の採点（メンバーに見せる）

------------------------------------------------------------------------------
-- 1. KR の採点と次の扱い（四半期の振り返りで付ける。メンバーに見せる）
------------------------------------------------------------------------------

alter table public.key_results
  add column score numeric(2, 1) check (score between 0.0 and 1.0),
  add column next_action text check (next_action in ('continue', 'stop', 'change'));

grant update (score, next_action) on public.key_results to authenticated;

------------------------------------------------------------------------------
-- 2. 振り返り（本人だけ。設計書 §10-1）
------------------------------------------------------------------------------

create table public.weekly_reviews (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  user_id    uuid not null default auth.uid(),
  -- 週の初め（月曜日）
  week_start date not null check (extract(isodow from week_start) = 1),
  went_well  text not null default '' check (char_length(went_well) <= 2000),
  went_wrong text not null default '' check (char_length(went_wrong) <= 2000),
  next_focus text not null default '' check (char_length(next_focus) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id, week_start),
  -- 本人はそのテナントのメンバー。テナントを抜けたら消える
  foreign key (tenant_id, user_id) references public.memberships (tenant_id, user_id) on delete cascade
);

create table public.quarterly_reviews (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  user_id    uuid not null default auth.uid(),
  year       smallint not null check (year between 2000 and 2100),
  quarter    smallint not null check (quarter between 1 and 4),
  learned    text not null default '' check (char_length(learned) <= 2000),
  next_steps text not null default '' check (char_length(next_steps) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id, year, quarter),
  foreign key (tenant_id, user_id) references public.memberships (tenant_id, user_id) on delete cascade
);

create trigger set_updated_at before update on public.weekly_reviews
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.quarterly_reviews
  for each row execute function private.set_updated_at();

-- 監査ログには操作と変更された列名だけを残す（中身は残さない。設計書 §10-4）
create trigger audit_row_change after insert or update or delete on public.weekly_reviews
  for each row execute function private.audit_row_change();
create trigger audit_row_change after insert or update or delete on public.quarterly_reviews
  for each row execute function private.audit_row_change();

------------------------------------------------------------------------------
-- 3. 権限（grant）
------------------------------------------------------------------------------

grant select on public.weekly_reviews to authenticated;
grant insert (id, tenant_id, user_id, week_start, went_well, went_wrong, next_focus) on public.weekly_reviews to authenticated;
grant update (went_well, went_wrong, next_focus) on public.weekly_reviews to authenticated;
grant delete on public.weekly_reviews to authenticated;

grant select on public.quarterly_reviews to authenticated;
grant insert (id, tenant_id, user_id, year, quarter, learned, next_steps) on public.quarterly_reviews to authenticated;
grant update (learned, next_steps) on public.quarterly_reviews to authenticated;
grant delete on public.quarterly_reviews to authenticated;

grant select, insert, update, delete on public.weekly_reviews, public.quarterly_reviews to service_role;

------------------------------------------------------------------------------
-- 4. RLS：同じテナントでも本人だけ（Owner も他人の分は見られない）
------------------------------------------------------------------------------

alter table public.weekly_reviews enable row level security;
alter table public.quarterly_reviews enable row level security;

create policy weekly_reviews_select on public.weekly_reviews for select to authenticated
  using (user_id = (select auth.uid()) and private.is_member(tenant_id));
create policy weekly_reviews_insert on public.weekly_reviews for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_member(tenant_id));
create policy weekly_reviews_update on public.weekly_reviews for update to authenticated
  using (user_id = (select auth.uid()) and private.is_member(tenant_id))
  with check (user_id = (select auth.uid()) and private.is_member(tenant_id));
create policy weekly_reviews_delete on public.weekly_reviews for delete to authenticated
  using (user_id = (select auth.uid()) and private.is_member(tenant_id));

create policy quarterly_reviews_select on public.quarterly_reviews for select to authenticated
  using (user_id = (select auth.uid()) and private.is_member(tenant_id));
create policy quarterly_reviews_insert on public.quarterly_reviews for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_member(tenant_id));
create policy quarterly_reviews_update on public.quarterly_reviews for update to authenticated
  using (user_id = (select auth.uid()) and private.is_member(tenant_id))
  with check (user_id = (select auth.uid()) and private.is_member(tenant_id));
create policy quarterly_reviews_delete on public.quarterly_reviews for delete to authenticated
  using (user_id = (select auth.uid()) and private.is_member(tenant_id));
