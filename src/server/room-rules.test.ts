import { describe, expect, it } from "vitest";
import {
  generateRoomCode,
  isUuid,
  parseRoomCode,
  shuffled,
} from "./room-rules";

describe("generateRoomCode（ルームコードの生成）", () => {
  it("DBの制約に合う6文字で、見間違えやすい文字を使わない", () => {
    let n = 0;
    const codes = Array.from({ length: 200 }, () =>
      generateRoomCode((max) => n++ % max),
    );
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z0-9]{6}$/);
      expect(code).not.toMatch(/[01ILO]/);
    }
  });

  it("作ったコードはそのまま入力として受け付けられる", () => {
    const code = generateRoomCode(() => 3);
    expect(parseRoomCode(code)).toBe(code);
  });
});

describe("parseRoomCode（ルームコードの検証）", () => {
  it("小文字、全角、空白をそろえる", () => {
    expect(parseRoomCode(" abc 234 ")).toBe("ABC234");
    expect(parseRoomCode("ａｂｃ２３４")).toBe("ABC234");
  });

  it("6文字の英数字でなければ受け付けない", () => {
    expect(parseRoomCode("ABC23")).toBeNull();
    expect(parseRoomCode("ABC2345")).toBeNull();
    expect(parseRoomCode("ABC-23")).toBeNull();
    expect(parseRoomCode("")).toBeNull();
    expect(parseRoomCode(null)).toBeNull();
    expect(parseRoomCode(123456)).toBeNull();
  });
});

describe("isUuid", () => {
  it("UUIDの形だけを受け付ける", () => {
    expect(isUuid("20000000-0000-0000-0000-00000000000a")).toBe(true);
    expect(isUuid("20000000-0000-0000-0000-00000000000")).toBe(false);
    expect(isUuid("' or 1=1 --")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});

describe("shuffled（席順の抽選）", () => {
  it("同じ要素を並べ替えるだけで、元の配列は変えない", () => {
    const items = ["a", "b", "c"];
    const result = shuffled(items, () => 0);
    expect([...result].sort()).toEqual(["a", "b", "c"]);
    expect(result).toEqual(["b", "c", "a"]);
    expect(items).toEqual(["a", "b", "c"]);
  });
});
