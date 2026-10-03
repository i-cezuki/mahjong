import "server-only";

import { randomBytes, randomInt } from "node:crypto";
import { IllegalActionError, SEATS } from "@/engine";
import type { PerSeat, Seat } from "@/engine";
import {
  DRAW_HOLD_MAX_MS,
  DRAW_HOLD_MIN_MS,
  DRAW_HOLD_PERCENT,
} from "@/lib/timing";
import type { Json } from "./database.types";
import { applyTimed, applyTimeout, startClock } from "./clock";
import type { ClockContext, TimedStep } from "./clock";
import { shuffled } from "./room-rules";
import { createAdminClient } from "./supabase";
import { buildView, parseAction, startTable } from "./table";
import type { PlayerView, TableState } from "./table";

/** 局ごとの乱数の種。暗号学的乱数から作る。 */
function newSeed(): string {
  return randomBytes(32).toString("hex");
}

/** サーバーの現在時刻。期限はすべてこの時計で決める。 */
export function serverNow(): number {
  return Date.now();
}

function clockContext(): ClockContext {
  return {
    now: serverNow(),
    nextSeed: newSeed,
    pick: (count) => randomInt(count),
    drawHold: () =>
      randomInt(100) < DRAW_HOLD_PERCENT
        ? randomInt(DRAW_HOLD_MIN_MS, DRAW_HOLD_MAX_MS + 1)
        : 0,
  };
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
  const started = startTable({ seed: newSeed() });
  const table = startClock(started.table, serverNow());
  const { events } = started;
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
  /** いまはできない操作。期限前の時間切れの申告もこれ */
  | "illegal";

export type SubmitResult =
  | { ok: true; version: number; view: PlayerView }
  | { ok: false; error: SubmitError };

type Loaded =
  | { ok: true; seat: Seat; version: number; table: TableState }
  | { ok: false; error: SubmitError };

/** 対局の状態を読む。参加者以外には、対局があるかどうかも教えない。 */
async function loadGame(gameId: string, userId: string): Promise<Loaded> {
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
  const seat = game.data?.player_ids.indexOf(userId) ?? -1;
  if (!game.data || !secret.data || seat < 0) {
    return { ok: false, error: "notFound" };
  }
  if (game.data.status !== "playing") return { ok: false, error: "finished" };
  return {
    ok: true,
    seat: seat as Seat,
    version: game.data.version,
    table: secret.data.state as unknown as TableState,
  };
}

/**
 * 状態を進めて保存し、本人の新しい画面データを返す。
 * 進め方（操作か時間切れか）は呼び出す側が渡す。どちらも時計（clock.ts）を通る。
 */
async function advance(
  gameId: string,
  loaded: Extract<Loaded, { ok: true }>,
  apply: (ctx: ClockContext) => TimedStep,
): Promise<SubmitResult> {
  let step;
  try {
    step = apply(clockContext());
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

  const { data: saved, error } = await createAdminClient().rpc("save_game", {
    p_game: gameId,
    p_expected_version: loaded.version,
    p_state: toJson(table),
    p_views: toJson(views),
    p_events: toJson(events),
    ...(results && { p_results: toJson(results) }),
  });
  if (error) throw new Error("対局を保存できませんでした");
  // 読み込んでから保存するまでの間に、ほかの操作が先に保存された
  if (!saved) return { ok: false, error: "stale" };

  return { ok: true, version: loaded.version + 1, view: views[loaded.seat] };
}

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
  const loaded = await loadGame(params.gameId, params.userId);
  if (!loaded.ok) return loaded;
  if (params.version !== loaded.version) return { ok: false, error: "stale" };

  const action = parseAction(params.action, loaded.seat);
  if (!action) return { ok: false, error: "invalid" };
  return advance(params.gameId, loaded, (ctx) =>
    applyTimed(loaded.table, action, ctx),
  );
}

/**
 * 時間切れの申告を受け付ける。参加者なら誰でも送れる。
 * 期限はサーバーの時計で確かめるので、申告で早く進めることはできない（期限前は illegal）。
 */
export async function submitTick(params: {
  gameId: string;
  userId: string;
  version: unknown;
}): Promise<SubmitResult> {
  const loaded = await loadGame(params.gameId, params.userId);
  if (!loaded.ok) return loaded;
  if (params.version !== loaded.version) return { ok: false, error: "stale" };
  return advance(params.gameId, loaded, (ctx) =>
    applyTimeout(loaded.table, ctx),
  );
}

/**
 * 対局中のまま10分進んでいない対局を破棄する。破棄した数を返す。
 * @param userId 渡すと、その人が参加している対局だけを対象にする。
 */
export async function abandonStaleGames(userId?: string): Promise<number> {
  const { data, error } = await createAdminClient().rpc(
    "abandon_stale_games",
    userId ? { p_user: userId } : {},
  );
  if (error) throw new Error("放置された対局を破棄できませんでした");
  return data ?? 0;
}
