-- 人生のゴール・柱・「なぜ」・数値の記録・習慣のテスト（pgTAP）。設計書 §10
-- 登場人物:
--   gina  : テナントG の Owner
--   max   : テナントG の Member
--   hugo  : テナントH の Owner（テナントG から見ると non_member）
begin;
create extension if not exists pgtap with schema extensions;

select plan(29);

insert into auth.users (id, email) values
  ('77777777-7777-7777-7777-777777777777', 'gina@example.test'),
  ('88888888-8888-8888-8888-888888888888', 'max@example.test'),
  ('99999999-9999-9999-9999-999999999999', 'hugo@example.test');

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

-- 準備：テナントG（gina が Owner、max が Member）とテナントH（hugo が Owner）
select pg_temp.login('77777777-7777-7777-7777-777777777777');
insert into public.tenants (id, name) values ('99990000-0000-0000-0000-00000000000a', 'Tenant G');
select pg_temp.login('99999999-9999-9999-9999-999999999999');
insert into public.tenants (id, name) values ('99990000-0000-0000-0000-00000000000b', 'Tenant H');
select pg_temp.logout();
insert into public.memberships (tenant_id, user_id, role)
  values ('99990000-0000-0000-0000-00000000000a', '88888888-8888-8888-8888-888888888888', 'member');

-- ---------------------------------------------------------------------------
-- 人生のゴールと柱：見るのはメンバー、書くのは Owner
-- ---------------------------------------------------------------------------
select pg_temp.login('77777777-7777-7777-7777-777777777777');
select lives_ok(
  $$ insert into public.life_goals (tenant_id, statement) values ('99990000-0000-0000-0000-00000000000a', '自由度の高い人生') $$,
  'life_goal.write: Owner は人生のゴールを書ける'
);
select lives_ok(
  $$ insert into public.pillars (id, tenant_id, position, title) values
       ('99990000-0000-0000-0000-0000000000c1', '99990000-0000-0000-0000-00000000000a', 1, '事業をつくる') $$,
  'pillar.write: Owner は柱を作れる'
);

select pg_temp.login('88888888-8888-8888-8888-888888888888');
select is((select count(*)::int from public.life_goals), 1, 'life_goal.read: Member は人生のゴールを見られる');
select is((select count(*)::int from public.pillars), 1, 'pillar.read: Member は柱を見られる');
select throws_ok(
  $$ insert into public.pillars (tenant_id, title) values ('99990000-0000-0000-0000-00000000000a', '勝手な柱') $$,
  '42501', null, 'pillar.write: Member は柱を作れない'
);
update public.life_goals set statement = '書き換え' where tenant_id = '99990000-0000-0000-0000-00000000000a';
select pg_temp.logout();
select is(
  (select statement from public.life_goals where tenant_id = '99990000-0000-0000-0000-00000000000a'),
  '自由度の高い人生', 'life_goal.write: Member の書き換えは反映されない'
);

select pg_temp.login('99999999-9999-9999-9999-999999999999');
select is((select count(*)::int from public.life_goals where tenant_id = '99990000-0000-0000-0000-00000000000a'), 0,
  'life_goal.read: 他テナントの人生のゴールは見えない');
select is((select count(*)::int from public.pillars where tenant_id = '99990000-0000-0000-0000-00000000000a'), 0,
  'pillar.read: 他テナントの柱は見えない');
insert into public.pillars (id, tenant_id, title) values ('99990000-0000-0000-0000-0000000000c2', '99990000-0000-0000-0000-00000000000b', 'H の柱');

-- ---------------------------------------------------------------------------
-- Objective：四半期と柱
-- ---------------------------------------------------------------------------
select pg_temp.login('88888888-8888-8888-8888-888888888888');
select lives_ok(
  $$ insert into public.objectives (id, tenant_id, title, pillar_id, year, quarter) values
       ('99990000-0000-0000-0000-0000000000d1', '99990000-0000-0000-0000-00000000000a', 'O', '99990000-0000-0000-0000-0000000000c1', 2026, 4) $$,
  'objective.create: 同じテナントの柱にひもづけて、四半期を指定して作れる'
);
select throws_ok(
  $$ insert into public.objectives (tenant_id, title, pillar_id) values
       ('99990000-0000-0000-0000-00000000000a', 'O2', '99990000-0000-0000-0000-0000000000c2') $$,
  '23503', null, 'objective.create: 他テナントの柱にはひもづけられない'
);
select throws_ok(
  $$ insert into public.objectives (tenant_id, title, year, quarter) values ('99990000-0000-0000-0000-00000000000a', 'O3', 2026, 5) $$,
  '23514', null, 'objective.create: 四半期は1〜4だけ'
);

-- ---------------------------------------------------------------------------
-- 数値型の Key Result と記録
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.key_results (tenant_id, objective_id, title, kind) values
       ('99990000-0000-0000-0000-00000000000a', '99990000-0000-0000-0000-0000000000d1', 'KR', 'metric') $$,
  '23514', null, 'key_result.create: 数値型は開始値と目標値が必要'
);
select lives_ok(
  $$ insert into public.key_results (id, tenant_id, objective_id, title, kind, start_value, target_value, unit) values
       ('99990000-0000-0000-0000-0000000000e1', '99990000-0000-0000-0000-00000000000a', '99990000-0000-0000-0000-0000000000d1',
        '体重', 'metric', 72.0, 69.0, 'kg') $$,
  'key_result.create: 数値型の KR を作れる'
);
select lives_ok(
  $$ insert into public.kr_measurements (tenant_id, key_result_id, measured_on, value, created_by) values
       ('99990000-0000-0000-0000-00000000000a', '99990000-0000-0000-0000-0000000000e1', '2026-10-27', 70.8,
        '88888888-8888-8888-8888-888888888888') $$,
  'kr_measurement.write: Member は数値を記録できる'
);
select throws_ok(
  $$ insert into public.kr_measurements (tenant_id, key_result_id, measured_on, value, created_by) values
       ('99990000-0000-0000-0000-00000000000a', '99990000-0000-0000-0000-0000000000e1', '2026-10-27', 70.5,
        '88888888-8888-8888-8888-888888888888') $$,
  '23505', null, 'kr_measurement.write: 同じ日の記録は1つだけ'
);
select throws_ok(
  $$ insert into public.kr_measurements (tenant_id, key_result_id, measured_on, value, created_by) values
       ('99990000-0000-0000-0000-00000000000a', '99990000-0000-0000-0000-0000000000e1', '2026-10-26', 71.0,
        '77777777-7777-7777-7777-777777777777') $$,
  '42501', null, 'kr_measurement.write: 他人を記録者にはできない'
);

select pg_temp.login('99999999-9999-9999-9999-999999999999');
select is((select count(*)::int from public.kr_measurements), 0, 'kr_measurement.list: 他テナントの記録は見えない');

-- ---------------------------------------------------------------------------
-- 習慣と実施の記録
-- ---------------------------------------------------------------------------
select pg_temp.login('88888888-8888-8888-8888-888888888888');
select lives_ok(
  $$ insert into public.habits (id, tenant_id, key_result_id, title, times_per_week, created_by) values
       ('99990000-0000-0000-0000-0000000000f1', '99990000-0000-0000-0000-00000000000a', '99990000-0000-0000-0000-0000000000e1',
        '筋トレ', 3, '88888888-8888-8888-8888-888888888888') $$,
  'habit.write: Member は習慣を作れる'
);
select throws_ok(
  $$ insert into public.habits (tenant_id, key_result_id, title, times_per_week, created_by) values
       ('99990000-0000-0000-0000-00000000000a', '99990000-0000-0000-0000-0000000000e1', '毎日2回', 8,
        '88888888-8888-8888-8888-888888888888') $$,
  '23514', null, 'habit.write: 週の回数は1〜7だけ'
);
select lives_ok(
  $$ insert into public.habit_checks (tenant_id, habit_id, done_on, created_by) values
       ('99990000-0000-0000-0000-00000000000a', '99990000-0000-0000-0000-0000000000f1', '2026-10-27',
        '88888888-8888-8888-8888-888888888888') $$,
  'habit.check: Member は実施を記録できる'
);

select pg_temp.login('99999999-9999-9999-9999-999999999999');
select throws_ok(
  $$ insert into public.habit_checks (tenant_id, habit_id, done_on, created_by) values
       ('99990000-0000-0000-0000-00000000000b', '99990000-0000-0000-0000-0000000000f1', '2026-10-28',
        '99999999-9999-9999-9999-999999999999') $$,
  '23503', null, 'habit.check: 他テナントの習慣には記録できない（tenant_id を自分のテナントにしても）'
);

-- ---------------------------------------------------------------------------
-- タスクの時間帯
-- ---------------------------------------------------------------------------
select pg_temp.login('88888888-8888-8888-8888-888888888888');
select lives_ok(
  $$ insert into public.tasks (tenant_id, key_result_id, title, scheduled_start, scheduled_end, created_by) values
       ('99990000-0000-0000-0000-00000000000a', '99990000-0000-0000-0000-0000000000e1', '筋トレ',
        '2026-10-28 07:00+09', '2026-10-28 08:00+09', '88888888-8888-8888-8888-888888888888') $$,
  'task.create: 時間帯つきのタスクを作れる'
);
select throws_ok(
  $$ insert into public.tasks (tenant_id, key_result_id, title, scheduled_start, scheduled_end, created_by) values
       ('99990000-0000-0000-0000-00000000000a', '99990000-0000-0000-0000-0000000000e1', '逆',
        '2026-10-28 08:00+09', '2026-10-28 07:00+09', '88888888-8888-8888-8888-888888888888') $$,
  '23514', null, 'task.create: 終了は開始より後'
);

-- ---------------------------------------------------------------------------
-- 「なぜ」：同じテナントでも本人だけ
-- ---------------------------------------------------------------------------
select pg_temp.login('77777777-7777-7777-7777-777777777777');
select lives_ok(
  $$ insert into public.reasons (tenant_id, user_id, pillar_id, body) values
       ('99990000-0000-0000-0000-00000000000a', '77777777-7777-7777-7777-777777777777', '99990000-0000-0000-0000-0000000000c1', 'gina の理由') $$,
  'reason.write: 本人の「なぜ」を書ける'
);
select throws_ok(
  $$ insert into public.reasons (tenant_id, user_id, objective_id, body) values
       ('99990000-0000-0000-0000-00000000000a', '88888888-8888-8888-8888-888888888888', '99990000-0000-0000-0000-0000000000d1', 'なりすまし') $$,
  '42501', null, 'reason.write: Owner でも他人の名前で「なぜ」を書けない'
);

select pg_temp.login('88888888-8888-8888-8888-888888888888');
insert into public.reasons (tenant_id, user_id, objective_id, body) values
  ('99990000-0000-0000-0000-00000000000a', '88888888-8888-8888-8888-888888888888', '99990000-0000-0000-0000-0000000000d1', 'max の理由');
select is((select count(*)::int from public.reasons), 1, 'reason.read: Member は自分の「なぜ」だけ見える');
update public.reasons set body = '書き換え' where user_id = '77777777-7777-7777-7777-777777777777';
delete from public.reasons where user_id = '77777777-7777-7777-7777-777777777777';

select pg_temp.login('77777777-7777-7777-7777-777777777777');
select is((select count(*)::int from public.reasons), 1, 'reason.read: Owner でも Member の「なぜ」は見えない');
select is((select body from public.reasons), 'gina の理由', 'reason.write: 他人の「なぜ」は書き換え・削除されない');

select pg_temp.logout();
select throws_ok(
  $$ insert into public.reasons (tenant_id, user_id, pillar_id, objective_id, body) values
       ('99990000-0000-0000-0000-00000000000a', '77777777-7777-7777-7777-777777777777',
        '99990000-0000-0000-0000-0000000000c1', '99990000-0000-0000-0000-0000000000d1', '両方') $$,
  '23514', null, '「なぜ」は柱か Objective のどちらか1つにひもづく'
);

select * from finish();
rollback;
