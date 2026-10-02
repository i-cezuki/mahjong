-- ルームの操作と対局の保存。
-- どれもサーバー（service_role）だけが呼ぶ。複数の行を1回のトランザクションで書くために関数にする。

-- ---- ルーム ----

-- 進行中（3人待ち、対局中）のルームに入っているか。同時に参加できるルームは1つだけ。
create function public.active_room_of(p_user uuid) returns uuid
language sql
stable
set search_path = ''
as $$
  select r.id
  from public.room_members m
  join public.rooms r on r.id = m.room_id
  where m.user_id = p_user and r.status in ('waiting', 'in_game')
  limit 1;
$$;

-- 同じ人の操作が同時に走らないよう、プロフィールの行をロックする。未承認なら false。
create function public.lock_approved_profile(p_user uuid) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_approved boolean;
begin
  select approved and display_name is not null into v_approved
  from public.profiles where id = p_user for update;
  return coalesce(v_approved, false);
end;
$$;

-- ルームを作って最初のメンバーになる。
-- 戻り値の result: created / busy（ほかのルームに参加中）/ forbidden（未承認）
-- コードが重複したら 23505 のエラーになるので、呼び出す側が別のコードでやり直す。
create function public.create_room(p_user uuid, p_code text) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_active uuid;
  v_room uuid;
begin
  if not public.lock_approved_profile(p_user) then
    return jsonb_build_object('result', 'forbidden');
  end if;
  v_active := public.active_room_of(p_user);
  if v_active is not null then
    return jsonb_build_object('result', 'busy', 'room_id', v_active);
  end if;

  insert into public.rooms (code, created_by) values (p_code, p_user)
  returning id into v_room;
  insert into public.room_members (room_id, user_id, seat) values (v_room, p_user, 0);
  -- 終わったルームで再戦を押したままほかのルームに入ると、2つの対局に入ってしまう
  update public.room_members set rematch_ready = false
  where user_id = p_user and room_id <> v_room and rematch_ready;

  return jsonb_build_object('result', 'created', 'room_id', v_room);
end;
$$;

-- ルームコードで参加する。
-- 戻り値の result: joined / already（すでにメンバー）/ not_found / full（満員か、待機中でない）/ busy / forbidden
-- member_count が3になったら、呼び出す側が対局を始める。
create function public.join_room(p_user uuid, p_code text) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_active uuid;
  v_count integer;
  v_seat smallint;
begin
  if not public.lock_approved_profile(p_user) then
    return jsonb_build_object('result', 'forbidden');
  end if;

  select * into v_room from public.rooms where code = p_code for update;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  select count(*) into v_count from public.room_members where room_id = v_room.id;
  if exists (
    select 1 from public.room_members where room_id = v_room.id and user_id = p_user
  ) then
    return jsonb_build_object(
      'result', 'already', 'room_id', v_room.id, 'member_count', v_count
    );
  end if;

  if v_room.status <> 'waiting' or v_count >= 3 then
    return jsonb_build_object('result', 'full');
  end if;
  v_active := public.active_room_of(p_user);
  if v_active is not null then
    return jsonb_build_object('result', 'busy', 'room_id', v_active);
  end if;

  select s into v_seat
  from generate_series(0, 2) as s
  where not exists (
    select 1 from public.room_members where room_id = v_room.id and seat = s
  )
  order by s limit 1;

  insert into public.room_members (room_id, user_id, seat) values (v_room.id, p_user, v_seat);
  update public.room_members set rematch_ready = false
  where user_id = p_user and room_id <> v_room.id and rematch_ready;
  update public.rooms set updated_at = now() where id = v_room.id;

  return jsonb_build_object(
    'result', 'joined', 'room_id', v_room.id, 'member_count', v_count + 1
  );
end;
$$;

-- 3人待ちのルームから抜ける。誰もいなくなったらルームを消す。
-- 対局が始まったあとは抜けられない。抜けられたら true。
create function public.leave_room(p_user uuid, p_room uuid) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status from public.rooms where id = p_room for update;
  if not found or v_status <> 'waiting' then
    return false;
  end if;

  delete from public.room_members where room_id = p_room and user_id = p_user;
  if not found then
    return false;
  end if;

  if exists (select 1 from public.room_members where room_id = p_room) then
    update public.rooms set updated_at = now() where id = p_room;
  else
    delete from public.rooms where id = p_room;
  end if;
  return true;
end;
$$;

-- 終わったルームで再戦を押す。
-- 戻り値の result: ok / not_allowed / busy / forbidden。all_ready が true なら呼び出す側が対局を始める。
create function public.set_rematch_ready(p_user uuid, p_room uuid) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
  v_active uuid;
  v_all boolean;
begin
  if not public.lock_approved_profile(p_user) then
    return jsonb_build_object('result', 'forbidden');
  end if;

  select status into v_status from public.rooms where id = p_room for update;
  if not found or v_status <> 'finished' then
    return jsonb_build_object('result', 'not_allowed');
  end if;
  v_active := public.active_room_of(p_user);
  if v_active is not null then
    return jsonb_build_object('result', 'busy', 'room_id', v_active);
  end if;

  update public.room_members set rematch_ready = true
  where room_id = p_room and user_id = p_user;
  if not found then
    return jsonb_build_object('result', 'not_allowed');
  end if;
  update public.rooms set updated_at = now() where id = p_room;

  select count(*) = 3 and bool_and(rematch_ready) into v_all
  from public.room_members where room_id = p_room;
  return jsonb_build_object('result', 'ok', 'all_ready', v_all);
end;
$$;

-- ---- 対局 ----

-- 対局を始める。ルームが p_expected_status（waiting か finished）のときだけ成功し、対局のidを返す。
-- 同時に2回呼ばれても、始まる対局は1つだけ。始められなければ null。
-- p_player_ids は席順。p_views は席順に並んだ3人分の画面データ。
create function public.start_game(
  p_room uuid,
  p_expected_status text,
  p_player_ids uuid[],
  p_state jsonb,
  p_views jsonb,
  p_events jsonb
) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
  v_game uuid;
begin
  select status into v_status from public.rooms where id = p_room for update;
  if not found or v_status <> p_expected_status then
    return null;
  end if;

  -- 席順に並べた3人が、いまのメンバーと一致すること
  if cardinality(p_player_ids) <> 3
    or jsonb_array_length(p_views) <> 3
    or (select count(distinct id) from unnest(p_player_ids) as id) <> 3
    or (select count(*) from public.room_members where room_id = p_room) <> 3
    or (
      select count(*) from public.room_members
      where room_id = p_room and user_id = any (p_player_ids)
    ) <> 3
  then
    return null;
  end if;
  -- 再戦は3人とも押していること
  if p_expected_status = 'finished' and exists (
    select 1 from public.room_members where room_id = p_room and not rematch_ready
  ) then
    return null;
  end if;

  update public.rooms set status = 'in_game', updated_at = now() where id = p_room;
  update public.room_members set rematch_ready = false where room_id = p_room;

  insert into public.games (room_id, player_ids) values (p_room, p_player_ids)
  returning id into v_game;
  insert into public.game_secrets (game_id, state) values (v_game, p_state);
  insert into public.game_views (game_id, player_id, seat, view)
  select v_game, p_player_ids[s + 1], s, p_views -> s
  from generate_series(0, 2) as s;
  insert into public.game_events (game_id, seq, event)
  select v_game, e.ordinality, e.value
  from jsonb_array_elements(p_events) with ordinality as e;

  return v_game;
end;
$$;

-- 操作の結果を保存する。読み込んだ版番号と一致するときだけ書き、版番号を1進める。
-- 状態、イベント、3人分の画面データを同時に書く。版番号が合わなければ何も書かずに false。
-- p_results は終局したときだけ渡す（席順に並んだ3人分の rank, points, score, chips）。
create function public.save_game(
  p_game uuid,
  p_expected_version integer,
  p_state jsonb,
  p_views jsonb,
  p_events jsonb,
  p_results jsonb default null
) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_room uuid;
  v_players uuid[];
  v_seq integer;
begin
  update public.games
  set version = version + 1,
      updated_at = now(),
      status = case when p_results is null then status else 'finished' end,
      finished_at = case when p_results is null then null else now() end
  where id = p_game and version = p_expected_version and status = 'playing'
  returning room_id, player_ids into v_room, v_players;
  if not found then
    return false;
  end if;

  update public.game_secrets set state = p_state where game_id = p_game;
  update public.game_views
  set view = p_views -> seat::integer,
      version = p_expected_version + 1,
      updated_at = now()
  where game_id = p_game;

  select coalesce(max(seq), 0) into v_seq from public.game_events where game_id = p_game;
  insert into public.game_events (game_id, seq, event)
  select p_game, v_seq + e.ordinality, e.value
  from jsonb_array_elements(p_events) with ordinality as e;

  if p_results is not null then
    insert into public.game_results (game_id, player_id, seat, rank, points, score, chips)
    select
      p_game,
      v_players[s + 1],
      s,
      (p_results -> s ->> 'rank')::smallint,
      (p_results -> s ->> 'points')::integer,
      (p_results -> s ->> 'score')::integer,
      (p_results -> s ->> 'chips')::integer
    from generate_series(0, 2) as s;
    update public.rooms set status = 'finished', updated_at = now() where id = v_room;
  end if;

  return true;
end;
$$;

-- ---- 権限 ----
-- 既定では誰でも関数を実行できるので、サーバー以外から取り上げる。

revoke all on function public.active_room_of(uuid) from public, anon, authenticated;
revoke all on function public.lock_approved_profile(uuid) from public, anon, authenticated;
revoke all on function public.create_room(uuid, text) from public, anon, authenticated;
revoke all on function public.join_room(uuid, text) from public, anon, authenticated;
revoke all on function public.leave_room(uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_rematch_ready(uuid, uuid) from public, anon, authenticated;
revoke all on function public.start_game(uuid, text, uuid[], jsonb, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.save_game(uuid, integer, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;

grant execute on function public.active_room_of(uuid) to service_role;
grant execute on function public.lock_approved_profile(uuid) to service_role;
grant execute on function public.create_room(uuid, text) to service_role;
grant execute on function public.join_room(uuid, text) to service_role;
grant execute on function public.leave_room(uuid, uuid) to service_role;
grant execute on function public.set_rematch_ready(uuid, uuid) to service_role;
grant execute on function public.start_game(uuid, text, uuid[], jsonb, jsonb, jsonb) to service_role;
grant execute on function public.save_game(uuid, integer, jsonb, jsonb, jsonb, jsonb) to service_role;

-- ---- Realtime ----
-- ルームの待機画面は rooms の自分のルームの変更を購読する（メンバーの増減のたびに updated_at を更新する）。

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.rooms;
  end if;
end $$;
