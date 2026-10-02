import { describe, expect, it } from "vitest";
import { flowerStage } from "./flowers";

// 手牌 [1, 2, 3] に補充牌 9 を引いた状態。抜いた花牌は 108、109 の順。
const hand = [1, 2, 3, 9];

describe("flowerStage", () => {
  it("見せ終わっていれば、届いた画面データのまま出す", () => {
    expect(flowerStage(hand, 9, [108], 1)).toEqual({
      hand,
      drawn: 9,
      flowers: [108],
      staging: false,
    });
  });

  it("まだ見せていない花牌は、ツモ牌の位置に出して補充牌を隠す", () => {
    expect(flowerStage(hand, 9, [108], 0)).toEqual({
      hand: [1, 2, 3, 108],
      drawn: 108,
      flowers: [],
      staging: true,
    });
  });

  it("続けて抜いたときは1枚ずつ見せる", () => {
    expect(flowerStage(hand, 9, [108, 109], 1)).toEqual({
      hand: [1, 2, 3, 109],
      drawn: 109,
      flowers: [108],
      staging: true,
    });
  });

  it("ツモ牌がないときは見せる段階を作らない", () => {
    expect(flowerStage([1, 2, 3], null, [108], 0)).toEqual({
      hand: [1, 2, 3],
      drawn: null,
      flowers: [108],
      staging: false,
    });
  });
});
