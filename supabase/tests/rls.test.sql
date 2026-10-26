-- RLS と権限のテスト（pgTAP）。`supabase test db` で実行する
-- 権限マトリクス security/permissions.yaml の主要な行を、Data API を直接叩かれた場合（= DB のロールとして直接 SQL を実行）で確かめる
-- 登場人物:
--   alice : テナントA の Owner
--   mike  : テナントA の Member
--   bob   : テナントB の Owner（テナントA から見ると non_member。後半でテナントA の Member にもなる）
begin;
create extension if not exists pgtap with schema extensions;

select plan(50);

-- ---------------------------------------------------------------------------
-- 構造のチェック
-- ---------------------------------------------------------------------------

select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity $$,
  'public の全テーブルで RLS が有効'
);

select is_empty(
  $$ select table_name, privilege_type from information_schema.role_table_grants
     where grantee = 'anon' and table_schema = 'public' $$,
  'anon には public のテーブルの権限がない'
);

select is_empty(
  $$ select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') $$,
  'anon が実行できる public の関数はない'
);

select is_empty(
  $$ select privilege_type from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'audit_logs'
       and grantee in ('authenticated', 'service_role')
       and privilege_type in ('UPDATE', 'DELETE', 'TRUNCATE') $$,
  '監査ログは authenticated・service_role とも書き換え・削除できない'
);

-- ---------------------------------------------------------------------------
-- 準備（postgres で実行）
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.test', '{"full_name":"Alice"}'),
  ('22222222-2222-2222-2222-222222222222', 'mike@example.test',  '{"full_name":"Mike"}'),
  ('33333333-3333-3333-3333-333333333333', 'bob@example.test',   '{"full_name":"Bob"}');

select is(
  (select count(*)::int from public.profiles where user_id in
    ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333')),
  3, 'サインアップでプロフィールが作られる'
);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;
-- マイグレーションで関数の既定の実行権限を取り消しているため、テスト用の関数にだけ付与する
grant execute on function pg_temp.login(uuid) to authenticated;
grant execute on function pg_temp.logout() to authenticated, service_role;

-- alice がテナントA、bob がテナントB を作る
select pg_temp.login('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$ insert into public.tenants (id, name) values ('aaaaaaaa-0000-0000-0000-000000000000', 'Tenant A') $$,
  'tenant.create: ログインしていればテナントを作れる'
);
select pg_temp.login('33333333-3333-3333-3333-333333333333');
insert into public.tenants (id, name) values ('bbbbbbbb-0000-0000-0000-000000000000', 'Tenant B');

-- mike をテナントA の Member にする（招待の受諾 = サーバーが service_role で行う処理の代わり）
select pg_temp.logout();
insert into public.memberships (tenant_id, user_id, role)
values ('aaaaaaaa-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'member');

select is(
  (select role::text from public.memberships
   where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000000' and user_id = '11111111-1111-1111-1111-111111111111'),
  'owner', 'テナントを作った人が Owner になる'
);

-- ---------------------------------------------------------------------------
-- Owner（alice）
-- ---------------------------------------------------------------------------

select pg_temp.login('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$ insert into public.objectives (id, tenant_id, title, owner_user_id)
     values ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'Objective A',
             '22222222-2222-2222-2222-222222222222') $$,
  'objective.create: Owner は作れる（担当者は同じテナントのメンバー）'
);
select lives_ok(
  $$ insert into public.key_results (id, tenant_id, objective_id, title)
     values ('a0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000000',
             'a0000000-0000-0000-0000-000000000001', 'KR A') $$,
  'key_result.create: 同じテナントの Objective には作れる'
);
select throws_ok(
  $$ insert into public.tasks (tenant_id, key_result_id, title, assignee_user_id)
     values ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000002', 'Task',
             '33333333-3333-3333-3333-333333333333') $$,
  '23503', null,
  'task.create: テナント外の人（bob）を担当者にできない'
);
-- テナント作成・Owner の所属・mike の所属・Objective・Key Result の5件（失敗したタスクの作成は残らない）
select is(
  (select array_agg(action order by id) from public.audit_logs),
  array['tenants.insert', 'memberships.insert', 'memberships.insert', 'objectives.insert', 'key_results.insert'],
  'audit_log.list: Owner は自テナントの監査ログを読め、データの変更がトリガーで記録されている'
);
select throws_ok(
  $$ insert into public.audit_logs (tenant_id, action) values ('aaaaaaaa-0000-0000-0000-000000000000', 'fake') $$,
  '42501', null,
  'audit_log.write_direct: Owner でも監査ログを書き込めない'
);
select throws_ok(
  $$ delete from public.memberships
     where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000000' and user_id = '11111111-1111-1111-1111-111111111111' $$,
  'P0001', null,
  'membership.leave: 最後の Owner は抜けられない'
);
select is((select count(*)::int from public.profiles), 2, 'profile.read: 同じテナントの人（自分と mike）だけ見える');

-- ---------------------------------------------------------------------------
-- Member（mike）
-- ---------------------------------------------------------------------------

select pg_temp.login('22222222-2222-2222-2222-222222222222');
select is((select count(*)::int from public.objectives), 1, 'objective.list: Member は自テナントの Objective を見られる');
select lives_ok(
  $$ insert into public.tasks (tenant_id, key_result_id, title, assignee_user_id)
     values ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000002', 'Task by Mike',
             '22222222-2222-2222-2222-222222222222') $$,
  'task.create: Member は作れる'
);
select is_empty(
  $$ delete from public.objectives where id = 'a0000000-0000-0000-0000-000000000001' returning id $$,
  'objective.delete: Member は削除できない（Owner だけ）'
);
select is_empty(
  $$ update public.memberships set role = 'owner'
     where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000000' and user_id = '22222222-2222-2222-2222-222222222222'
     returning user_id $$,
  'membership.change_role: Member は自分を Owner にできない'
);
select throws_ok(
  $$ insert into public.memberships (tenant_id, user_id, role)
     values ('bbbbbbbb-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'owner') $$,
  '42501', null,
  'membership.insert_direct: 招待を通さずに所属を作れない'
);
select is((select count(*)::int from public.audit_logs), 0, 'audit_log.list: Member は監査ログを読めない');
select is((select count(*)::int from public.invitations), 0, 'invitation.list: Member は招待を見られない');
select throws_ok(
  $$ update public.tasks set tenant_id = 'bbbbbbbb-0000-0000-0000-000000000000' $$,
  '42501', null,
  'タスクの tenant_id は書き換えられない（列単位の権限）'
);

-- ---------------------------------------------------------------------------
-- non_member（bob から見たテナントA）
-- ---------------------------------------------------------------------------

select pg_temp.login('33333333-3333-3333-3333-333333333333');
select is(
  (select count(*)::int from public.tenants where id = 'aaaaaaaa-0000-0000-0000-000000000000'),
  0, 'tenant.read: 他テナントは見えない'
);
select is((select count(*)::int from public.objectives), 0, 'objective.list: 他テナントの Objective は見えない');
select is((select count(*)::int from public.tasks), 0, 'task.list: 他テナントのタスクは見えない');
select throws_ok(
  $$ insert into public.objectives (tenant_id, title) values ('aaaaaaaa-0000-0000-0000-000000000000', 'Injected') $$,
  '42501', null,
  'objective.create: 他テナントに作れない'
);
select is_empty(
  $$ update public.tenants set name = 'Hacked' where id = 'aaaaaaaa-0000-0000-0000-000000000000' returning id $$,
  'tenant.update: 他テナントを書き換えられない'
);
select is_empty(
  $$ delete from public.tasks returning id $$,
  'task.delete: 他テナントのタスクを消せない'
);
select is(
  (select count(*)::int from public.profiles where user_id = '22222222-2222-2222-2222-222222222222'),
  0, 'profile.read: 共有するテナントがない人の表示名は見えない'
);

-- bob が自分のテナントB の Objective から、テナントA の Key Result にぶら下げようとする
insert into public.objectives (id, tenant_id, title)
values ('b0000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000000', 'Objective B');
select throws_ok(
  $$ insert into public.key_results (tenant_id, objective_id, title)
     values ('bbbbbbbb-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'Cross') $$,
  '23503', null,
  'key_result.create: 他テナントの Objective にはぶら下げられない'
);

-- ---------------------------------------------------------------------------
-- anonymous
-- ---------------------------------------------------------------------------

select pg_temp.logout();
set local role anon;
select throws_ok($$ select * from public.tenants $$, '42501', null, 'anonymous: テナントを読めない');
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anonymous: プロフィールを読めない');
reset role;

-- ---------------------------------------------------------------------------
-- 招待（Owner だけ）
-- ---------------------------------------------------------------------------

select pg_temp.login('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$ insert into public.invitations (tenant_id, token_hash) values ('aaaaaaaa-0000-0000-0000-000000000000', 'hash-1') $$,
  'invitation.create: Owner は招待を発行できる'
);
select is((select count(*)::int from public.invitations), 1, 'invitation.list: Owner は招待を見られる');

select pg_temp.login('22222222-2222-2222-2222-222222222222');
select throws_ok(
  $$ insert into public.invitations (tenant_id, token_hash) values ('aaaaaaaa-0000-0000-0000-000000000000', 'hash-2') $$,
  '42501', null,
  'invitation.create: Member は招待を発行できない'
);
select is_empty(
  $$ update public.invitations set revoked_at = now() returning id $$,
  'invitation.revoke: Member は招待を取り消せない'
);

select pg_temp.login('33333333-3333-3333-3333-333333333333');
select throws_ok(
  $$ insert into public.invitations (tenant_id, token_hash) values ('aaaaaaaa-0000-0000-0000-000000000000', 'hash-3') $$,
  '42501', null,
  'invitation.create: 他テナントの人は招待を発行できない'
);

-- ---------------------------------------------------------------------------
-- Google 連携（自分の行のメタ情報だけ）
-- ---------------------------------------------------------------------------

select pg_temp.logout();
insert into public.google_connections (user_id, vault_secret_id, scopes) values
  ('11111111-1111-1111-1111-111111111111', gen_random_uuid(), 'calendar.app.created'),
  ('22222222-2222-2222-2222-222222222222', gen_random_uuid(), 'calendar.app.created');

select pg_temp.login('11111111-1111-1111-1111-111111111111');
select is((select count(*)::int from public.google_connections), 1, 'google.status: 自分の連携だけ見える');
select throws_ok(
  $$ select * from public.google_connections $$,
  '42501', null,
  'google.status: vault_secret_id は読めない（select * は列単位の権限で拒否される）'
);

-- ---------------------------------------------------------------------------
-- service_role での書き込みの監査ログ（招待の受諾の代わり）
-- ---------------------------------------------------------------------------

select pg_temp.logout();
select set_config('role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.headers', '{"x-road8-actor":"33333333-3333-3333-3333-333333333333"}', true);
insert into public.memberships (tenant_id, user_id, role)
values ('aaaaaaaa-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'member');
select pg_temp.logout();
select set_config('request.headers', '', true);

select is(
  (select actor_user_id from public.audit_logs
   where action = 'memberships.insert' and target_id = '33333333-3333-3333-3333-333333333333'
   order by id desc limit 1),
  '33333333-3333-3333-3333-333333333333'::uuid,
  'service_role の書き込みでも、サーバーが渡した操作者が監査ログに残る'
);
select is(
  (select metadata ->> 'via' from public.audit_logs
   where action = 'memberships.insert' and target_id = '33333333-3333-3333-3333-333333333333'
   order by id desc limit 1),
  'service_role',
  'service_role 経由の書き込みであることが監査ログに残る'
);

-- 利用者が同じヘッダーを付けても、操作者は偽装できない
select pg_temp.login('22222222-2222-2222-2222-222222222222');
select set_config('request.headers', '{"x-road8-actor":"33333333-3333-3333-3333-333333333333"}', true);
update public.tasks set status = 'done';
select pg_temp.logout();
select set_config('request.headers', '', true);
select is(
  (select actor_user_id from public.audit_logs where action = 'tasks.update' order by id desc limit 1),
  '22222222-2222-2222-2222-222222222222'::uuid,
  '利用者はヘッダーで監査ログの操作者を偽装できない'
);

-- ---------------------------------------------------------------------------
-- メンバーの管理と、最後の Owner の保護
-- ---------------------------------------------------------------------------

select pg_temp.login('33333333-3333-3333-3333-333333333333');
select isnt_empty(
  $$ delete from public.memberships
     where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000000' and user_id = '33333333-3333-3333-3333-333333333333'
     returning user_id $$,
  'membership.leave: Member は自分で抜けられる'
);

select pg_temp.logout();
insert into public.memberships (tenant_id, user_id, role)
values ('aaaaaaaa-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'member');

select pg_temp.login('11111111-1111-1111-1111-111111111111');
select isnt_empty(
  $$ update public.memberships set role = 'owner'
     where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000000' and user_id = '22222222-2222-2222-2222-222222222222'
     returning user_id $$,
  'membership.change_role: Owner は Member を Owner にできる'
);
select isnt_empty(
  $$ delete from public.memberships
     where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000000' and user_id = '33333333-3333-3333-3333-333333333333'
     returning user_id $$,
  'membership.remove: Owner は他のメンバーを外せる'
);
select isnt_empty(
  $$ delete from public.memberships
     where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000000' and user_id = '11111111-1111-1111-1111-111111111111'
     returning user_id $$,
  'membership.leave: 他に Owner がいれば Owner も抜けられる'
);

select pg_temp.login('22222222-2222-2222-2222-222222222222');
select throws_ok(
  $$ update public.memberships set role = 'member'
     where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000000' and user_id = '22222222-2222-2222-2222-222222222222' $$,
  'P0001', null,
  'membership.change_role: 最後の Owner は自分を降格できない'
);

select pg_temp.logout();
select throws_ok(
  $$ delete from auth.users where id = '22222222-2222-2222-2222-222222222222' $$,
  'P0001', null,
  'アカウントの削除：最後の Owner のアカウントは、引き継ぎかテナントの削除の後でないと消せない'
);

-- ---------------------------------------------------------------------------
-- テナントの削除（最後の Owner の保護が、連鎖削除を止めないこと）
-- ---------------------------------------------------------------------------

select pg_temp.login('22222222-2222-2222-2222-222222222222');
select isnt_empty(
  $$ delete from public.tenants where id = 'aaaaaaaa-0000-0000-0000-000000000000' returning id $$,
  'tenant.delete: Owner はテナントを削除できる'
);
select pg_temp.logout();
select ok(
  (select count(*) from public.audit_logs where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000000' and action = 'tenants.delete') = 1,
  'テナントを削除しても監査ログは残る'
);

select * from finish();
rollback;
