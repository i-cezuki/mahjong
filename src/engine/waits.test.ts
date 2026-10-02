import { describe, expect, it } from "vitest";
import { tiles } from "./testing";
import { isGoodWait } from "./waits";

const good = (notation: string) => isGoodWait(tiles(notation), []);

describe("isGoodWait（待ちが良形か）", () => {
  it("両面を含む待ちは良形", () => {
    // 両面（1索と4索）
    expect(good("123456789p 23s 11z")).toBe(true);
    // 3面張（1、4、7索）
    expect(good("123456p 23456s 11z")).toBe(true);
    // 両面とシャンポンの複合（3334索：2、5索の両面と4索の単騎）
    expect(good("123456789p 3334s")).toBe(true);
  });

  it("両面を含まない待ちは愚形", () => {
    // カンチャン
    expect(good("123456789p 24s 11z")).toBe(false);
    // ペンチャン（12索の3索待ち、89索の7索待ち）
    expect(good("123456789p 12s 11z")).toBe(false);
    expect(good("123456789p 89s 11z")).toBe(false);
    // 単騎
    expect(good("123456789p 234s 1z")).toBe(false);
    // ノベタン（2345索の2、5索待ち。どちらも雀頭になる）
    expect(good("123456789p 2345s")).toBe(false);
    // シャンポン
    expect(good("123456789p 22s 11z")).toBe(false);
    // 七対子
    expect(good("11m 99m 11p 22p 44s 66s 7z")).toBe(false);
    // 国士無双
    expect(good("19m 19p 19s 1234567z")).toBe(false);
  });

  it("聴牌していなければ false", () => {
    expect(good("123456789p 29s 11z")).toBe(false);
  });

  it("副露していても、門前部分の待ちで決める", () => {
    const pon = [{ type: "pon" as const, tiles: tiles("777z") }];
    expect(isGoodWait(tiles("123456p 23s 11z"), pon)).toBe(true);
    expect(isGoodWait(tiles("123456p 24s 11z"), pon)).toBe(false);
  });
});
