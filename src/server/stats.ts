import "server-only";

import { analyzeGame } from "@/stats/analyze";
import type { StatsEvent } from "@/stats/analyze";
import { addResult, addStats, emptyTotals } from "@/stats/summary";
import type { PlayerTotals } from "@/stats/summary";
import { STATS_VERSION } from "@/stats/types";
import type { GameStats } from "@/stats/types";
import type { Json } from "./database.types";
import { createAdminClient, createSessionClient } from "./supabase";

/** PostgREST が1回に返す行数の上限（supabase/config.toml の max_rows） */
const PAGE = 1000;

/** 全部の行を読む。1回に1000行までしか返らないので、なくなるまで繰り返す。 */
async function readAll<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error || !data) throw new Error("読み込めませんでした");
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

/**
 * 終わった対局の牌譜から集計値を計算して保存する。保存できたら true。
 * 終局していない対局は false。牌譜が壊れていれば例外。
 */
export async function recordGameStats(gameId: string): Promise<boolean> {
  const admin = createAdminClient();
  const rows = await readAll((from, to) =>
    admin
      .from("game_events")
      .select("event")
      .eq("game_id", gameId)
      .order("seq")
      .range(from, to),
  );
  const stats = analyzeGame(
    rows.map((row) => row.event as unknown as StatsEvent),
  );
  const { data, error } = await admin.rpc("save_game_stats", {
    p_game: gameId,
    p_version: STATS_VERSION,
    p_stats: stats as unknown as Json,
  });
  if (error) throw new Error("集計値を保存できませんでした");
  return data ?? false;
}

/**
 * 集計値がない、または古い版で計算した対局を計算する。定期実行から呼ぶ。
 * 1つの対局で失敗しても、ほかの対局は続ける。
 */
export async function refreshGameStats(
  limit = 50,
): Promise<{ computed: number; failed: number }> {
  const { data, error } = await createAdminClient().rpc("games_needing_stats", {
    p_version: STATS_VERSION,
    p_limit: limit,
  });
  if (error) throw new Error("集計の必要な対局を取得できませんでした");

  let computed = 0;
  let failed = 0;
  for (const gameId of data ?? []) {
    try {
      if (await recordGameStats(gameId)) computed++;
      else failed++;
    } catch {
      failed++;
    }
  }
  return { computed, failed };
}

export interface Standing {
  playerId: string;
  name: string;
  totals: PlayerTotals;
}

/**
 * 全員の通算成績。ログイン中のユーザーとして読む（承認済みなら全員分が読める）。
 * 対局数の多い順。1半荘も終えていない人は入れない。
 */
export async function loadStandings(): Promise<Standing[]> {
  const supabase = await createSessionClient();
  const [results, stats, profiles] = await Promise.all([
    readAll((from, to) =>
      supabase
        .from("game_results")
        .select("player_id, rank, points, score, chips")
        .order("game_id")
        .order("player_id")
        .range(from, to),
    ),
    readAll((from, to) =>
      supabase
        .from("game_stats")
        .select("player_id, stats")
        .order("game_id")
        .order("player_id")
        .range(from, to),
    ),
    supabase.from("profiles").select("id, display_name"),
  ]);

  const totals = new Map<string, PlayerTotals>();
  for (const row of results) {
    totals.set(
      row.player_id,
      addResult(totals.get(row.player_id) ?? emptyTotals(), row),
    );
  }
  for (const row of stats) {
    const mine = totals.get(row.player_id);
    if (!mine) continue;
    totals.set(row.player_id, {
      ...mine,
      stats: addStats(mine.stats, row.stats as unknown as Partial<GameStats>),
    });
  }

  const names = new Map(
    (profiles.data ?? []).map((profile) => [profile.id, profile.display_name]),
  );
  return [...totals]
    .map(([playerId, value]) => ({
      playerId,
      name: names.get(playerId) ?? "（不明）",
      totals: value,
    }))
    .sort(
      (a, b) =>
        b.totals.games - a.totals.games || a.name.localeCompare(b.name, "ja"),
    );
}

export interface HistoryGame {
  gameId: string;
  /** 終わった時刻（ISO 8601） */
  finishedAt: string;
  /** 順位の順 */
  players: {
    playerId: string;
    name: string;
    rank: number;
    points: number;
    score: number;
    chips: number;
  }[];
}

/** 終わった対局を新しい順に limit 件。続きがあれば hasMore。 */
export async function loadHistory(
  limit: number,
): Promise<{ games: HistoryGame[]; hasMore: boolean }> {
  const supabase = await createSessionClient();
  // 1対局は3行で、同じ時刻に書かれる。続きがあるかを知るために1行多く読む
  const [results, profiles] = await Promise.all([
    supabase
      .from("game_results")
      .select("game_id, player_id, rank, points, score, chips, created_at")
      .order("created_at", { ascending: false })
      .order("game_id")
      .order("rank")
      .range(0, limit * 3),
    supabase.from("profiles").select("id, display_name"),
  ]);
  if (results.error) throw new Error("対局履歴を読み込めませんでした");

  const names = new Map(
    (profiles.data ?? []).map((profile) => [profile.id, profile.display_name]),
  );
  const games = new Map<string, HistoryGame>();
  for (const row of results.data.slice(0, limit * 3)) {
    const game = games.get(row.game_id) ?? {
      gameId: row.game_id,
      finishedAt: row.created_at,
      players: [],
    };
    game.players.push({
      playerId: row.player_id,
      name: names.get(row.player_id) ?? "（不明）",
      rank: row.rank,
      points: row.points,
      score: row.score,
      chips: row.chips,
    });
    games.set(row.game_id, game);
  }
  return {
    games: [...games.values()],
    hasMore: results.data.length > limit * 3,
  };
}
