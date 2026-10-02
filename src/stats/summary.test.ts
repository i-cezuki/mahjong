import { describe, expect, it } from "vitest";
import { addResult, addStats, emptyTotals, ratio } from "./summary";
import { emptyStats } from "./types";

describe("ratio（割り算）", () => {
  it("0で割るときは null", () => {
    expect(ratio(3, 0)).toBeNull();
    expect(ratio(1, 4)).toBe(0.25);
  });
});

describe("addStats（集計値の足し合わせ）", () => {
  it("項目ごとに足す。元の値は書き換えない", () => {
    const a = { ...emptyStats(), rounds: 10, wins: 3, diceChips: -70 };
    const b = { ...emptyStats(), rounds: 8, wins: 1, diceChips: 140 };
    expect(addStats(a, b)).toMatchObject({
      rounds: 18,
      wins: 4,
      diceChips: 70,
    });
    expect(a.rounds).toBe(10);
  });

  it("古い版の集計値にない項目は0として足す", () => {
    const a = { ...emptyStats(), rounds: 10 };
    expect(addStats(a, { rounds: 5 })).toMatchObject({ rounds: 15, wins: 0 });
  });
});

describe("addResult（半荘の結果の足し合わせ）", () => {
  it("順位、スコア、祝儀、持ち点を足す", () => {
    let totals = emptyTotals();
    totals = addResult(totals, { rank: 1, points: 52000, score: 40, chips: 5 });
    totals = addResult(totals, {
      rank: 3,
      points: 8000,
      score: -30,
      chips: -2,
    });
    expect(totals).toMatchObject({
      games: 2,
      rankSum: 4,
      rankCounts: [1, 0, 1],
      score: 10,
      chips: 3,
      points: 60000,
    });
  });
});
