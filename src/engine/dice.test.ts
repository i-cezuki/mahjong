import { describe, expect, it } from "vitest";
import { rollDiceChance } from "./dice";
import { seedOf } from "./testing";

describe("rollDiceChance（サイコロチャンス1回分）", () => {
  it("ゾロ目を除いてちょうど4回振る", () => {
    for (let n = 0; n < 300; n++) {
      const { rolls } = rollDiceChance(seedOf(n), 0, [1, 2]);
      expect(rolls.filter(([a, b]) => a !== b)).toHaveLength(4);
      // 最後の1回はゾロ目ではない（4回目で終わる）
      const last = rolls.at(-1)!;
      expect(last[0]).not.toBe(last[1]);
      for (const die of rolls.flat()) {
        expect(die).toBeGreaterThanOrEqual(1);
        expect(die).toBeLessThanOrEqual(6);
      }
    }
  });

  it("当たりは指定した出目と順不同で一致した回数", () => {
    for (let n = 0; n < 300; n++) {
      const { rolls, hits } = rollDiceChance(seedOf(n), 0, [3, 5]);
      const expected = rolls.filter(
        ([a, b]) => (a === 3 && b === 5) || (a === 5 && b === 3),
      ).length;
      expect(hits).toBe(expected);
    }
  });

  it("当たる確率は1回あたり15分の1", () => {
    let hits = 0;
    const trials = 3000;
    for (let n = 0; n < trials; n++)
      hits += rollDiceChance(seedOf(n), 0, [2, 6]).hits;
    const perRoll = hits / (trials * 4);
    expect(perRoll).toBeGreaterThan(1 / 15 - 0.012);
    expect(perRoll).toBeLessThan(1 / 15 + 0.012);
  });

  it("同じ種と番号なら同じ出目、番号が違えば別の出目", () => {
    expect(rollDiceChance(seedOf(7), 0, [1, 2])).toEqual(
      rollDiceChance(seedOf(7), 0, [1, 2]),
    );
    const sequences = new Set(
      range10().map((i) =>
        JSON.stringify(rollDiceChance(seedOf(7), i, [1, 2]).rolls),
      ),
    );
    expect(sequences.size).toBeGreaterThan(1);
  });

  it("ゾロ目や範囲外の指定は拒否する", () => {
    expect(() => rollDiceChance(seedOf(1), 0, [3, 3])).toThrow();
    expect(() => rollDiceChance(seedOf(1), 0, [0, 3])).toThrow();
    expect(() => rollDiceChance(seedOf(1), 0, [1, 7])).toThrow();
  });
});

function range10(): number[] {
  return Array.from({ length: 10 }, (_, i) => i);
}
