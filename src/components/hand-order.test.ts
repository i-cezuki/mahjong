import { describe, expect, it } from "vitest";
import { displayHand } from "./hand-order";

describe("displayHand（手牌の表示順）", () => {
  it("ツモ牌を右端に置き、残りの並びは変えない", () => {
    expect(displayHand([3, 10, 20, 40, 77], 10)).toEqual([3, 20, 40, 77, 10]);
  });

  it("ツモ牌がすでに右端でもそのまま", () => {
    expect(displayHand([3, 10, 20], 20)).toEqual([3, 10, 20]);
  });

  it("ツモ牌がなければ並びを変えない", () => {
    expect(displayHand([3, 10, 20], null)).toEqual([3, 10, 20]);
  });

  it("元の配列を書き換えない", () => {
    const hand = [3, 10, 20];
    displayHand(hand, 3);
    expect(hand).toEqual([3, 10, 20]);
  });
});
