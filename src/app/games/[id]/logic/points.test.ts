import { describe, expect, it } from "vitest";
import { pointDiffs } from "./points";

describe("pointDiffs", () => {
  it("自分から見た点差を返す。相手が上ならプラス", () => {
    expect(pointDiffs([30000, 42000, 18000], 0)).toEqual([0, 12000, -12000]);
    expect(pointDiffs([30000, 42000, 18000], 1)).toEqual([-12000, 0, -24000]);
  });

  it("マイナスの持ち点でも計算できる", () => {
    expect(pointDiffs([-4000, 76000, 18000], 2)).toEqual([-22000, 58000, 0]);
  });
});
