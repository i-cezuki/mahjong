import "server-only";

import { randomBytes, randomInt } from "node:crypto";
import { IllegalActionError, SEATS } from "@/engine";
import type { PerSeat, Seat } from "@/engine";
import type { Json } from "./database.types";
import { shuffled } from "./room-rules";
import { createAdminClient } from "./supabase";
import { applyTableAction, buildView, parseAction, startTable } from "./table";
import type { PlayerView, TableState } from "./table";

/** 局ごとの乱数の種。暗号学的乱数から作る。 */
function newSeed(): string {
  return randomBytes(32).toString("hex");
}

function toJson(value: unknown): Json {
  return value as Json;
}

function viewsOf(table: TableState): PerSeat<PlayerView> {
  return [buildView(table, 0), buildView(table, 1), buildView(table, 2)];
}

/**
 * 3人そろったルームで対局を始める。席順は抽選で決め、席0が起家になる。
 * ルームが expectedStatus でなければ何もしない（同時に呼ばれても始まる対局は1つ）。
 */
export async function startGameForRoom(
  roomId: string,
  expectedStatus: "waiting" | "finished",
): Promise<string | null> {
  const admin = createAdminClient();
  const { data: members, error } = await admin
    .from("room_members")
    .select("user_id")
    .eq("room_id", roomId);
  if (error) throw new Error("ルームのメンバーを取得できませんでした");
  if (members.length !== 3) return null;

  const playerIds = shuffled(
    members.map((member) => member.user_id),
    randomInt,
  );
  const { table, events } = startTable({ seed: newSeed() });
  const { data: gameId, error: startError } = await admin.rpc("start_game", {
    p_room: roomId,
    p_expected_status: expectedStatus,
    p_player_ids: playerIds,
    p_state: toJson(table),
    p_views: toJson(viewsOf(table)),
    p_events: toJson(events),
  });
  if (startError) throw new Error("対局を始められませんでした");
  return gameId;
}

export type SubmitError =
  | "notFound"
  /** 対局が終わっている */
  | "finished"
  /** 見ていた版番号が古い。画面データを取り直せば続けられる。 */
  | "stale"
  /** 操作の形がおかしい */
  | "invalid"
  /** いまはできない操作 */
  | "illegal";

export type SubmitResult =
  | { ok: true; version: number; view: PlayerView }
  | { ok: false; error: SubmitError };

/**
 * 操作を受け付ける。状態の読込、検証、適用、保存を行い、本人の新しい画面データを返す。
 * クライアントが送るのは「何をしたいか」だけで、結果はここで決まる。
 */
export async function submitAction(params: {
  gameId: string;
  userId: string;
  version: unknown;
  action: unknown;
}): Promise<SubmitResult> {
  const { gameId, userId } = params;
  const admin = createAdminClient();
  const [game, secret] = await Promise.all([
    admin
      .from("games")
      .select("status, version, player_ids")
      .eq("id", gameId)
      .maybeSingle(),
    admin
      .from("game_secrets")
      .select("state")
      .eq("game_id", gameId)
      .maybeSingle(),
  ]);
  if (game.error || secret.error) {
    throw new Error("対局を読み込めませんでした");
  }
  // 参加者以外には、対局があるかどうかも教えない
  const seat = game.data?.player_ids.indexOf(userId) ?? -1;
  if (!game.data || !secret.data || seat < 0) {
    return { ok: false, error: "notFound" };
  }
  if (game.data.status !== "playing") return { ok: false, error: "finished" };
  if (params.version !== game.data.version) {
    return { ok: false, error: "stale" };
  }

  const action = parseAction(params.action, seat as Seat);
  if (!action) return { ok: false, error: "invalid" };

  const before = secret.data.state as unknown as TableState;
  let step;
  try {
    step = applyTableAction(before, action, newSeed);
  } catch (error) {
    if (error instanceof IllegalActionError) {
      return { ok: false, error: "illegal" };
    }
    throw error;
  }

  const { table, events } = step;
  const views = viewsOf(table);
  const result = table.game.result;
  const results =
    result &&
    SEATS.map((s) => ({
      rank: result.ranking.indexOf(s) + 1,
      points: result.points[s],
      score: result.payout[s],
      chips: result.chips[s],
    }));

  const { data: saved, error } = await admin.rpc("save_game", {
    p_game: gameId,
    p_expected_version: game.data.version,
    p_state: toJson(table),
    p_views: toJson(views),
    p_events: toJson(events),
    ...(results && { p_results: toJson(results) }),
  });
  if (error) throw new Error("対局を保存できませんでした");
  // 読み込んでから保存するまでの間に、ほかの操作が先に保存された
  if (!saved) return { ok: false, error: "stale" };

  return { ok: true, version: game.data.version + 1, view: views[seat]! };
}
