import { describe, expect, it } from "vitest";
import { settleWin, winPoints } from "./score";

/** [翻, 子ロン, 子ツモの子払い, 子ツモの親払い, 親ロン, 親ツモ] 仕様書の点数表そのまま */
const TABLE = [
  [1, 1000, 1000, 1000, 2000, 1000],
  [2, 2000, 1000, 1000, 4000, 2000],
  [3, 4000, 1000, 3000, 6000, 3000],
  [4, 8000, 3000, 5000, 12000, 6000],
  [5, 8000, 3000, 5000, 12000, 6000],
  [6, 12000, 4000, 8000, 18000, 9000],
  [7, 12000, 4000, 8000, 18000, 9000],
  [8, 16000, 6000, 10000, 24000, 12000],
  [9, 16000, 6000, 10000, 24000, 12000],
  [10, 16000, 6000, 10000, 24000, 12000],
  [11, 24000, 8000, 16000, 36000, 18000],
  [12, 24000, 8000, 16000, 36000, 18000],
  [13, 32000, 12000, 20000, 48000, 24000],
  [20, 32000, 12000, 20000, 48000, 24000],
] as const;

describe("winPoints（点数表）", () => {
  it.each(TABLE)(
    "%d翻：子ロン%d、子ツモ%d/%d、親ロン%d、親ツモ%dオール",
    (han, childRon, fromChild, fromDealer, dealerRon, dealerTsumo) => {
      expect(winPoints({ han, yakuman: 0, isDealer: false })).toEqual({
        ron: childRon,
        tsumoFromChild: fromChild,
        tsumoFromDealer: fromDealer,
      });
      expect(winPoints({ han, yakuman: 0, isDealer: true })).toEqual({
        ron: dealerRon,
        tsumoFromChild: dealerTsumo,
        tsumoFromDealer: 0,
      });
    },
  );

  it("役満", () => {
    expect(winPoints({ han: 13, yakuman: 1, isDealer: false })).toEqual({
      ron: 32000,
      tsumoFromChild: 12000,
      tsumoFromDealer: 20000,
    });
    expect(winPoints({ han: 13, yakuman: 1, isDealer: true }).ron).toBe(48000);
  });

  it("ダブル役満は2倍", () => {
    expect(winPoints({ han: 26, yakuman: 2, isDealer: false })).toEqual({
      ron: 64000,
      tsumoFromChild: 24000,
      tsumoFromDealer: 40000,
    });
    expect(winPoints({ han: 26, yakuman: 2, isDealer: true })).toEqual({
      ron: 96000,
      tsumoFromChild: 48000,
      tsumoFromDealer: 0,
    });
  });

  it("0翻以下は例外", () => {
    expect(() => winPoints({ han: 0, yakuman: 0, isDealer: false })).toThrow();
  });
});

describe("settleWin（点棒の移動）", () => {
  const base = { dealer: 0, yakuman: 0, honba: 0, kyotaku: 0 } as const;

  it("子のロンは放銃者が全額払う", () => {
    expect(settleWin({ ...base, winner: 1, loser: 2, han: 3 })).toEqual([
      0, 4000, -4000,
    ]);
  });

  it("親のロン", () => {
    expect(settleWin({ ...base, winner: 0, loser: 1, han: 3 })).toEqual([
      6000, -6000, 0,
    ]);
  });

  it("子のツモは親と子で支払いが違う", () => {
    expect(settleWin({ ...base, winner: 1, loser: null, han: 4 })).toEqual([
      -5000, 8000, -3000,
    ]);
  });

  it("親のツモは2人が同額を払う", () => {
    expect(settleWin({ ...base, winner: 0, loser: null, han: 6 })).toEqual([
      18000, -9000, -9000,
    ]);
  });

  it("親が席0でなくても親払いは親に付く", () => {
    expect(
      settleWin({ ...base, dealer: 2, winner: 0, loser: null, han: 4 }),
    ).toEqual([8000, -3000, -5000]);
  });

  it("本場：ロンは放銃者が1本につき1000点", () => {
    expect(
      settleWin({ ...base, winner: 1, loser: 2, han: 1, honba: 2 }),
    ).toEqual([0, 3000, -3000]);
  });

  it("本場：ツモは2人がそれぞれ1本につき1000点", () => {
    expect(
      settleWin({ ...base, winner: 1, loser: null, han: 4, honba: 2 }),
    ).toEqual([-7000, 12000, -5000]);
  });

  it("供託は和了者が取る", () => {
    expect(
      settleWin({ ...base, winner: 1, loser: 2, han: 1, kyotaku: 6000 }),
    ).toEqual([0, 7000, -1000]);
  });

  it("役満のツモ", () => {
    expect(
      settleWin({ ...base, winner: 2, loser: null, han: 13, yakuman: 1 }),
    ).toEqual([-20000, -12000, 32000]);
  });

  it("自分自身への放銃は例外", () => {
    expect(() => settleWin({ ...base, winner: 1, loser: 1, han: 1 })).toThrow();
  });
});
