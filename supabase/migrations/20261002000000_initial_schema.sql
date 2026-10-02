-- 初期スキーマ。
-- クライアントからの書き込みは一切許可しない。書き込みはすべてAPIルート（service_role）経由。
-- 読み取りはRLSで絞る。未承認のユーザーは自分のプロフィール以外何も読めない。

-- ---- テーブル ----

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- 最初のログイン後に本人が決める。重複不可。
  display_name text unique check (char_length(display_name) between 1 and 12),
  approved boolean not null default false,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  status text not null default 'waiting'
    check (status in ('waiting', 'in_game', 'finished', 'abandoned')),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.room_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  seat smallint not null check (seat between 0 and 2),
  rematch_ready boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id),
  unique (room_id, seat)
);

create index room_members_user_id_idx on public.room_members (user_id);

-- 対局の公開情報
create table public.games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  status text not null default 'playing'
    check (status in ('playing', 'finished', 'abandoned')),
  -- 保存のたびに1増える。読み込んだ版と一致するときだけ更新する。
  version integer not null default 0,
  -- 席順（添字が席番号）
  player_ids uuid[] not null check (cardinality(player_ids) = 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create index games_room_id_idx on public.games (room_id);
create index games_player_ids_idx on public.games using gin (player_ids);

-- 権威的な全状態（山、全員の手牌、乱数の種）。サーバーだけが読む。
create table public.game_secrets (
  game_id uuid primary key references public.games (id) on delete cascade,
  state jsonb not null
);

-- プレイヤー別の画面データ（自分の手牌＋公開情報）
create table public.game_views (
  game_id uuid not null references public.games (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  seat smallint not null check (seat between 0 and 2),
  version integer not null default 0,
  view jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (game_id, player_id)
);

create index game_views_player_id_idx on public.game_views (player_id);

-- 牌譜（全イベント）
create table public.game_events (
  game_id uuid not null references public.games (id) on delete cascade,
  seq integer not null,
  event jsonb not null,
  created_at timestamptz not null default now(),
  primary key (game_id, seq)
);

create table public.game_results (
  game_id uuid not null references public.games (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  seat smallint not null check (seat between 0 and 2),
  rank smallint not null check (rank between 1 and 3),
  -- 最終持ち点
  points integer not null,
  -- 支払い表の枚数
  score integer not null,
  -- 祝儀の枚数
  chips integer not null,
  created_at timestamptz not null default now(),
  primary key (game_id, player_id)
);

create index game_results_player_id_idx on public.game_results (player_id);

-- ---- 新規ユーザーのプロフィールを自動で作る ----

create function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---- RLSから使う判定関数 ----
-- ポリシーの中で別のテーブルを直接引くとRLSが入れ子になるので、security definer の関数にまとめる。

create function public.is_approved() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and approved
  );
$$;

create function public.is_room_member(target_room uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.room_members
    where room_id = target_room and user_id = (select auth.uid())
  );
$$;

create function public.is_game_player(target_game uuid, finished_only boolean default false)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.games
    where id = target_game
      and (select auth.uid()) = any (player_ids)
      and (not finished_only or status = 'finished')
  );
$$;

-- ---- 権限 ----
-- 未ログイン（anon）には何も許可しない。ログイン済みには読み取りだけを許可し、行はRLSで絞る。

revoke all on
  public.profiles,
  public.rooms,
  public.room_members,
  public.games,
  public.game_secrets,
  public.game_views,
  public.game_events,
  public.game_results
from anon, authenticated;

grant select on
  public.profiles,
  public.rooms,
  public.room_members,
  public.games,
  public.game_views,
  public.game_events,
  public.game_results
to authenticated;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.is_approved() from public, anon;
revoke all on function public.is_room_member(uuid) from public, anon;
revoke all on function public.is_game_player(uuid, boolean) from public, anon;
grant execute on function public.is_approved() to authenticated;
grant execute on function public.is_room_member(uuid) to authenticated;
grant execute on function public.is_game_player(uuid, boolean) to authenticated;

-- ---- RLS ----

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.games enable row level security;
alter table public.game_secrets enable row level security;
alter table public.game_views enable row level security;
alter table public.game_events enable row level security;
alter table public.game_results enable row level security;

-- 自分の行は未承認でも読める（承認待ちの表示に使う）。承認済みなら全員分を読める。
create policy "profiles: 自分の行、または承認済みなら全員" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_approved()));

create policy "rooms: 参加しているルーム" on public.rooms
  for select to authenticated
  using ((select public.is_approved()) and public.is_room_member(id));

create policy "room_members: 参加しているルーム" on public.room_members
  for select to authenticated
  using ((select public.is_approved()) and public.is_room_member(room_id));

create policy "games: 参加している対局" on public.games
  for select to authenticated
  using ((select public.is_approved()) and (select auth.uid()) = any (player_ids));

-- game_secrets にはポリシーを作らない（誰も読めない）。

create policy "game_views: 自分の行だけ" on public.game_views
  for select to authenticated
  using ((select public.is_approved()) and player_id = (select auth.uid()));

create policy "game_events: 終了した対局の参加者" on public.game_events
  for select to authenticated
  using ((select public.is_approved()) and public.is_game_player(game_id, true));

create policy "game_results: 参加した対局" on public.game_results
  for select to authenticated
  using ((select public.is_approved()) and public.is_game_player(game_id));

-- ---- Realtime ----
-- クライアントは game_views の自分の行の変更だけを購読する。RLSにより他人の行は届かない。

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.game_views;
  end if;
end $$;
