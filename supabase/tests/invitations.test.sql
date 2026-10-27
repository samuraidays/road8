-- 招待の発行と受諾のテスト（pgTAP）。設計書 §9
-- 登場人物:
--   olivia : テナントI の Owner
--   mia    : テナントI の Member（olivia の招待で参加する）
--   nick   : どのテナントにも所属していない
begin;
create extension if not exists pgtap with schema extensions;

select plan(19);

insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444', 'olivia@example.test'),
  ('55555555-5555-5555-5555-555555555555', 'mia@example.test'),
  ('66666666-6666-6666-6666-666666666666', 'nick@example.test');

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.as_service(p_actor uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('request.headers', json_build_object('x-road8-actor', p_actor)::text, true);
end;
$$;
create function pg_temp.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.headers', '', true);
end;
$$;
grant execute on function pg_temp.login(uuid) to authenticated, service_role;
grant execute on function pg_temp.as_service(uuid) to authenticated, service_role;
grant execute on function pg_temp.logout() to authenticated, service_role;

select pg_temp.login('44444444-4444-4444-4444-444444444444');
insert into public.tenants (id, name) values ('cccccccc-0000-0000-0000-000000000000', 'Tenant I');

-- ---------------------------------------------------------------------------
-- 実行権限
-- ---------------------------------------------------------------------------
select pg_temp.logout();

select ok(
  not has_function_privilege('anon', 'public.accept_invitation(text, uuid)', 'execute'),
  'anon は accept_invitation を実行できない'
);
select ok(
  not has_function_privilege('authenticated', 'public.accept_invitation(text, uuid)', 'execute'),
  'authenticated は accept_invitation を実行できない（Data API の RPC から自分で受諾できない）'
);
select ok(
  has_function_privilege('service_role', 'public.accept_invitation(text, uuid)', 'execute'),
  'service_role は accept_invitation を実行できる'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.accept_invitation(text, uuid)'::regprocedure),
  false,
  'accept_invitation は SECURITY DEFINER ではない'
);

-- ---------------------------------------------------------------------------
-- 発行（invitation.create）
-- ---------------------------------------------------------------------------
select pg_temp.login('66666666-6666-6666-6666-666666666666');
select throws_ok(
  $$ insert into public.invitations (tenant_id, role, token_hash) values ('cccccccc-0000-0000-0000-000000000000', 'owner', 'hash-by-nick') $$,
  '42501', null,
  'invitation.create: 所属していない人は招待を発行できない'
);

select pg_temp.login('44444444-4444-4444-4444-444444444444');
select lives_ok(
  $$ insert into public.invitations (tenant_id, role, token_hash) values
       ('cccccccc-0000-0000-0000-000000000000', 'member', 'hash-valid'),
       ('cccccccc-0000-0000-0000-000000000000', 'member', 'hash-expired'),
       ('cccccccc-0000-0000-0000-000000000000', 'member', 'hash-revoked') $$,
  'invitation.create: Owner は招待を発行できる'
);
select pg_temp.logout();
update public.invitations set expires_at = now() - interval '1 minute' where token_hash = 'hash-expired';
update public.invitations set revoked_at = now() where token_hash = 'hash-revoked';

-- ---------------------------------------------------------------------------
-- 受諾（invitation.accept）
-- ---------------------------------------------------------------------------
select pg_temp.login('66666666-6666-6666-6666-666666666666');
select throws_ok(
  $$ select public.accept_invitation('hash-valid', '66666666-6666-6666-6666-666666666666') $$,
  '42501', null,
  'invitation.accept: 利用者のロールから直接は受諾できない'
);

select pg_temp.as_service('66666666-6666-6666-6666-666666666666');
select throws_ok(
  $$ select public.accept_invitation('hash-unknown', '66666666-6666-6666-6666-666666666666') $$,
  'P0001', null, '存在しないトークンは拒否される'
);
select throws_ok(
  $$ select public.accept_invitation('hash-expired', '66666666-6666-6666-6666-666666666666') $$,
  'P0001', null, '期限切れの招待は拒否される'
);
select throws_ok(
  $$ select public.accept_invitation('hash-revoked', '66666666-6666-6666-6666-666666666666') $$,
  'P0001', null, '取り消し済みの招待は拒否される'
);
select throws_ok(
  $$ select public.accept_invitation('hash-valid', '44444444-4444-4444-4444-444444444444') $$,
  'P0001', null, 'すでに所属している人は受諾できない'
);

select pg_temp.logout();
select is(
  (select accepted_at from public.invitations where token_hash = 'hash-valid'),
  null,
  '所属済みで失敗した場合、招待は未使用のまま残る'
);

select pg_temp.as_service('55555555-5555-5555-5555-555555555555');
select is(
  public.accept_invitation('hash-valid', '55555555-5555-5555-5555-555555555555'),
  'cccccccc-0000-0000-0000-000000000000'::uuid,
  '有効な招待で受諾でき、テナントの ID が返る'
);
select throws_ok(
  $$ select public.accept_invitation('hash-valid', '66666666-6666-6666-6666-666666666666') $$,
  'P0001', null, '使用済みの招待はもう使えない'
);

select pg_temp.logout();
select is(
  (select role::text from public.memberships
    where tenant_id = 'cccccccc-0000-0000-0000-000000000000' and user_id = '55555555-5555-5555-5555-555555555555'),
  'member',
  '招待のロールで所属が作られる'
);
select is(
  (select actor_user_id from public.audit_logs
    where action = 'memberships.insert' and target_id = '55555555-5555-5555-5555-555555555555'),
  '55555555-5555-5555-5555-555555555555'::uuid,
  '受諾による所属の作成は、受諾した本人を操作者として監査ログに残る'
);

-- mia は Member になったので、招待を発行できない（Owner だけ）
select pg_temp.login('55555555-5555-5555-5555-555555555555');
select throws_ok(
  $$ insert into public.invitations (tenant_id, role, token_hash) values ('cccccccc-0000-0000-0000-000000000000', 'owner', 'hash-by-mia') $$,
  '42501', null,
  'invitation.create: Member は招待を発行できない（Data API 直接でも）'
);

-- Owner ロールの招待で参加すると Owner になる
select pg_temp.login('44444444-4444-4444-4444-444444444444');
insert into public.invitations (tenant_id, role, token_hash) values ('cccccccc-0000-0000-0000-000000000000', 'owner', 'hash-owner');
select pg_temp.as_service('66666666-6666-6666-6666-666666666666');
select lives_ok(
  $$ select public.accept_invitation('hash-owner', '66666666-6666-6666-6666-666666666666') $$,
  'Owner ロールの招待で参加できる'
);
select pg_temp.logout();
select is(
  (select role::text from public.memberships
    where tenant_id = 'cccccccc-0000-0000-0000-000000000000' and user_id = '66666666-6666-6666-6666-666666666666'),
  'owner',
  'Owner ロールの招待では Owner として所属が作られる'
);

select * from finish();
rollback;
