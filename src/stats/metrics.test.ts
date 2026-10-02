import { describe, expect, it } from "vitest";
import { METRICS, METRIC_GROUPS, formatMetric } from "./metrics";
import { emptyTotals } from "./summary";
import type { PlayerTotals } from "./summary";
import { emptyStats } from "./types";

const metric = (key: string) => {
  const found = METRICS.find((m) => m.key === key);
  if (!found) throw new Error(`項目がありません: ${key}`);
  return found;
};

const totals: PlayerTotals = {
  games: 4,
  rankSum: 7,
  rankCounts: [2, 1, 1],
  score: 35,
  chips: -6,
  points: 130000,
  stats: {
    ...emptyStats(),
    rounds: 40,
    wins: 10,
    tsumoWins: 4,
    winPoints: 80000,
    winTurns: 95,
    dealIns: 5,
    dealInPoints: 40000,
    dealInShanten: 6,
    dealInTenpai: 1,
    dealInOneAway: 2,
    dealInFar: 2,
    dealInToRiichi: 3,
    dealInWhileRiichi: 1,
    dealInWhileOpen: 2,
    riichi: 8,
    riichiGood: 6,
    riichiWins: 4,
    riichiIppatsu: 1,
    riichiUra: 2,
    riichiTurns: 56,
    riichiChase: 2,
    doubleStake: 2,
    doubleStakeWins: 1,
    callRounds: 12,
    draws: 6,
    drawTenpai: 3,
  },
};

describe("METRICS（画面に出す項目）", () => {
  it("キーは重複せず、分類はどれかに入る", () => {
    expect(new Set(METRICS.map((m) => m.key)).size).toBe(METRICS.length);
    for (const m of METRICS) expect(METRIC_GROUPS).toContain(m.group);
  });

  it("率と平均を、仕様の分母で計算する", () => {
    const value = (key: string) => metric(key).value(totals);
    expect(value("avgRank")).toBe(1.75);
    expect(value("firstRate")).toBe(0.5);
    expect(value("avgPoints")).toBe(32500);
    expect(value("winRate")).toBe(0.25);
    expect(value("dealInRate")).toBe(0.125);
    expect(value("riichiRate")).toBe(0.2);
    expect(value("callRate")).toBe(0.3);
    expect(value("tsumoRate")).toBe(0.4);
    expect(value("drawTenpaiRate")).toBe(0.5);
    expect(value("avgWinPoints")).toBe(8000);
    expect(value("avgDealInPoints")).toBe(8000);
    expect(value("avgWinTurn")).toBe(9.5);
    expect(value("riichiGoodRate")).toBe(0.75);
    expect(value("riichiBadRate")).toBe(0.25);
    expect(value("riichiWinRate")).toBe(0.5);
    // リーチ後放銃率はリーチした局で割る
    expect(value("riichiDealInRate")).toBe(0.125);
    // 一発率と裏ドラ率はリーチして和了した局で割る
    expect(value("ippatsuRate")).toBe(0.25);
    expect(value("uraRate")).toBe(0.5);
    expect(value("avgRiichiTurn")).toBe(7);
    expect(value("chaseRate")).toBe(0.25);
    expect(value("doubleStakeWinRate")).toBe(0.5);
    expect(value("avgDealInShanten")).toBe(1.2);
    expect(value("dealInTenpaiRate")).toBe(0.2);
    expect(value("dealInToRiichiRate")).toBe(0.6);
  });

  it("割る数が0なら null", () => {
    const empty = emptyTotals();
    for (const m of METRICS) {
      if (
        m.format === "percent" ||
        m.format === "decimal" ||
        m.format === "round"
      ) {
        expect(m.value(empty)).toBeNull();
      }
    }
  });
});

describe("formatMetric（書式）", () => {
  it("値がなければ —", () => {
    expect(formatMetric("percent", null)).toBe("—");
  });

  it("書式ごとに整える", () => {
    expect(formatMetric("count", 12)).toBe("12");
    expect(formatMetric("signed", 35)).toBe("+35");
    expect(formatMetric("signed", -6)).toBe("-6");
    expect(formatMetric("signed", 0)).toBe("0");
    expect(formatMetric("percent", 0.125)).toBe("12.5%");
    expect(formatMetric("decimal", 1.75)).toBe("1.75");
    expect(formatMetric("round", 8123.4)).toBe("8123");
  });
});
