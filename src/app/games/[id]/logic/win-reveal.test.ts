import { describe, expect, it } from "vitest";
import type { WinResult } from "@/engine";
import {
  REVEAL_STEP_MS,
  revealItems,
  revealSchedule,
  SETTLE_PAUSE_MS,
  URA_FLIP_MS,
  URA_SETTLE_MS,
} from "./win-reveal";

function result(
  yaku: WinResult["yaku"],
  dora: Partial<WinResult["dora"]> = {},
): WinResult {
  return {
    yaku,
    yakuman: 0,
    han: 0,
    dora: { dora: 0, ura: 0, red: 0, gold: 0, flower: 0, ...dora },
  };
}

describe("revealItems", () => {
  it("役、ドラ類、裏ドラの順に並べ、乗っていないドラ類は入れない", () => {
    const items = revealItems(
      result(
        [
          { name: "riichi", han: 1 },
          { name: "hatsu", han: 1 },
        ],
        { ura: 2, flower: 1, dora: 2, red: 0 },
      ),
    );
    expect(items).toEqual([
      { kind: "yaku", name: "riichi", han: 1 },
      { kind: "yaku", name: "hatsu", han: 1 },
      { kind: "bonus", key: "dora", han: 2 },
      { kind: "bonus", key: "flower", han: 1 },
      { kind: "ura", han: 2 },
    ]);
  });

  it("裏ドラが乗らなければ裏ドラの行はない", () => {
    expect(revealItems(result([{ name: "riichi", han: 1 }]))).toEqual([
      { kind: "yaku", name: "riichi", han: 1 },
    ]);
  });
});

describe("revealSchedule", () => {
  it("1行ずつ間を空けて出し、最後に点棒の移動を出す", () => {
    expect(revealSchedule(2, false)).toEqual({
      steps: [REVEAL_STEP_MS, 2 * REVEAL_STEP_MS],
      flip: null,
      settle: 2 * REVEAL_STEP_MS + SETTLE_PAUSE_MS,
    });
  });

  it("裏ドラは役とドラ類を出し切ってからめくる", () => {
    const flip = 3 * REVEAL_STEP_MS + URA_FLIP_MS;
    expect(revealSchedule(3, true)).toEqual({
      steps: [REVEAL_STEP_MS, 2 * REVEAL_STEP_MS, 3 * REVEAL_STEP_MS],
      flip,
      settle: flip + URA_SETTLE_MS,
    });
  });
});
