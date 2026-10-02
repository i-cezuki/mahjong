-- 対局ごと、プレイヤーごとの集計値。牌譜（game_events）から計算して保存する。
-- 成績の画面は、これと game_results を人ごとに足し合わせる。

create table public.game_stats (
  game_id uuid not null references public.games (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  -- 計算方法の版番号（src/stats/types.ts の STATS_VERSION）。古い行は定期実行が計算し直す。
  version integer not null,
  -- 回数と合計（src/stats/types.ts の GameStats）
  stats jsonb not null,
  created_at timestamptz not null default now(),
  primary key (game_id, player_id)
);

create index game_stats_player_id_idx on public.game_stats (player_id);

-- ---- 権限 ----
-- 成績は身内で比べるためのものなので、承認済みなら全員分を読める。書けるのはサーバーだけ。
-- 牌譜（game_events）は今までどおり、その対局の参加者だけ。

revoke all on public.game_stats from anon, authenticated;
grant select on public.game_stats to authenticated;

alter table public.game_stats enable row level security;

create policy "game_stats: 承認済みなら全員分" on public.game_stats
  for select to authenticated
  using ((select public.is_approved()));

drop policy "game_results: 参加した対局" on public.game_results;
create policy "game_results: 承認済みなら全員分" on public.game_results
  for select to authenticated
  using ((select public.is_approved()));

-- ---- 関数 ----

-- 集計値を保存する。p_stats は席順に並んだ3人分。すでにあれば置き換える。
-- 終局した対局でなければ何もせずに false。
create function public.save_game_stats(
  p_game uuid,
  p_version integer,
  p_stats jsonb
) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_players uuid[];
begin
  select player_ids into v_players
  from public.games
  where id = p_game and status = 'finished';
  if not found or jsonb_typeof(p_stats) <> 'array' or jsonb_array_length(p_stats) <> 3 then
    return false;
  end if;

  insert into public.game_stats (game_id, player_id, version, stats)
  select p_game, v_players[s + 1], p_version, p_stats -> s
  from generate_series(0, 2) as s
  on conflict (game_id, player_id)
  do update set version = excluded.version, stats = excluded.stats;
  return true;
end;
$$;

-- 集計値がない、または版番号が違う、終局した対局。古い順。
create function public.games_needing_stats(p_version integer, p_limit integer)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select g.id
  from public.games g
  where g.status = 'finished'
    and (
      select count(*) from public.game_stats s
      where s.game_id = g.id and s.version = p_version
    ) < 3
  order by g.finished_at
  limit p_limit;
$$;

revoke all on function public.save_game_stats(uuid, integer, jsonb) from public, anon, authenticated;
revoke all on function public.games_needing_stats(integer, integer) from public, anon, authenticated;
grant execute on function public.save_game_stats(uuid, integer, jsonb) to service_role;
grant execute on function public.games_needing_stats(integer, integer) to service_role;
