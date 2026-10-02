import { describe, expect, it } from "vitest";
import { ALL_TILES, doraKind, isFlower, sortTiles, tileOf } from "./tiles";
import type { TileKind } from "./tiles";

function countBy(predicate: (kind: TileKind) => boolean): number {
  return ALL_TILES.filter((tile) => predicate(tile.kind)).length;
}

describe("牌の構成", () => {
  it("総数は112枚で、idは0からの連番", () => {
    expect(ALL_TILES).toHaveLength(112);
    expect(ALL_TILES.map((tile) => tile.id)).toEqual(
      Array.from({ length: 112 }, (_, i) => i),
    );
  });

  it("萬子は1萬と9萬だけで8枚", () => {
    const manzu = ALL_TILES.filter((tile) => tile.kind.endsWith("m"));
    expect(manzu).toHaveLength(8);
    expect(new Set(manzu.map((tile) => tile.kind))).toEqual(
      new Set(["1m", "9m"]),
    );
  });

  it("筒子36枚、索子36枚、字牌28枚、花牌4枚", () => {
    expect(countBy((kind) => kind.endsWith("p"))).toBe(36);
    expect(countBy((kind) => kind.endsWith("s"))).toBe(36);
    expect(countBy((kind) => kind.endsWith("z"))).toBe(28);
    expect(countBy((kind) => kind.endsWith("f"))).toBe(4);
  });

  it("花牌以外はどの種類も4枚ずつ", () => {
    const counts = new Map<TileKind, number>();
    for (const tile of ALL_TILES) {
      counts.set(tile.kind, (counts.get(tile.kind) ?? 0) + 1);
    }
    expect(counts.size).toBe(2 + 9 + 9 + 7 + 1);
    expect([...counts.values()].every((count) => count === 4)).toBe(true);
  });

  it.each(["5p", "5s"] as const)("%s は赤1枚、金1枚、通常2枚", (kind) => {
    const variants = ALL_TILES.filter((tile) => tile.kind === kind)
      .map((tile) => tile.variant)
      .sort();
    expect(variants).toEqual(["gold", "normal", "normal", "red"]);
  });

  it("白はポッチ1枚、逆ポッチ1枚、通常2枚", () => {
    const variants = ALL_TILES.filter((tile) => tile.kind === "5z")
      .map((tile) => tile.variant)
      .sort();
    expect(variants).toEqual(["normal", "normal", "pocchi", "reversePocchi"]);
  });

  it("5筒、5索、白以外はすべて通常の牌", () => {
    const special = ALL_TILES.filter((tile) => tile.variant !== "normal");
    expect(special).toHaveLength(6);
    expect(new Set(special.map((tile) => tile.kind))).toEqual(
      new Set(["5p", "5s", "5z"]),
    );
  });

  it("tileOf はidから牌を引き、範囲外は例外", () => {
    expect(tileOf(0)).toEqual({ id: 0, kind: "1m", variant: "normal" });
    expect(() => tileOf(112)).toThrow();
    expect(() => tileOf(-1)).toThrow();
  });

  it("isFlower は花牌だけ true", () => {
    expect(ALL_TILES.filter((tile) => isFlower(tile.id))).toHaveLength(4);
    expect(isFlower(0)).toBe(false);
  });
});

describe("ドラ表示牌からドラを求める", () => {
  it.each<[TileKind, TileKind]>([
    ["1m", "9m"],
    ["9m", "1m"],
    ["1p", "2p"],
    ["8p", "9p"],
    ["9p", "1p"],
    ["4s", "5s"],
    ["9s", "1s"],
    ["1z", "2z"],
    ["2z", "3z"],
    ["3z", "4z"],
    ["4z", "1z"],
    ["5z", "6z"],
    ["6z", "7z"],
    ["7z", "5z"],
    ["1f", "1f"],
  ])("表示牌 %s のドラは %s", (indicator, dora) => {
    expect(doraKind(indicator)).toBe(dora);
  });
});

describe("並べ替え", () => {
  it("萬子、筒子、索子、字牌、花牌の順で、数字の小さい順", () => {
    const kinds: TileKind[] = [
      "1f",
      "7z",
      "1z",
      "9s",
      "1s",
      "9p",
      "5p",
      "9m",
      "1m",
    ];
    const ids = kinds.map((kind) => ALL_TILES.find((t) => t.kind === kind)!.id);
    const sorted = sortTiles(ids).map((id) => tileOf(id).kind);
    expect(sorted).toEqual([
      "1m",
      "9m",
      "5p",
      "9p",
      "1s",
      "9s",
      "1z",
      "7z",
      "1f",
    ]);
  });

  it("元の配列を書き換えない", () => {
    const ids = [50, 3, 20];
    sortTiles(ids);
    expect(ids).toEqual([50, 3, 20]);
  });
});
