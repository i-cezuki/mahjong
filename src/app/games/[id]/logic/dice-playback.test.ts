import { describe, expect, it } from "vitest";
import { diceSteps } from "./dice-playback";

describe("diceSteps", () => {
  it("順不同で当たりを数える", () => {
    const steps = diceSteps(
      [2, 5],
      [
        [5, 2],
        [1, 3],
        [2, 5],
        [6, 4],
      ],
    );
    expect(steps.map((s) => s.outcome)).toEqual(["hit", "miss", "hit", "miss"]);
    expect(steps.map((s) => s.attempt)).toEqual([1, 2, 3, 4]);
    expect(steps.map((s) => s.hits)).toEqual([1, 1, 2, 2]);
  });

  it("ゾロ目は回数を消費せず、同じ回を振り直す", () => {
    const steps = diceSteps(
      [1, 2],
      [
        [3, 3],
        [1, 2],
        [4, 4],
        [6, 6],
        [2, 3],
        [1, 6],
        [2, 1],
      ],
    );
    expect(steps.map((s) => s.outcome)).toEqual([
      "double",
      "hit",
      "double",
      "double",
      "miss",
      "miss",
      "hit",
    ]);
    expect(steps.map((s) => s.attempt)).toEqual([1, 1, 2, 2, 2, 3, 4]);
    expect(steps.at(-1)!.hits).toBe(2);
  });
});
