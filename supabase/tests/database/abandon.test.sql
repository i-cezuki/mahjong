-- 放置された対局の破棄のテスト。npm run test:db で実行する。
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@example.com');
update public.profiles set approved = true, display_name = left(id::text, 8) || right(id::text, 1);

create temp table ids as select
  '00000000-0000-0000-0000-00000000000a'::uuid as alice,
  '00000000-0000-0000-0000-00000000000b'::uuid as bob,
  '00000000-0000-0000-0000-00000000000c'::uuid as carol,
  '00000000-0000-0000-0000-00000000000d'::uuid as dave;

select public.create_room(alice, 'AAA111') from ids;
select public.join_room(bob, 'AAA111') from ids;
select public.join_room(carol, 'AAA111') from ids;
create temp table room as select id from public.rooms where code = 'AAA111';
create temp table game as
  select public.start_game(room.id, 'waiting', array[alice, bob, carol],
    '{"s":0}', '[{},{},{}]', '[]') as id
  from ids, room;

select is((select public.abandon_stale_games()), 0, '進んでいる対局は破棄しない');
update public.games set updated_at = now() - interval '9 minutes';
select is((select public.abandon_stale_games()), 0, '10分たっていなければ破棄しない');

update public.games set updated_at = now() - interval '11 minutes';
select is(
  (select public.abandon_stale_games(dave) from ids),
  0,
  '参加していない人を指定しても破棄しない'
);
select is(
  (select public.abandon_stale_games(alice) from ids),
  1,
  '参加者を指定すると、その人の放置対局を破棄する'
);
select is((select status from public.games), 'abandoned', '対局が破棄になる');
select is((select status from public.rooms), 'abandoned', 'ルームが破棄になる');
select is((select count(*)::int from public.game_results), 0, '結果は残さない');
select ok(
  not (select public.save_game(game.id, 0, '{"s":1}', '[{},{},{}]', '[]') from game),
  '破棄した対局には保存できない'
);
select is(
  (select public.create_room(alice, 'AAA222')->>'result' from ids),
  'created',
  '破棄のあとは新しいルームを作れる'
);
select is((select public.abandon_stale_games()), 0, '破棄済みの対局は数えない');

select ok(
  not has_function_privilege('authenticated', 'public.abandon_stale_games(uuid)', 'execute'),
  'ログイン中のユーザーは呼べない'
);
select ok(
  not has_function_privilege('anon', 'public.abandon_stale_games(uuid)', 'execute'),
  '未ログインは呼べない'
);

select * from finish();
rollback;
