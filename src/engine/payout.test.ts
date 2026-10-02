import { describe, expect, it } from "vitest";
import { finalPayout, rankSeats } from "./payout";

describe("rankSeats（順位）", () => {
  it("持ち点の高い順", () => {
    expect(rankSeats([20000, 50000, 20000], 0)).toEqual([1, 0, 2]);
    expect(rankSeats([10000, 30000, 50000], 0)).toEqual([2, 1, 0]);
  });

  it("同点は起家に近い方が上位", () => {
    expect(rankSeats([30000, 30000, 30000], 0)).toEqual([0, 1, 2]);
    expect(rankSeats([30000, 30000, 30000], 1)).toEqual([1, 2, 0]);
    expect(rankSeats([40000, 25000, 25000], 2)).toEqual([0, 2, 1]);
  });
});

describe("finalPayout（支払い表）", () => {
  /** 仕様書の支払い表そのまま。[下限, 上限, 2着, 3着（2着30000未満）, 3着（2着30000以上）] */
  const LOSING_ROWS = [
    [25000, 29000, -11, -21, -26],
    [20000, 24000, -13, -23, -28],
    [15000, 19000, -15, -25, -30],
    [10000, 14000, -18, -28, -33],
    [5000, 9000, -20, -30, -35],
    [0, 4000, -23, -33, -38],
  ] as const;

  it.each([
    [40000, 8],
    [44000, 8],
    [35000, 5],
    [39000, 5],
    [30000, 2],
    [34000, 2],
  ])("2着が%d点なら＋%d", (points, expected) => {
    expect(finalPayout([90000, points, 0], 0)[1]).toBe(expected);
  });

  it.each(LOSING_ROWS)("2着が%d〜%d点なら%d", (low, high, second) => {
    expect(finalPayout([90000, low, -50000], 0)[1]).toBe(second);
    expect(finalPayout([90000, high, -50000], 0)[1]).toBe(second);
  });

  it.each(LOSING_ROWS)(
    "3着が%d〜%d点で2着が30000未満の行",
    (low, high, _second, third) => {
      expect(finalPayout([90000, 29000, low], 0)[2]).toBe(third);
      expect(finalPayout([90000, 29000, high], 0)[2]).toBe(third);
    },
  );

  it.each(LOSING_ROWS)(
    "3着が%d〜%d点で2着が30000以上の行",
    (low, high, _second, _third, third) => {
      expect(finalPayout([90000, 30000, low], 0)[2]).toBe(third);
      expect(finalPayout([90000, 30000, high], 0)[2]).toBe(third);
    },
  );

  it("1着は2着と3着の合計の符号を反転した枚数を受け取る", () => {
    expect(finalPayout([45000, 40000, 5000], 0)).toEqual([27, 8, -35]);
    expect(finalPayout([15000, 50000, 25000], 0)).toEqual([-25, 36, -11]);
  });

  it("マイナスの持ち点は0〜4000の行を使う", () => {
    expect(finalPayout([70000, 28000, -8000], 0)).toEqual([44, -11, -33]);
  });

  it("1000点未満の端数は切り上げて行を決める", () => {
    expect(finalPayout([90000, 24500, 0], 0)[1]).toBe(-11);
    expect(finalPayout([90000, 29500, 0], 0)[1]).toBe(2);
    expect(finalPayout([90000, 29500, 24001], 0)[2]).toBe(-26);
  });

  it("同点の順位は起家に近い方が上位として計算する", () => {
    expect(finalPayout([35000, 35000, 20000], 0)).toEqual([23, 5, -28]);
    expect(finalPayout([35000, 35000, 20000], 1)).toEqual([5, 23, -28]);
  });

  it("3着が30000点以上になることはない（3人同点はサドンデス）", () => {
    expect(() => finalPayout([30000, 30000, 30000], 0)).toThrow();
  });
});
