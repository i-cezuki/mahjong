import { describe, expect, it } from "vitest";
import { limitLabel } from "./labels";

describe("limitLabel", () => {
  it("満貫に届かなければ呼び名はない", () => {
    expect(limitLabel(1)).toBeNull();
    expect(limitLabel(3)).toBeNull();
  });

  it("点数表の区切りごとに呼び名が変わる", () => {
    expect(limitLabel(4)).toBe("満貫");
    expect(limitLabel(5)).toBe("満貫");
    expect(limitLabel(6)).toBe("跳満");
    expect(limitLabel(7)).toBe("跳満");
    expect(limitLabel(8)).toBe("倍満");
    expect(limitLabel(10)).toBe("倍満");
    expect(limitLabel(11)).toBe("三倍満");
    expect(limitLabel(12)).toBe("三倍満");
    expect(limitLabel(13)).toBe("数え役満");
    expect(limitLabel(20)).toBe("数え役満");
  });
});
