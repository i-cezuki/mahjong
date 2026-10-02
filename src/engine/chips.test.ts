import { describe, expect, it } from "vitest";
import { settleChips, winChips } from "./chips";
import type { DoraCount, WinResult } from "./yaku";

function result(
  dora: Partial<DoraCount> = {},
  rest: Partial<Omit<WinResult, "dora">> = {},
): WinResult {
  return {
    yaku: [],
    yakuman: 0,
    han: 1,
    ...rest,
    dora: { dora: 0, ura: 0, red: 0, gold: 0, flower: 0, ...dora },
  };
}

const ron = { tsumo: false, ippatsu: false, doubleStake: false } as const;

describe("winChips（支払う1人あたりの祝儀）", () => {
  it("祝儀の対象がなければ0枚", () => {
    expect(winChips({ ...ron, result: result({ dora: 3 }) })).toBe(0);
  });

  it("赤は1枚、金は2枚", () => {
    expect(winChips({ ...ron, result: result({ red: 1 }) })).toBe(1);
    expect(winChips({ ...ron, result: result({ gold: 1 }) })).toBe(2);
    expect(winChips({ ...ron, result: result({ red: 2, gold: 2 }) })).toBe(6);
  });

  it("一発は1枚", () => {
    expect(winChips({ ...ron, ippatsu: true, result: result() })).toBe(1);
  });

  it("裏ドラは乗った枚数分", () => {
    expect(winChips({ ...ron, result: result({ ura: 3 }) })).toBe(3);
  });

  it("抜いた花牌そのものには付かない", () => {
    expect(winChips({ ...ron, result: result({ flower: 4 }) })).toBe(0);
  });

  it("裏ドラ表示牌が花牌で、抜いた花牌に裏ドラが乗れば枚数分付く", () => {
    expect(winChips({ ...ron, result: result({ flower: 2, ura: 2 }) })).toBe(2);
  });

  it("役満はロン20枚、ツモ10枚ずつ", () => {
    const yakuman = result({}, { yakuman: 1, han: 13 });
    expect(winChips({ ...ron, result: yakuman })).toBe(20);
    expect(winChips({ ...ron, tsumo: true, result: yakuman })).toBe(10);
  });

  it("ダブル役満は役満祝儀も2倍", () => {
    const double = result({}, { yakuman: 2, han: 26 });
    expect(winChips({ ...ron, result: double })).toBe(40);
    expect(winChips({ ...ron, tsumo: true, result: double })).toBe(20);
  });

  it("数え役満には役満祝儀が付かない", () => {
    expect(
      winChips({ ...ron, result: result({ dora: 12 }, { han: 14 }) }),
    ).toBe(0);
  });

  it("役満でも赤、金、一発、裏は加算する", () => {
    const yakuman = result(
      { red: 1, gold: 1, ura: 2 },
      { yakuman: 1, han: 13 },
    );
    expect(winChips({ ...ron, ippatsu: true, result: yakuman })).toBe(26);
  });

  it("2倍リーチは受け取る祝儀が2倍", () => {
    const hand = result({ red: 1, ura: 1 });
    expect(
      winChips({ tsumo: true, ippatsu: true, doubleStake: true, result: hand }),
    ).toBe(6);
  });
});

describe("settleChips（祝儀の移動）", () => {
  it("ロンは放銃者が払う", () => {
    expect(settleChips({ winner: 0, loser: 2, chips: 3 })).toEqual([3, 0, -3]);
  });

  it("ツモは2人がそれぞれ同じ枚数を払う", () => {
    expect(settleChips({ winner: 1, loser: null, chips: 3 })).toEqual([
      -3, 6, -3,
    ]);
  });
});
