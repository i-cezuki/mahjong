import { HAND_KINDS, toCounts } from "./agari";
import type { Meld } from "./agari";
import { isYaochu, kindsOf, suitOf } from "./tiles";
import type { TileId, TileKind } from "./tiles";

/*
 * シャンテン数。聴牌までにあと何枚の入れ替えが必要か。−1 が和了形、0 が聴牌。
 * 場に見えている枚数や、自分で4枚使い切っている待ちは考えない。
 */

/** 順子や塔子で隣の牌とつながる色（筒子と索子）。萬子は1と9しかなく、つながらない。 */
function isSequenceSuit(kind: TileKind): boolean {
  const suit = suitOf(kind);
  return suit === "p" || suit === "s";
}

/** 4面子1雀頭の形までのシャンテン数。meldCount は副露と暗槓の数。 */
function standardShanten(counts: number[], meldCount: number): number {
  let best = 8;
  let mentsu = meldCount;
  let taatsu = 0;
  let head = 0;

  /** index の牌から offset 先の牌が、同じ色で手にあるか。 */
  const linked = (index: number, offset: number): boolean => {
    const kind = HAND_KINDS[index]!;
    const other = HAND_KINDS[index + offset];
    return (
      other !== undefined &&
      isSequenceSuit(kind) &&
      suitOf(other) === suitOf(kind) &&
      counts[index + offset]! > 0
    );
  };

  // 種類の小さい方から、面子、雀頭、塔子の取り方をすべて試す
  const search = (from: number): void => {
    let index = from;
    while (index < counts.length && counts[index] === 0) index++;
    if (index === counts.length) {
      // 面子と塔子は合わせて4つまで。雀頭は別に数える
      const blocks = Math.min(taatsu, 4 - mentsu);
      best = Math.min(best, 8 - 2 * mentsu - blocks - head);
      return;
    }

    if (counts[index]! >= 3) {
      counts[index]! -= 3;
      mentsu++;
      search(index);
      mentsu--;
      counts[index]! += 3;
    }
    if (linked(index, 1) && linked(index, 2)) {
      for (let i = 0; i < 3; i++) counts[index + i]!--;
      mentsu++;
      search(index);
      mentsu--;
      for (let i = 0; i < 3; i++) counts[index + i]!++;
    }
    if (head === 0 && counts[index]! >= 2) {
      counts[index]! -= 2;
      head = 1;
      search(index);
      head = 0;
      counts[index]! += 2;
    }
    if (mentsu + taatsu < 4) {
      if (counts[index]! >= 2) {
        counts[index]! -= 2;
        taatsu++;
        search(index);
        taatsu--;
        counts[index]! += 2;
      }
      for (const offset of [1, 2]) {
        if (!linked(index, offset)) continue;
        counts[index]!--;
        counts[index + offset]!--;
        taatsu++;
        search(index);
        taatsu--;
        counts[index]!++;
        counts[index + offset]!++;
      }
    }

    // 残りは孤立牌として使わない
    const rest = counts[index]!;
    counts[index] = 0;
    search(index + 1);
    counts[index] = rest;
  };

  search(0);
  return best;
}

/** 七対子までのシャンテン数。このルールでは同じ牌4枚を2対子と数える。 */
function chiitoitsuShanten(counts: readonly number[]): number {
  const pairs = counts.reduce((sum, count) => sum + Math.floor(count / 2), 0);
  return 6 - pairs;
}

/** 国士無双までのシャンテン数。 */
function kokushiShanten(counts: readonly number[]): number {
  let kinds = 0;
  let pair = 0;
  HAND_KINDS.forEach((kind, index) => {
    if (!isYaochu(kind)) return;
    if (counts[index]! > 0) kinds++;
    if (counts[index]! >= 2) pair = 1;
  });
  return 13 - kinds - pair;
}

/**
 * 種類の並びで渡された門前部分のシャンテン数。
 * 通常形、七対子、国士無双のうち一番小さい値。副露があるときは通常形だけ。
 */
export function shantenOfKinds(
  kinds: readonly TileKind[],
  meldCount: number,
): number {
  const counts = toCounts(kinds);
  const standard = standardShanten(counts, meldCount);
  if (meldCount > 0) return standard;
  return Math.min(standard, chiitoitsuShanten(counts), kokushiShanten(counts));
}

/** 手牌（門前部分）と副露からシャンテン数を出す。花牌は数えない。 */
export function shanten(
  concealed: readonly TileId[],
  melds: readonly Meld[],
): number {
  return shantenOfKinds(kindsOf(concealed), melds.length);
}
