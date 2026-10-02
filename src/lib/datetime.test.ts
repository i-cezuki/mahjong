import { describe, expect, it } from "vitest";
import { formatJst } from "./datetime";

describe("formatJst（日本時間の日時）", () => {
  it("UTCの時刻を日本時間で出す", () => {
    expect(formatJst("2026-10-02T12:05:00+00:00")).toBe("2026/10/02 21:05");
    // 日付が変わる
    expect(formatJst("2026-12-31T15:30:00Z")).toBe("2027/01/01 00:30");
  });
});
