import { describe, expect, it } from "vitest";
import { isDoubleTap } from "./double-tap";

describe("isDoubleTap（ツモ切りの2回タップ）", () => {
  const first = { time: 1000, x: 200, y: 150 };

  it("同じ場所を素早く2回タップしたら成立する", () => {
    expect(isDoubleTap(first, { time: 1200, x: 205, y: 148 })).toBe(true);
  });

  it("間隔が空いたら成立しない", () => {
    expect(isDoubleTap(first, { time: 1400, x: 200, y: 150 })).toBe(false);
  });

  it("離れた場所の2回は成立しない（持ち直したときの両手の指など）", () => {
    expect(isDoubleTap(first, { time: 1100, x: 800, y: 150 })).toBe(false);
    expect(isDoubleTap(first, { time: 1100, x: 200, y: 300 })).toBe(false);
  });

  it("1回目がなければ成立しない", () => {
    expect(isDoubleTap(null, { time: 1100, x: 200, y: 150 })).toBe(false);
  });
});
