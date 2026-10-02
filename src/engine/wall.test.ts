import { describe, expect, it } from "vitest";
import { deckWithSwaps, range, seedOf } from "./testing";
import { dealFromDeck, shuffledDeck } from "./wall";

describe("shuffledDeck", () => {
  it("112枚すべてを1枚ずつ含む", () => {
    const deck = shuffledDeck(seedOf(1));
    expect([...deck].sort((a, b) => a - b)).toEqual(range(0, 112));
  });

  it("同じ種なら同じ山、違う種なら違う山", () => {
    expect(shuffledDeck(seedOf(1))).toEqual(shuffledDeck(seedOf(1)));
    expect(shuffledDeck(seedOf(1))).not.toEqual(shuffledDeck(seedOf(2)));
  });
});

describe("dealFromDeck", () => {
  it("親から順に13枚ずつ配る", () => {
    const { hands } = dealFromDeck(deckWithSwaps(), 0);
    expect(hands).toEqual([range(0, 13), range(13, 26), range(26, 39)]);
  });

  it("親が席1なら席1から配る", () => {
    const { hands } = dealFromDeck(deckWithSwaps(), 1);
    expect(hands).toEqual([range(26, 39), range(0, 13), range(13, 26)]);
  });

  it("ツモ山63枚、嶺上牌8枚、ドラ表示牌と裏ドラ表示牌が1枚ずつ", () => {
    const { wall } = dealFromDeck(deckWithSwaps(), 0);
    expect(wall).toEqual({
      live: range(39, 102),
      rinshan: range(102, 110),
      doraIndicators: [110],
      uraIndicators: [111],
    });
  });

  it("112枚がそろっていない山は拒否する", () => {
    expect(() => dealFromDeck(range(0, 111), 0)).toThrow();
    expect(() => dealFromDeck([...range(0, 111), 0], 0)).toThrow();
  });
});
