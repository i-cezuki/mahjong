import { STAT_KEYS, emptyStats } from "./types";
import type { GameStats } from "./types";

/** 1人分の通算。半荘ごとの結果（game_results）と、局ごとの集計値（game_stats）を足したもの。 */
export interface PlayerTotals {
  /** 終わった半荘の数 */
  games: number;
  rankSum: number;
  /** 1位、2位、3位の回数 */
  rankCounts: [number, number, number];
  score: number;
  chips: number;
  /** 最終持ち点の合計 */
  points: number;
  stats: GameStats;
}

export function emptyTotals(): PlayerTotals {
  return {
    games: 0,
    rankSum: 0,
    rankCounts: [0, 0, 0],
    score: 0,
    chips: 0,
    points: 0,
    stats: emptyStats(),
  };
}

/** 0で割るときは null（画面では「—」）。 */
export function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

/** 集計値を項目ごとに足す。古い版で計算した集計値にない項目は0として扱う。 */
export function addStats(a: GameStats, b: Partial<GameStats>): GameStats {
  const sum = { ...a };
  for (const key of STAT_KEYS) sum[key] += b[key] ?? 0;
  return sum;
}

/** 半荘1回の結果を足す。 */
export function addResult(
  totals: PlayerTotals,
  result: { rank: number; points: number; score: number; chips: number },
): PlayerTotals {
  const rankCounts: [number, number, number] = [...totals.rankCounts];
  if (result.rank >= 1 && result.rank <= 3) {
    rankCounts[(result.rank - 1) as 0 | 1 | 2]++;
  }
  return {
    ...totals,
    games: totals.games + 1,
    rankSum: totals.rankSum + result.rank,
    rankCounts,
    score: totals.score + result.score,
    chips: totals.chips + result.chips,
    points: totals.points + result.points,
  };
}
