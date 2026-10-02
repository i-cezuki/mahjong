import Link from "next/link";
import { notFound } from "next/navigation";
import { Screen, buttonClass } from "@/components/screen";
import { requireApproved } from "@/server/auth";
import { abandonStaleGames } from "@/server/games";
import { isUuid } from "@/server/room-rules";
import { createSessionClient } from "@/server/supabase";
import type { PlayerView } from "@/server/table";
import { GameClient } from "./game-client";

export default async function GamePage({ params }: PageProps<"/games/[id]">) {
  const viewer = await requireApproved();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await abandonStaleGames(viewer.id).catch(() => 0);

  // ログイン中のユーザーとして読む。参加者でなければRLSにより何も返らない。
  const supabase = await createSessionClient();
  const [game, row] = await Promise.all([
    supabase
      .from("games")
      .select("room_id, player_ids, status")
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
  if (game.data.status === "abandoned") {
    return (
      <Screen title="対局">
        <p className="text-sm opacity-80">
          この対局は破棄されました（3人とも10分以上操作がありませんでした）。
        </p>
        <Link href="/" className={`${buttonClass} text-center`}>
          ホームへ戻る
        </Link>
      </Screen>
    );
  }

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
