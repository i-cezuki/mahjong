import { describe, expect, it } from "vitest";
import { ALL_TILES, plainTileOf } from "@/engine";
import type { TileId, TileKind, TileVariant } from "@/engine";
import { winHand } from "./win-hand";

/** 種類と見た目で牌を探す。同じものが複数あれば n 枚目 */
function id(kind: TileKind, variant: TileVariant = "normal", n = 0): TileId {
  const tiles = ALL_TILES.filter(
    (t) => t.kind === kind && t.variant === variant,
  );
  return tiles[n]!.id;
}

describe("winHand（和了した手牌の並べ方）", () => {
  it("ツモとロンは、和了牌を手牌から外して右に置く", () => {
    const hand = [id("1p"), id("2p"), id("3p")];
    expect(winHand(hand, "tsumo", id("3p"))).toEqual({
      hand: [id("1p"), id("2p")],
      pocchi: null,
      winTile: id("3p"),
    });
  });

  it("ポッチは、引いたポッチを手牌から外し、高め取りした牌と並べる", () => {
    const hand = [id("2p"), id("3p"), id("5z"), id("5z", "pocchi")];
    expect(winHand(hand, "pocchi", plainTileOf("1p"))).toEqual({
      hand: [id("2p"), id("3p"), id("5z")],
      pocchi: id("5z", "pocchi"),
      winTile: plainTileOf("1p"),
    });
  });

  it("逆ポッチは逆ポッチの白を外し、手牌のポッチの白は残す", () => {
    const pocchi = id("5z", "pocchi");
    const reverse = id("5z", "reversePocchi");
    const hand = [id("2p"), pocchi, reverse];
    expect(winHand(hand, "reversePocchi", plainTileOf("1p"))).toEqual({
      hand: [id("2p"), pocchi],
      pocchi: reverse,
      winTile: plainTileOf("1p"),
    });
  });

  it("高め取りした牌と同じ番号の牌が手牌にあっても、手牌から消さない", () => {
    // 1索と白のシャンポンを1索で高め取り。普通の1索の番号は手牌の1索と同じ
    const hand = [
      plainTileOf("1s"),
      id("1s", "normal", 1),
      id("5z"),
      id("5z", "normal", 1),
      id("5z", "pocchi"),
    ];
    const shown = winHand(hand, "pocchi", plainTileOf("1s"));
    expect(shown.hand).toEqual(hand.slice(0, 4));
    expect(shown.pocchi).toBe(id("5z", "pocchi"));
  });

  it("和了牌がなければ（流局のテンパイ、流し役満）手牌をそのまま出す", () => {
    const hand = [id("1p"), id("2p")];
    expect(winHand(hand, null, null)).toEqual({
      hand,
      pocchi: null,
      winTile: null,
    });
  });
});
