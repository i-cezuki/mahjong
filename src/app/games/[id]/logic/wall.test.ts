import { describe, expect, it } from "vitest";
import { tileOf } from "@/engine";
import { tiles } from "@/engine/testing";
import { doraTiles, wallColumns } from "./wall";

const B = "back";
const E = "empty";

describe("wallColumns", () => {
  it("左から嶺上4山、ドラ表示の山、ツモ山の順に並べる", () => {
    const columns = wallColumns({
      wallCount: 4,
      doraIndicators: [70],
      rinshanLeft: 8,
    });
    expect(columns).toEqual([
      { part: "rinshan", top: B, bottom: B },
      { part: "rinshan", top: B, bottom: B },
      { part: "rinshan", top: B, bottom: B },
      { part: "rinshan", top: B, bottom: B },
      { part: "dora", top: { dora: 70 }, bottom: B },
      { part: "live", top: B, bottom: B },
      // 次にツモるのは右端の上の牌
      { part: "live", top: "next", bottom: B },
    ]);
  });

  it("ツモ山が奇数なら、右端の山は下の牌だけが残っている", () => {
    const columns = wallColumns({
      wallCount: 3,
      doraIndicators: [70],
      rinshanLeft: 8,
    });
    expect(columns.slice(5)).toEqual([
      { part: "live", top: B, bottom: B },
      { part: "live", top: E, bottom: "next" },
    ]);
  });

  it("嶺上牌は左の山の上から順に減る", () => {
    const columns = wallColumns({
      wallCount: 0,
      doraIndicators: [70],
      rinshanLeft: 5,
    });
    expect(columns.slice(0, 4)).toEqual([
      { part: "rinshan", top: E, bottom: E },
      { part: "rinshan", top: E, bottom: B },
      { part: "rinshan", top: B, bottom: B },
      { part: "rinshan", top: B, bottom: B },
    ]);
  });

  it("槓ドラの山はドラ表示の右に増える。ツモ山がなければ何も並べない", () => {
    const columns = wallColumns({
      wallCount: 0,
      doraIndicators: [70, 71],
      rinshanLeft: 7,
    });
    expect(columns.slice(4)).toEqual([
      { part: "dora", top: { dora: 70 }, bottom: B },
      { part: "dora", top: { dora: 71 }, bottom: B },
    ]);
  });
});

describe("doraTiles", () => {
  const kinds = (notation: string) =>
    doraTiles(tiles(notation)).map((id) => tileOf(id).kind);

  it("表示牌の次の牌を返す", () => {
    expect(kinds("3p 9s 1m 9m")).toEqual(["4p", "1s", "9m", "1m"]);
    expect(kinds("4z 7z")).toEqual(["1z", "5z"]);
  });

  it("表示牌が花牌なら花牌がドラ", () => {
    expect(kinds("1f")).toEqual(["1f"]);
  });

  it("赤や金の表示牌でも、返すのは通常の牌", () => {
    const [dora] = doraTiles(tiles("r5p"));
    expect(tileOf(dora!)).toMatchObject({ kind: "6p", variant: "normal" });
  });
});
