import { describe, expect, it } from "vitest";
import { HAND_KINDS, isCompleteHand } from "./agari";
import { createRng } from "./rng";
import { shanten, shantenOfKinds } from "./shanten";
import { seedOf, tiles } from "./testing";
import { kindsOf, rankOf, suitOf } from "./tiles";
import type { TileKind } from "./tiles";

const of = (notation: string) => shanten(tiles(notation), []);

describe("shanten（シャンテン数）", () => {
  it("和了形は −1、聴牌は 0", () => {
    expect(of("123456789p 234s 11z")).toBe(-1);
    expect(of("123456789p 23s 11z")).toBe(0);
    expect(of("123456789p 24s 11z")).toBe(0);
    expect(of("123456789p 234s 1z")).toBe(0);
  });

  it("面子、塔子、雀頭の数から数える", () => {
    // 3面子＋雀頭＋孤立牌2枚
    expect(of("123456789p 29s 11z")).toBe(1);
    // 2面子＋塔子2つ＋雀頭
    expect(of("123456p 23s 78s 11z 7z")).toBe(1);
    // 2面子＋塔子1つ＋雀頭
    expect(of("123456p 23s 9s 11z 67z")).toBe(2);
  });

  it("塔子は面子と合わせて4つまでしか数えない", () => {
    // 塔子5つ＋対子1つ＋孤立牌1枚。対子を雀頭にすると塔子は5つ残るが、数えるのは4つ
    expect(of("12p 45p 78p 12s 45s 11z 7z")).toBe(3);
  });

  it("萬子と字牌は順子にならない", () => {
    // 3面子。1萬と9萬、東と南は塔子にならないので、塔子も雀頭もない
    expect(of("123456789p 19m 12z")).toBe(2);
  });

  it("七対子は対子の数で数える。同じ牌4枚は2対子", () => {
    expect(of("11m 99m 11p 22p 44s 66s 7z")).toBe(0);
    expect(of("1111p 44p 66s 88s 55z 6z")).toBe(0);
    expect(of("11m 99m 11p 22p 4s 6s 8s 5z 7z")).toBe(2);
  });

  it("国士無双は么九牌の種類で数える", () => {
    expect(of("19m 19p 19s 1234567z")).toBe(0);
    expect(of("19m 19p 19s 123456z 5p")).toBe(1);
    expect(of("19m 19p 19s 12345z 55p")).toBe(2);
  });

  it("どの形にも遠い手は、一番近い形で数える", () => {
    // 么九牌が8種類。国士無双まで5
    expect(of("19m 258p 147s 12346z")).toBe(5);
  });

  it("副露しているときは通常形だけ。副露は面子として数える", () => {
    const pon = [{ type: "pon" as const, tiles: tiles("777z") }];
    expect(shanten(tiles("123456p 23s 11z"), pon)).toBe(0);
    expect(shanten(tiles("123456p 234s 11z"), pon)).toBe(-1);
    // 対子4つと孤立牌2枚。副露があるので七対子では数えず、面子1、雀頭1、塔子3
    expect(shanten(tiles("11m 99m 11p 44s 5z 6z"), pon)).toBe(2);
  });

  it("花牌は数えない", () => {
    expect(of("123456789p 23s 11z 1f")).toBe(0);
  });
});

/** 4面子1雀頭から作った、1種類4枚までの14枚。 */
function randomCompleteHand(rng: ReturnType<typeof createRng>): TileKind[] {
  for (;;) {
    const kinds: TileKind[] = [];
    for (let group = 0; group < 4; group++) {
      const kind = HAND_KINDS[rng.nextInt(HAND_KINDS.length)]!;
      const suit = suitOf(kind);
      const sequence =
        (suit === "p" || suit === "s") &&
        rankOf(kind) <= 7 &&
        rng.nextInt(2) === 0;
      if (sequence) {
        const start = rankOf(kind);
        for (let i = 0; i < 3; i++)
          kinds.push(`${start + i}${suit}` as TileKind);
      } else {
        kinds.push(kind, kind, kind);
      }
    }
    const pair = HAND_KINDS[rng.nextInt(HAND_KINDS.length)]!;
    kinds.push(pair, pair);
    if (HAND_KINDS.every((k) => kinds.filter((x) => x === k).length <= 4)) {
      return kinds;
    }
  }
}

const countOf = (kinds: readonly TileKind[], kind: TileKind) =>
  kinds.filter((k) => k === kind).length;

describe("shanten（乱数で作った手牌）", () => {
  it("和了形の判定と一致し、良い牌を引くとちょうど1減る", () => {
    const rng = createRng(seedOf(8), 3);
    let checked = 0;
    for (let n = 0; n < 400; n++) {
      const complete = randomCompleteHand(rng);
      expect(shantenOfKinds(complete, 0)).toBe(-1);

      // 0〜3枚をでたらめな牌に取り替えた14枚
      const hand = [...complete];
      for (let swaps = rng.nextInt(4); swaps > 0; swaps--) {
        const kind = HAND_KINDS[rng.nextInt(HAND_KINDS.length)]!;
        if (countOf(hand, kind) < 4) hand[rng.nextInt(hand.length)] = kind;
      }
      expect(shantenOfKinds(hand, 0) === -1).toBe(isCompleteHand(hand, 0));

      // 1枚抜いた13枚
      const thirteen = [...hand];
      thirteen.splice(rng.nextInt(thirteen.length), 1);
      // 自分で4枚使っている牌の5枚目を待つ形は、引ける牌がないので除く
      if (HAND_KINDS.some((kind) => countOf(thirteen, kind) === 4)) continue;
      const value = shantenOfKinds(thirteen, 0);
      expect(value).toBeGreaterThanOrEqual(0);
      const afterDraw = HAND_KINDS.map((kind) =>
        shantenOfKinds([...thirteen, kind], 0),
      );
      expect(Math.min(...afterDraw)).toBe(value - 1);
      expect(value === 0).toBe(
        HAND_KINDS.some((kind) => isCompleteHand([...thirteen, kind], 0)),
      );
      checked++;
    }
    expect(checked).toBeGreaterThan(200);
  });

  it("kindsOf で牌IDから数えても同じ", () => {
    const ids = tiles("123456789p 29s 11z");
    expect(shanten(ids, [])).toBe(shantenOfKinds(kindsOf(ids), 0));
  });
});
