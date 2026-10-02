import { describe, expect, it } from "vitest";
import {
  decompose,
  isChiitoitsu,
  isCompleteHand,
  isKokushi,
  waitingKinds,
} from "./agari";
import type { Meld } from "./agari";
import { createRng, shuffle } from "./rng";
import { seedOf, tileAllocator, tiles } from "./testing";
import { TILE_KINDS, tileOf } from "./tiles";
import type { TileKind } from "./tiles";

function kinds(notation: string): TileKind[] {
  return tiles(notation).map((id) => tileOf(id).kind);
}

describe("decompose（4面子1雀頭の分解）", () => {
  it("順子3つと刻子1つと雀頭", () => {
    expect(decompose(kinds("123p456p789p111s22z"), 4)).toEqual([
      {
        pair: "2z",
        groups: [
          { type: "shuntsu", kind: "1p" },
          { type: "shuntsu", kind: "4p" },
          { type: "shuntsu", kind: "7p" },
          { type: "koutsu", kind: "1s" },
        ],
      },
    ]);
  });

  it("111222333 は刻子3つと順子3つの両方に分解できる", () => {
    const result = decompose(kinds("111222333p456s11z"), 4);
    expect(result).toHaveLength(2);
    const types = result.map((d) => d.groups.map((g) => g.type).join(","));
    expect(types).toContain("koutsu,koutsu,koutsu,shuntsu");
    expect(types).toContain("shuntsu,shuntsu,shuntsu,shuntsu");
  });

  it("雀頭の取り方が複数あればすべて返す", () => {
    // 11123444p: 111+234+44 と 11+123+444
    expect(decompose(kinds("11123444p"), 2)).toHaveLength(2);
  });

  it("字牌と萬子は順子にならない", () => {
    expect(decompose(kinds("123z456p789p111s22z"), 4)).toEqual([]);
    expect(decompose(kinds("19m1p456p789p111s22z"), 4)).toEqual([]);
  });

  it("色をまたぐ順子はない", () => {
    expect(decompose(kinds("89p1s456p789s111s22z"), 4)).toEqual([]);
  });

  it("副露がある場合は残りの面子数で分解する", () => {
    expect(decompose(kinds("123p11z"), 1)).toHaveLength(1);
    expect(decompose(kinds("11z"), 0)).toEqual([{ pair: "1z", groups: [] }]);
    expect(decompose(kinds("123p11z"), 2)).toEqual([]);
  });
});

describe("七対子と国士無双", () => {
  it("7種類の対子は七対子", () => {
    expect(isChiitoitsu(kinds("1199m2288p3377s11z"))).toBe(true);
  });

  it("同じ牌4枚は2対子として数える（4枚使いの七対子）", () => {
    expect(isChiitoitsu(kinds("1111m2288p3377s11z"))).toBe(true);
    expect(isChiitoitsu(kinds("1111m2222p3377s11z"))).toBe(true);
  });

  it("同じ牌3枚は対子として数えない", () => {
    expect(isChiitoitsu(kinds("111m9m2288p3377s11z"))).toBe(false);
  });

  it("13種類の么九牌と、そのどれか1枚で国士無双", () => {
    expect(isKokushi(kinds("19m19p19s1234567z1m"))).toBe(true);
    expect(isKokushi(kinds("19m19p19s1234567z7z"))).toBe(true);
  });

  it("么九牌が1種類でも欠けていれば国士無双ではない", () => {
    expect(isKokushi(kinds("19m19p19s123456z11m"))).toBe(false);
    expect(isKokushi(kinds("19m19p19s1234567z2p"))).toBe(false);
  });
});

describe("isCompleteHand", () => {
  it.each([
    ["123p456p789p111s22z", 0],
    ["1199m2288p3377s11z", 0],
    ["19m19p19s1234567z9s", 0],
    ["123p11z", 3],
  ])("%s（副露%d）は和了形", (notation, meldCount) => {
    expect(isCompleteHand(kinds(notation), meldCount)).toBe(true);
  });

  it.each([
    ["123p456p789p111s23z", 0],
    ["1199m2288p3377s12z", 0],
    // 副露した手は七対子にならない
    ["1199m", 3],
  ])("%s（副露%d）は和了形でない", (notation, meldCount) => {
    expect(isCompleteHand(kinds(notation), meldCount)).toBe(false);
  });
});

describe("isCompleteHand と decompose の一致", () => {
  it("乱数で作った手で、速い判定と全分解の結果が同じになる", () => {
    const rng = createRng(seedOf(1));
    const kindsInHand = TILE_KINDS.filter((kind) => kind !== "1f");
    let complete = 0;
    for (let n = 0; n < 5000; n++) {
      // 少ない種類から引いて、和了形がそれなりに出るようにする
      const pool = shuffle(kindsInHand, rng).slice(0, 6);
      const counts = new Map<TileKind, number>();
      const hand: TileKind[] = [];
      while (hand.length < 14) {
        const kind = pool[rng.nextInt(pool.length)]!;
        if ((counts.get(kind) ?? 0) === 4) continue;
        counts.set(kind, (counts.get(kind) ?? 0) + 1);
        hand.push(kind);
      }
      const expected =
        decompose(hand, 4).length > 0 || isChiitoitsu(hand) || isKokushi(hand);
      expect(isCompleteHand(hand, 0)).toBe(expected);
      if (expected) complete++;
    }
    expect(complete).toBeGreaterThan(20);
  });
});

describe("waitingKinds（待ち）", () => {
  function waits(concealed: string, melds: [Meld["type"], string][] = []) {
    const t = tileAllocator();
    return waitingKinds(
      t(concealed),
      melds.map(([type, notation]) => ({ type, tiles: t(notation) })),
    );
  }

  it("両面待ち", () => {
    expect(waits("23p456s789s111z44z")).toEqual(["1p", "4p"]);
  });

  it("単騎待ち", () => {
    expect(waits("123p456p789p111s2z")).toEqual(["2z"]);
  });

  it("シャンポン待ち", () => {
    expect(waits("123p456p789p11s22z")).toEqual(["1s", "2z"]);
  });

  it("七対子の待ち", () => {
    expect(waits("1199m2288p3377s1z")).toEqual(["1z"]);
  });

  it("4枚使いの七対子の待ち：3枚持っている牌の4枚目を待つ", () => {
    expect(waits("111m2288p3377s11z")).toEqual(["1m"]);
  });

  it("4枚使いの七対子の待ち：4枚そろっていれば残りの単騎を待つ", () => {
    expect(waits("1111m2288p3377s1z")).toEqual(["1z"]);
  });

  it("国士無双の13面待ち", () => {
    expect(waits("19m19p19s1234567z")).toHaveLength(13);
  });

  it("国士無双の単騎待ち", () => {
    expect(waits("19m19p19s123456z1m")).toEqual(["7z"]);
  });

  it("ノーテンなら空", () => {
    expect(waits("19m258p369s1234z5z")).toEqual([]);
  });

  it("副露した手の待ち", () => {
    expect(
      waits("23p11z", [
        ["pon", "777z"],
        ["pon", "999s"],
        ["minkan", "1111s"],
      ]),
    ).toEqual(["1p", "4p"]);
  });

  it("自分で4枚使っている牌は待ちに数えない", () => {
    expect(waits("23p456s789s11z", [["ankan", "1111p"]])).toEqual(["4p"]);
    expect(waits("12p456s789s11z", [["ankan", "3333p"]])).toEqual([]);
  });

  it("花牌は待ちにならない", () => {
    expect(waits("123p456p789p111s2z")).not.toContain("1f");
  });
});
