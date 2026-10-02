import { describe, expect, it } from "vitest";
import type { MeldState } from "@/engine";
import { meldTiles } from "./melds";

/** 表示の形だけを取り出す。S=横向き、B=裏向き、数字=牌ID */
const shape = (meld: MeldState, seat: 0 | 1 | 2) =>
  meldTiles(meld, seat).map((t) =>
    t.back ? "B" : t.sideways ? `S${t.tile}` : `${t.tile}`,
  );

describe("meldTiles（副露の並べ方）", () => {
  // エンジンの並び：ポンは [手牌, 手牌, 鳴いた牌]
  const pon = (from: 0 | 1 | 2): MeldState => ({
    type: "pon",
    tiles: [10, 11, 12],
    from,
  });

  it("下家（右の人）から鳴いた牌は、右端に横向きで置く", () => {
    // 席0の下家は席1
    expect(shape(pon(1), 0)).toEqual(["10", "11", "S12"]);
    expect(shape(pon(0), 2)).toEqual(["10", "11", "S12"]);
  });

  it("上家（左の人）から鳴いた牌は、左端に横向きで置く", () => {
    // 席0の上家は席2
    expect(shape(pon(2), 0)).toEqual(["S12", "10", "11"]);
    expect(shape(pon(0), 1)).toEqual(["S12", "10", "11"]);
  });

  it("大明槓は [手牌×3, 鳴いた牌]。鳴いた1枚を相手の側に置く", () => {
    const minkan = (from: 0 | 1 | 2): MeldState => ({
      type: "minkan",
      tiles: [10, 11, 12, 13],
      from,
    });
    expect(shape(minkan(1), 0)).toEqual(["10", "11", "12", "S13"]);
    expect(shape(minkan(2), 0)).toEqual(["S13", "10", "11", "12"]);
  });

  it("加槓は [手牌, 手牌, 鳴いた牌, 加えた牌]。鳴いた牌と加えた牌を並べて相手の側に置く", () => {
    const kakan = (from: 0 | 1 | 2): MeldState => ({
      type: "kakan",
      tiles: [10, 11, 12, 13],
      from,
    });
    expect(shape(kakan(1), 0)).toEqual(["10", "11", "S12", "S13"]);
    expect(shape(kakan(2), 0)).toEqual(["S12", "S13", "10", "11"]);
  });

  it("暗槓は両端を裏向きにする。横向きの牌はない", () => {
    const ankan: MeldState = {
      type: "ankan",
      tiles: [10, 11, 12, 13],
      from: null,
    };
    expect(shape(ankan, 0)).toEqual(["B", "11", "12", "B"]);
  });
});
