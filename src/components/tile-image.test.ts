import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALL_TILES } from "@/engine/tiles";
import { tileImage } from "./tile-image";

describe("tileImage", () => {
  it("112枚すべてに画像ファイルがある", () => {
    for (const tile of ALL_TILES) {
      const path = tileImage(tile.id);
      expect(existsSync(`public${path}`), path).toBe(true);
    }
  });

  it("赤、金、ポッチ、逆ポッチは通常の牌と別の画像になる", () => {
    const paths = (kind: string) =>
      new Set(
        ALL_TILES.filter((t) => t.kind === kind).map((t) => tileImage(t.id)),
      );
    expect(paths("5p").size).toBe(3);
    expect(paths("5s").size).toBe(3);
    expect(paths("5z").size).toBe(3);
    expect(paths("1p").size).toBe(1);
  });
});
