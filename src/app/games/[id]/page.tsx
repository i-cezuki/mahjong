import { notFound } from "next/navigation";
import { requireApproved } from "@/server/auth";
import { isUuid } from "@/server/room-rules";
import { createSessionClient } from "@/server/supabase";
import type { PlayerView } from "@/server/table";
import { GameClient } from "./game-client";

export default async function GamePage({ params }: PageProps<"/games/[id]">) {
  const viewer = await requireApproved();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  // ログイン中のユーザーとして読む。参加者でなければRLSにより何も返らない。
  const supabase = await createSessionClient();
  const [game, row] = await Promise.all([
    supabase
      .from("games")
      .select("room_id, player_ids")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("game_views")
      .select("version, view")
      .eq("game_id", id)
      .eq("player_id", viewer.id)
      .maybeSingle(),
  ]);
  if (!game.data || !row.data) notFound();

  const [profiles, room] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", game.data.player_ids),
    supabase
      .from("rooms")
      .select("code")
      .eq("id", game.data.room_id)
      .maybeSingle(),
  ]);
  const nameOf = new Map(
    (profiles.data ?? []).map((profile) => [profile.id, profile.display_name]),
  );

  return (
    <GameClient
      gameId={id}
      roomCode={room.data?.code ?? null}
      names={game.data.player_ids.map((pid) => nameOf.get(pid) ?? "（不明）")}
      initialVersion={row.data.version}
      initialView={row.data.view as unknown as PlayerView}
    />
  );
}
