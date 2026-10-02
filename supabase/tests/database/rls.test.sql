-- RLSのテスト。npm run test:db で実行する。
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

-- ---- 準備（postgres 権限で直接書き込む）----
-- alice, bob, carol は承認済みで同じ対局の参加者。dave は承認済みの部外者。eve は未承認。
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@example.com'),
  ('00000000-0000-0000-0000-00000000000e', 'eve@example.com');

select is(
  (select count(*)::int from public.profiles),
  5,
  'ユーザーを作るとプロフィールが自動で作られる'
);
select is(
  (select count(*)::int from public.profiles where approved or is_admin),
  0,
  '作られた直後は未承認で、管理者でもない'
);

update public.profiles set approved = true
  where id <> '00000000-0000-0000-0000-00000000000e';
update public.profiles set display_name = 'アリス'
  where id = '00000000-0000-0000-0000-00000000000a';

insert into public.rooms (id, code, status, created_by) values
  ('10000000-0000-0000-0000-000000000001', 'ABC234', 'in_game',
   '00000000-0000-0000-0000-00000000000a');
insert into public.room_members (room_id, user_id, seat) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 0),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 1),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 2);
insert into public.games (id, room_id, status, player_ids) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   'playing',
   array['00000000-0000-0000-0000-00000000000a',
         '00000000-0000-0000-0000-00000000000b',
         '00000000-0000-0000-0000-00000000000c']::uuid[]);
insert into public.game_secrets (game_id, state) values
  ('20000000-0000-0000-0000-000000000001', '{"wall":[1,2,3]}');
insert into public.game_views (game_id, player_id, seat, view) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 0, '{"hand":"a"}'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 1, '{"hand":"b"}'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 2, '{"hand":"c"}');
insert into public.game_events (game_id, seq, event) values
  ('20000000-0000-0000-0000-000000000001', 1, '{"type":"deal"}');
insert into public.game_results (game_id, player_id, seat, rank, points, score, chips) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 0, 1, 40000, 10, 0);

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

-- ---- 参加者（alice）----
select pg_temp.login('00000000-0000-0000-0000-00000000000a');

select is((select count(*)::int from public.profiles), 5, '承認済みなら全員のプロフィールが読める');
select is((select count(*)::int from public.rooms), 1, '参加しているルームが読める');
select is((select count(*)::int from public.room_members), 3, '参加しているルームのメンバーが読める');
select is((select count(*)::int from public.games), 1, '参加している対局が読める');
select is((select count(*)::int from public.game_views), 1, '画面データは自分の行だけ読める');
select is(
  (select view->>'hand' from public.game_views),
  'a',
  '読める画面データは自分のもの'
);
select throws_ok(
  $$ select count(*) from public.game_secrets $$,
  '42501', null, 'game_secrets は参加者でも読めない'
);
select is((select count(*)::int from public.game_events), 0, '進行中の牌譜は参加者でも読めない');
select is((select count(*)::int from public.game_results), 1, '参加した対局の結果が読める');

select throws_ok(
  $$ update public.game_views set view = '{}' $$,
  '42501', null, '画面データは書き換えられない'
);
select throws_ok(
  $$ update public.profiles set approved = true, is_admin = true $$,
  '42501', null, 'プロフィールは書き換えられない'
);
select throws_ok(
  $$ insert into public.rooms (code, created_by)
     values ('ZZZ999', '00000000-0000-0000-0000-00000000000a') $$,
  '42501', null, 'ルームは直接作れない'
);
select throws_ok(
  $$ delete from public.game_events $$,
  '42501', null, '牌譜は消せない'
);
select throws_ok(
  $$ update public.games set version = 99 $$,
  '42501', null, '対局は書き換えられない'
);

-- ---- 別の参加者（bob）----
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select is(
  (select view->>'hand' from public.game_views),
  'b',
  '別の参加者には別の画面データだけが見える'
);

-- ---- 承認済みの部外者（dave）----
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select is((select count(*)::int from public.profiles), 5, '部外者でも承認済みなら表示名は読める');
select is((select count(*)::int from public.rooms), 0, '参加していないルームは読めない');
select is((select count(*)::int from public.room_members), 0, '参加していないルームのメンバーは読めない');
select is((select count(*)::int from public.games), 0, '参加していない対局は読めない');
select is((select count(*)::int from public.game_views), 0, '他人の画面データは読めない');
select throws_ok(
  $$ select count(*) from public.game_secrets $$,
  '42501', null, '部外者は game_secrets を読めない'
);
select is((select count(*)::int from public.game_results), 0, '参加していない対局の結果は読めない');

-- ---- 未承認（eve）----
select pg_temp.login('00000000-0000-0000-0000-00000000000e');
select is((select count(*)::int from public.profiles), 1, '未承認でも自分のプロフィールだけは読める');
select is(
  (select id::text from public.profiles),
  '00000000-0000-0000-0000-00000000000e',
  '未承認が読めるのは自分の行'
);
select is((select count(*)::int from public.rooms), 0, '未承認はルームを読めない');
select is((select count(*)::int from public.game_views), 0, '未承認は画面データを読めない');

-- ---- 未ログイン ----
reset role;
set local role anon;
select throws_ok(
  $$ select count(*) from public.profiles $$,
  '42501', null, '未ログインではプロフィールを読めない'
);
select throws_ok(
  $$ select count(*) from public.game_views $$,
  '42501', null, '未ログインでは画面データを読めない'
);

-- ---- 対局終了後 ----
reset role;
update public.games set status = 'finished'
  where id = '20000000-0000-0000-0000-000000000001';

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.game_events), 1, '終了後は参加者が牌譜を読める');
select throws_ok(
  $$ select count(*) from public.game_secrets $$,
  '42501', null, '終了後も game_secrets は読めない'
);

select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select is((select count(*)::int from public.game_events), 0, '終了後も部外者は牌譜を読めない');

-- ---- 承認を取り消された参加者 ----
reset role;
update public.profiles set approved = false
  where id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.game_views), 0, '承認を取り消されたら自分の画面データも読めない');

select * from finish();
rollback;
