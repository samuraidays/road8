-- Google カレンダー連携のテスト（pgTAP）。設計書 §6
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email) values
  ('bbbb1111-1111-1111-1111-111111111111', 'gail@example.test'),
  ('bbbb2222-2222-2222-2222-222222222222', 'ivan@example.test');

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end;
$$;
create function pg_temp.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;
grant execute on function pg_temp.login(uuid) to authenticated, service_role;
grant execute on function pg_temp.as_service() to authenticated, service_role;
grant execute on function pg_temp.logout() to authenticated, service_role;

-- 実行権限
select ok(not has_function_privilege('authenticated', 'public.save_google_connection(uuid, text, text)', 'execute'),
  'authenticated は save_google_connection を実行できない');
select ok(not has_function_privilege('authenticated', 'public.get_google_connection(uuid)', 'execute'),
  'authenticated は get_google_connection を実行できない（Data API の RPC からトークンを読めない）');
select ok(not has_function_privilege('anon', 'public.get_google_connection(uuid)', 'execute'),
  'anon は get_google_connection を実行できない');
select ok(not has_schema_privilege('authenticated', 'vault', 'usage'), 'authenticated は vault スキーマを使えない');
select is(
  (select bool_or(prosecdef) from pg_proc where proname in ('save_google_connection', 'get_google_connection', 'delete_google_connection')),
  false, 'Google 連携の関数は SECURITY DEFINER ではない'
);

-- 保存と読み出し（service_role）
select pg_temp.as_service();
select lives_ok($$ select public.save_google_connection('bbbb1111-1111-1111-1111-111111111111', 'token-1', 'calendar.app.created') $$,
  'service_role は連携を保存できる');
select is((select refresh_token from public.get_google_connection('bbbb1111-1111-1111-1111-111111111111')), 'token-1',
  '保存したトークンを読み出せる');
select lives_ok($$ select public.save_google_connection('bbbb1111-1111-1111-1111-111111111111', 'token-2', 'calendar.app.created') $$,
  '再連携でトークンを差し替えられる');
select is((select refresh_token from public.get_google_connection('bbbb1111-1111-1111-1111-111111111111')), 'token-2',
  '差し替えたトークンが読み出される');

-- 本人以外からは、トークンも参照 ID も見えない
select pg_temp.login('bbbb2222-2222-2222-2222-222222222222');
select is((select count(*)::int from public.google_connections), 0, 'google.status: 他人の連携は見えない');
select throws_ok($$ select vault_secret_id from public.google_connections $$, '42501', null,
  'google.status: 自分の連携でも vault_secret_id は読めない（列単位の grant）');

-- 解除で Vault のトークンも消える
select pg_temp.as_service();
select public.delete_google_connection('bbbb1111-1111-1111-1111-111111111111');
select pg_temp.logout();
select is((select count(*)::int from vault.secrets where description = 'road8: Google refresh token'), 0,
  '解除すると Vault からトークンが消える');

select * from finish();
rollback;
