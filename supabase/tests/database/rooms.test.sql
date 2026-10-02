-- ルームの操作と対局の保存のテスト。npm run test:db で実行する。
begin;
create extension if not exists pgtap with schema extensions;
select plan(49);

-- alice, bob, carol, dave は承認済み。eve は未承認。
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@example.com'),
  ('00000000-0000-0000-0000-00000000000e', 'eve@example.com');
update public.profiles set approved = true, display_name = left(id::text, 8) || right(id::text, 1)
  where id <> '00000000-0000-0000-0000-00000000000e';

create temp table ids as select
  '00000000-0000-0000-0000-00000000000a'::uuid as alice,
  '00000000-0000-0000-0000-00000000000b'::uuid as bob,
  '00000000-0000-0000-0000-00000000000c'::uuid as carol,
  '00000000-0000-0000-0000-00000000000d'::uuid as dave,
  '00000000-0000-0000-0000-00000000000e'::uuid as eve;
create temp table results (name text primary key, value jsonb);

-- ---- ルームを作る ----
insert into results select 'create', public.create_room(alice, 'AAA111') from ids;
select is((select value->>'result' from results where name = 'create'), 'created', 'ルームを作れる');
select is(
  (select count(*)::int from public.room_members m, ids
   where m.user_id = ids.alice and m.seat = 0),
  1,
  '作った人が最初のメンバーになる'
);
select is(
  (select public.create_room(alice, 'AAA222')->>'result' from ids),
  'busy',
  '参加中のルームがあると別のルームは作れない'
);
select is(
  (select public.create_room(eve, 'EEE111')->>'result' from ids),
  'forbidden',
  '未承認はルームを作れない'
);
select throws_ok(
  $$ select public.create_room(dave, 'AAA111') from ids $$,
  '23505', null, 'コードが重複したらエラーになる'
);

-- ---- 参加する ----
select is(
  (select public.join_room(bob, 'ZZZ999')->>'result' from ids),
  'not_found',
  '存在しないコードには参加できない'
);
select is(
  (select public.join_room(eve, 'AAA111')->>'result' from ids),
  'forbidden',
  '未承認は参加できない'
);
insert into results select 'join_bob', public.join_room(bob, 'AAA111') from ids;
select is((select value->>'result' from results where name = 'join_bob'), 'joined', '2人目が参加できる');
select is((select (value->>'member_count')::int from results where name = 'join_bob'), 2, '人数が返る');
select is(
  (select public.join_room(bob, 'AAA111')->>'result' from ids),
  'already',
  '同じ人がもう一度参加しても増えない'
);
select is(
  (select public.join_room(alice, 'AAA111')->>'result' from ids),
  'already',
  '作った人が自分のコードで参加しても増えない'
);

-- ---- 抜ける ----
select ok(
  (select public.leave_room(bob, (select id from public.rooms where code = 'AAA111')) from ids),
  '待機中は抜けられる'
);
select is(
  (select public.join_room(bob, 'AAA111')->>'result' from ids),
  'joined',
  '抜けたあと、もう一度参加できる'
);
select is(
  (select m.seat::int from public.room_members m, ids where m.user_id = ids.bob),
  1,
  '空いている席に入る'
);
insert into results select 'join_carol', public.join_room(carol, 'AAA111') from ids;
select is((select (value->>'member_count')::int from results where name = 'join_carol'), 3, '3人目で3人になる');
select is(
  (select public.join_room(dave, 'AAA111')->>'result' from ids),
  'full',
  '4人目は参加できない'
);

-- 別のルームで、最後の1人が抜けるとルームが消える
select is((select public.create_room(dave, 'DDD111')->>'result' from ids), 'created', '別のルームを作れる');
select is(
  (select public.join_room(dave, 'AAA111')->>'result' from ids),
  'full',
  '満員のルームには参加できない'
);
select ok(
  (select public.leave_room(dave, (select id from public.rooms where code = 'DDD111')) from ids),
  '1人のルームから抜けられる'
);
select is(
  (select count(*)::int from public.rooms where code = 'DDD111'),
  0,
  '誰もいなくなったルームは消える'
);

-- ---- 対局を始める ----
create temp table room as select id from public.rooms where code = 'AAA111';

select is(
  (select public.start_game(room.id, 'waiting', array[alice, bob, dave],
     '{"s":0}', '[{"v":"a"},{"v":"b"},{"v":"c"}]', '[{"type":"seed"},{"type":"roundStart"}]')
   from ids, room),
  null,
  'メンバーでない人を含むと始められない'
);
select is(
  (select public.start_game(room.id, 'finished', array[alice, bob, carol],
     '{"s":0}', '[{"v":"a"},{"v":"b"},{"v":"c"}]', '[]')
   from ids, room),
  null,
  'ルームの状態が違うと始められない'
);

-- 席順は carol, alice, bob
create temp table game as
  select public.start_game(room.id, 'waiting', array[carol, alice, bob],
    '{"s":0}', '[{"v":"c"},{"v":"a"},{"v":"b"}]', '[{"type":"seed"},{"type":"roundStart"}]') as id
  from ids, room;
select isnt((select id from game), null, '3人そろっていれば始められる');
select is((select status from public.rooms, room where rooms.id = room.id), 'in_game', 'ルームが対局中になる');
select is(
  (select v.view->>'v' from public.game_views v, ids where v.player_id = ids.alice),
  'a',
  '画面データは席順どおりに配られる'
);
select is(
  (select v.seat::int from public.game_views v, ids where v.player_id = ids.alice),
  1,
  '席番号は席順の添字'
);
select is((select count(*)::int from public.game_events), 2, '最初のイベントが記録される');
select is(
  (select public.start_game(room.id, 'waiting', array[carol, alice, bob], '{}', '[{},{},{}]', '[]')
   from ids, room),
  null,
  '同じルームで2回は始められない'
);
select ok(
  not (select public.leave_room(alice, room.id) from ids, room),
  '対局が始まったら抜けられない'
);
select is(
  (select public.create_room(alice, 'AAA333')->>'result' from ids),
  'busy',
  '対局中は別のルームを作れない'
);
select is(
  (select public.set_rematch_ready(alice, room.id)->>'result' from ids, room),
  'not_allowed',
  '対局中は再戦を押せない'
);

-- ---- 保存 ----
select ok(
  (select public.save_game(game.id, 0, '{"s":1}', '[{"v":"c1"},{"v":"a1"},{"v":"b1"}]',
     '[{"type":"discard"}]') from game),
  '版番号が一致すれば保存できる'
);
select is((select version from public.games), 1, '版番号が1進む');
select is((select state->>'s' from public.game_secrets), '1', '状態が書き換わる');
select is(
  (select array_agg(v.view->>'v' order by v.seat) from public.game_views v),
  array['c1', 'a1', 'b1'],
  '3人分の画面データが書き換わる'
);
select is((select min(version) from public.game_views), 1, '画面データの版番号も進む');
select is(
  (select array_agg(seq order by seq) from public.game_events),
  array[1, 2, 3],
  'イベントは続きの番号で追記される'
);

select ok(
  not (select public.save_game(game.id, 0, '{"s":2}', '[{"v":"x"},{"v":"x"},{"v":"x"}]',
     '[{"type":"discard"}]') from game),
  '古い版番号では保存できない'
);
select is((select state->>'s' from public.game_secrets), '1', '失敗した保存は何も書かない');
select is((select count(*)::int from public.game_events), 3, '失敗した保存はイベントも書かない');

-- ---- 終局 ----
select ok(
  (select public.save_game(game.id, 1, '{"s":3}', '[{"v":"c2"},{"v":"a2"},{"v":"b2"}]',
     '[{"type":"gameEnd"}]',
     '[{"rank":2,"points":30000,"score":0,"chips":1},
       {"rank":1,"points":50000,"score":20,"chips":3},
       {"rank":3,"points":10000,"score":-20,"chips":-4}]') from game),
  '終局の結果を付けて保存できる'
);
select is((select status from public.games), 'finished', '対局が終了になる');
select is(
  (select r.rank::int from public.game_results r, ids where r.player_id = ids.alice),
  1,
  '結果は席順どおりに記録される'
);
select is((select status from public.rooms, room where rooms.id = room.id), 'finished', 'ルームが終了になる');
select ok(
  not (select public.save_game(game.id, 2, '{"s":4}', '[{},{},{}]', '[]') from game),
  '終了した対局には保存できない'
);

-- ---- 再戦 ----
insert into results select 'rematch_a', public.set_rematch_ready(alice, room.id) from ids, room;
select is(
  (select (value->>'all_ready')::boolean from results where name = 'rematch_a'),
  false,
  '1人が押しただけではそろわない'
);
-- alice がほかのルームに入ると、再戦の表明は取り消される
select public.create_room(alice, 'AAA444') from ids;
select is(
  (select m.rematch_ready from public.room_members m, ids, room
   where m.room_id = room.id and m.user_id = ids.alice),
  false,
  'ほかのルームに入ると再戦の表明が取り消される'
);
select is(
  (select public.set_rematch_ready(alice, room.id)->>'result' from ids, room),
  'busy',
  'ほかのルームに参加中は再戦を押せない'
);
select public.leave_room(alice, (select id from public.rooms where code = 'AAA444')) from ids;
select public.set_rematch_ready(alice, room.id) from ids, room;
select public.set_rematch_ready(bob, room.id) from ids, room;
select is(
  (select (public.set_rematch_ready(carol, room.id)->>'all_ready')::boolean from ids, room),
  true,
  '3人が押すとそろう'
);

select * from finish();
rollback;
