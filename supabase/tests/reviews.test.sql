-- 振り返りと KR の採点のテスト（pgTAP）。設計書 §10
-- 登場人物:
--   rita : テナントR の Owner
--   sam  : テナントR の Member
begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (id, email) values
  ('aaaa1111-1111-1111-1111-111111111111', 'rita@example.test'),
  ('aaaa2222-2222-2222-2222-222222222222', 'sam@example.test');

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
grant execute on function pg_temp.login(uuid) to authenticated;
grant execute on function pg_temp.logout() to authenticated;

select pg_temp.login('aaaa1111-1111-1111-1111-111111111111');
insert into public.tenants (id, name) values ('aaaa0000-0000-0000-0000-0000000000ff', 'Tenant R')
  on conflict do nothing;
select pg_temp.logout();
insert into public.memberships (tenant_id, user_id, role)
  values ('aaaa0000-0000-0000-0000-0000000000ff', 'aaaa2222-2222-2222-2222-222222222222', 'member');
insert into public.objectives (id, tenant_id, title, created_by)
  values ('aaaa0000-0000-0000-0000-0000000000a1', 'aaaa0000-0000-0000-0000-0000000000ff', 'O', 'aaaa1111-1111-1111-1111-111111111111');
insert into public.key_results (id, tenant_id, objective_id, title, created_by)
  values ('aaaa0000-0000-0000-0000-0000000000b1', 'aaaa0000-0000-0000-0000-0000000000ff', 'aaaa0000-0000-0000-0000-0000000000a1', 'KR',
          'aaaa1111-1111-1111-1111-111111111111');

-- ---------------------------------------------------------------------------
-- KR の採点：メンバーが付けられ、範囲は 0.0〜1.0
-- ---------------------------------------------------------------------------
select pg_temp.login('aaaa2222-2222-2222-2222-222222222222');
select lives_ok(
  $$ update public.key_results set score = 0.7, next_action = 'continue' where id = 'aaaa0000-0000-0000-0000-0000000000b1' $$,
  'key_result.score: Member は採点と次の扱いを付けられる'
);
select throws_ok(
  $$ update public.key_results set score = 1.5 where id = 'aaaa0000-0000-0000-0000-0000000000b1' $$,
  '23514', null, 'key_result.score: 採点は 0.0〜1.0 だけ'
);
select throws_ok(
  $$ update public.key_results set next_action = 'retry' where id = 'aaaa0000-0000-0000-0000-0000000000b1' $$,
  '23514', null, 'key_result.score: 次の扱いは continue・stop・change だけ'
);

-- ---------------------------------------------------------------------------
-- 週の振り返り：同じテナントでも本人だけ
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.weekly_reviews (tenant_id, user_id, week_start, went_well) values
       ('aaaa0000-0000-0000-0000-0000000000ff', 'aaaa2222-2222-2222-2222-222222222222', '2026-10-26', 'sam の振り返り') $$,
  'weekly_review.write: 本人の振り返りを書ける'
);
select throws_ok(
  $$ insert into public.weekly_reviews (tenant_id, user_id, week_start) values
       ('aaaa0000-0000-0000-0000-0000000000ff', 'aaaa2222-2222-2222-2222-222222222222', '2026-10-27') $$,
  '23514', null, 'weekly_review.write: 週の初めは月曜日だけ'
);
select throws_ok(
  $$ insert into public.weekly_reviews (tenant_id, user_id, week_start) values
       ('aaaa0000-0000-0000-0000-0000000000ff', 'aaaa1111-1111-1111-1111-111111111111', '2026-10-19') $$,
  '42501', null, 'weekly_review.write: 他人の名前で書けない'
);

select pg_temp.login('aaaa1111-1111-1111-1111-111111111111');
insert into public.weekly_reviews (tenant_id, user_id, week_start, went_well)
  values ('aaaa0000-0000-0000-0000-0000000000ff', 'aaaa1111-1111-1111-1111-111111111111', '2026-10-26', 'rita の振り返り');
select is((select count(*)::int from public.weekly_reviews), 1, 'weekly_review.read: Owner でも Member の振り返りは見えない');
update public.weekly_reviews set went_well = '書き換え' where user_id = 'aaaa2222-2222-2222-2222-222222222222';
delete from public.weekly_reviews where user_id = 'aaaa2222-2222-2222-2222-222222222222';
select pg_temp.logout();
select is(
  (select went_well from public.weekly_reviews where user_id = 'aaaa2222-2222-2222-2222-222222222222'),
  'sam の振り返り', 'weekly_review.write: Owner は Member の振り返りを書き換え・削除できない'
);

-- ---------------------------------------------------------------------------
-- 四半期の振り返り：同じテナントでも本人だけ
-- ---------------------------------------------------------------------------
select pg_temp.login('aaaa2222-2222-2222-2222-222222222222');
select lives_ok(
  $$ insert into public.quarterly_reviews (tenant_id, user_id, year, quarter, learned) values
       ('aaaa0000-0000-0000-0000-0000000000ff', 'aaaa2222-2222-2222-2222-222222222222', 2026, 3, 'sam の学び') $$,
  'quarterly_review.write: 本人の四半期の振り返りを書ける'
);
select throws_ok(
  $$ insert into public.quarterly_reviews (tenant_id, user_id, year, quarter) values
       ('aaaa0000-0000-0000-0000-0000000000ff', 'aaaa2222-2222-2222-2222-222222222222', 2026, 3) $$,
  '23505', null, 'quarterly_review.write: 同じ四半期の振り返りは1人1つ'
);

select pg_temp.login('aaaa1111-1111-1111-1111-111111111111');
select is((select count(*)::int from public.quarterly_reviews), 0, 'quarterly_review.read: Owner でも Member の四半期の振り返りは見えない');

-- ---------------------------------------------------------------------------
-- テナントを抜けたら、その人の振り返りは消える
-- ---------------------------------------------------------------------------
select pg_temp.logout();
delete from public.memberships
  where tenant_id = 'aaaa0000-0000-0000-0000-0000000000ff' and user_id = 'aaaa2222-2222-2222-2222-222222222222';
select is((select count(*)::int from public.weekly_reviews where user_id = 'aaaa2222-2222-2222-2222-222222222222'), 0,
  'テナントを抜けると週の振り返りも消える');
select is((select count(*)::int from public.quarterly_reviews where user_id = 'aaaa2222-2222-2222-2222-222222222222'), 0,
  'テナントを抜けると四半期の振り返りも消える');

select * from finish();
rollback;
