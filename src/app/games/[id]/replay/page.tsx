import Link from "next/link";
import { notFound } from "next/navigation";
import { Screen, subtleButtonClass } from "@/components/screen";
import type { Seat } from "@/engine";
import { requireApproved } from "@/server/auth";
import { isUuid } from "@/server/room-rules";
import { readAll } from "@/server/stats";
import { createSessionClient } from "@/server/supabase";
import type { TableEvent } from "@/server/table";
import { ReplayClient } from "./replay-client";

export default async function ReplayPage({
  params,
}: PageProps<"/games/[id]/replay">) {
  const viewer = await requireApproved();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  // ログイン中のユーザーとして読む。牌譜は終わった対局の参加者にしかRLSで見えない
  const supabase = await createSessionClient();
  const { data: game } = await supabase
    .from("games")
    .select("player_ids, status")
    .eq("id", id)
    .maybeSingle();
  if (!game) notFound();
  if (game.status !== "finished") {
    return (
      <Screen title="牌譜">
        <p className="text-sm opacity-80">
          牌譜は対局が終わってから見られます。
        </p>
        <Link href="/history" className={subtleButtonClass}>
          対局履歴へ
        </Link>
      </Screen>
    );
  }

  const [rows, profiles] = await Promise.all([
    readAll((from, to) =>
      supabase
        .from("game_events")
        .select("event")
        .eq("game_id", id)
        .order("seq")
        .range(from, to),
    ),
    supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", game.player_ids),
  ]);
  const nameOf = new Map(
    (profiles.data ?? []).map((profile) => [profile.id, profile.display_name]),
  );
  const seat = game.player_ids.indexOf(viewer.id);

  return (
    <ReplayClient
      events={rows.map((row) => row.event as unknown as TableEvent)}
      names={game.player_ids.map((pid) => nameOf.get(pid) ?? "（不明）")}
      initialSeat={(seat >= 0 ? seat : 0) as Seat}
    />
  );
}
