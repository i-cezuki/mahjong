-- 集計値の保存と、成績の読み取り権限のテスト。npm run test:db で実行する。
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- alice, bob, carol は承認済みで同じ対局の参加者。dave は承認済みの部外者。eve は未承認。
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@example.com'),
  ('00000000-0000-0000-0000-00000000000e', 'eve@example.com');
update public.profiles set approved = true
  where id <> '00000000-0000-0000-0000-00000000000e';

insert into public.rooms (id, code, status, created_by) values
  ('10000000-0000-0000-0000-000000000001', 'ABC234', 'finished',
   '00000000-0000-0000-0000-00000000000a');
-- 席順は carol, alice, bob
insert into public.games (id, room_id, status, player_ids, finished_at) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   'finished',
   array['00000000-0000-0000-0000-00000000000c',
         '00000000-0000-0000-0000-00000000000a',
         '00000000-0000-0000-0000-00000000000b']::uuid[],
   now() - interval '2 hours'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   'playing',
   array['00000000-0000-0000-0000-00000000000a',
         '00000000-0000-0000-0000-00000000000b',
         '00000000-0000-0000-0000-00000000000c']::uuid[],
   null),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
   'abandoned',
   array['00000000-0000-0000-0000-00000000000a',
         '00000000-0000-0000-0000-00000000000b',
         '00000000-0000-0000-0000-00000000000c']::uuid[],
   null);
insert into public.game_results (game_id, player_id, seat, rank, points, score, chips) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 0, 1, 50000, 30, 2),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 1, 2, 30000, 0, 0),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 2, 3, 10000, -30, -2);

-- ---- 計算が必要な対局 ----
select is(
  (select array_agg(id) from public.games_needing_stats(1, 10) as id),
  array['20000000-0000-0000-0000-000000000001']::uuid[],
  '集計値のない終局した対局だけが出る（対局中と破棄は出ない）'
);

-- ---- 保存 ----
select ok(
  public.save_game_stats('20000000-0000-0000-0000-000000000001', 1,
    '[{"rounds":7,"who":"c"},{"rounds":7,"who":"a"},{"rounds":7,"who":"b"}]'),
  '終局した対局の集計値を保存できる'
);
select is((select count(*)::int from public.game_stats), 3, '3人分の行ができる');
select is(
  (select stats->>'who' from public.game_stats
   where player_id = '00000000-0000-0000-0000-00000000000a'),
  'a',
  '集計値は席順どおりに配られる'
);
select is(
  (select count(*)::int from public.games_needing_stats(1, 10)),
  0,
  '保存したあとは出ない'
);
select is(
  (select count(*)::int from public.games_needing_stats(2, 10)),
  1,
  '版番号が上がると、また出る'
);
select ok(
  public.save_game_stats('20000000-0000-0000-0000-000000000001', 2,
    '[{"rounds":8},{"rounds":8},{"rounds":8}]'),
  '保存し直せる'
);
select is((select count(*)::int from public.game_stats), 3, '行は増えずに置き換わる');
select is(
  (select array_agg(distinct version) from public.game_stats),
  array[2],
  '版番号が書き換わる'
);
select ok(
  not public.save_game_stats('20000000-0000-0000-0000-000000000002', 2, '[{},{},{}]'),
  '対局中の対局には保存できない'
);
select ok(
  not public.save_game_stats('20000000-0000-0000-0000-000000000003', 2, '[{},{},{}]'),
  '破棄された対局には保存できない'
);
select ok(
  not public.save_game_stats('20000000-0000-0000-0000-000000000001', 2, '[{},{}]'),
  '3人分でなければ保存しない'
);

-- 指定したユーザーとしてログインした状態にする
create function pg_temp.login(user_id text) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_id, 'role', 'authenticated')::text,
    true
  );
end $$;

-- ---- 承認済みの部外者（dave）----
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select is((select count(*)::int from public.game_stats), 3, '承認済みなら、参加していない対局の集計値も読める');
select is((select count(*)::int from public.game_results), 3, '承認済みなら、参加していない対局の結果も読める');
select throws_ok(
  $$ insert into public.game_stats (game_id, player_id, version, stats)
     values ('20000000-0000-0000-0000-000000000001',
             '00000000-0000-0000-0000-00000000000d', 1, '{}') $$,
  '42501', null, '集計値は直接書けない'
);
select throws_ok(
  $$ update public.game_stats set stats = '{}' $$,
  '42501', null, '集計値は書き換えられない'
);
select throws_ok(
  $$ select public.save_game_stats('20000000-0000-0000-0000-000000000001', 9, '[{},{},{}]') $$,
  '42501', null, '保存する関数は直接呼べない'
);
select throws_ok(
  $$ select * from public.games_needing_stats(1, 10) $$,
  '42501', null, '一覧の関数は直接呼べない'
);

-- ---- 未承認（eve）----
select pg_temp.login('00000000-0000-0000-0000-00000000000e');
select is((select count(*)::int from public.game_stats), 0, '未承認は集計値を読めない');
select is((select count(*)::int from public.game_results), 0, '未承認は結果を読めない');

select * from finish();
rollback;
