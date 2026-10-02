-- 放置された対局の破棄。
-- 対局中のまま、最後の保存から10分たった対局とそのルームを破棄にする。
-- 画面を開いている人がいれば時間切れが申告されて保存が進むので、10分進まないのは3人とも不在のとき。
-- p_user を渡すと、その人が参加している対局だけを対象にする。破棄した対局の数を返す。
-- サーバー（service_role）だけが呼ぶ。
create function public.abandon_stale_games(p_user uuid default null) returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  with stale as (
    update public.games
    set status = 'abandoned', updated_at = now()
    where status = 'playing'
      and updated_at < now() - interval '10 minutes'
      and (p_user is null or p_user = any (player_ids))
    returning room_id
  ),
  closed as (
    update public.rooms
    set status = 'abandoned', updated_at = now()
    where id in (select room_id from stale)
    returning id
  )
  select count(*) into v_count from stale;
  return v_count;
end;
$$;

revoke all on function public.abandon_stale_games(uuid) from public, anon, authenticated;
grant execute on function public.abandon_stale_games(uuid) to service_role;
