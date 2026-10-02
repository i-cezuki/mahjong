import { TILE_KINDS, isYaochu, kindsOf, rankOf, suitOf } from "./tiles";
import type { TileId, TileKind } from "./tiles";

/** pon=ポン、ankan=暗槓、minkan=大明槓、kakan=加槓 */
export type MeldType = "pon" | "ankan" | "minkan" | "kakan";

export interface Meld {
  type: MeldType;
  tiles: TileId[];
}

export interface Group {
  type: "shuntsu" | "koutsu";
  /** 順子なら一番小さい牌 */
  kind: TileKind;
}

export interface Decomposition {
  pair: TileKind;
  groups: Group[];
}

/** 和了形の判定に使う種類（花牌以外）。 */
const HAND_KINDS = TILE_KINDS.filter((kind) => suitOf(kind) !== "f");
const KIND_INDEX = new Map(HAND_KINDS.map((kind, index) => [kind, index]));
const YAOCHU_KINDS = HAND_KINDS.filter(isYaochu);

function toCounts(kinds: readonly TileKind[]): number[] {
  const counts = new Array<number>(HAND_KINDS.length).fill(0);
  for (const kind of kinds) {
    const index = KIND_INDEX.get(kind);
    if (index !== undefined) counts[index]!++;
  }
  return counts;
}

/** その種類から順子を始められるか（筒子と索子の1〜7）。 */
function startsShuntsu(kind: TileKind): boolean {
  const suit = suitOf(kind);
  return (suit === "p" || suit === "s") && rankOf(kind) <= 7;
}

function extractGroups(counts: number[], remaining: number): Group[][] {
  const index = counts.findIndex((count) => count > 0);
  if (index === -1) return remaining === 0 ? [[]] : [];
  if (remaining === 0) return [];

  const kind = HAND_KINDS[index]!;
  const results: Group[][] = [];

  if (counts[index]! >= 3) {
    counts[index]! -= 3;
    for (const rest of extractGroups(counts, remaining - 1)) {
      results.push([{ type: "koutsu", kind }, ...rest]);
    }
    counts[index]! += 3;
  }

  if (startsShuntsu(kind) && counts[index + 1]! > 0 && counts[index + 2]! > 0) {
    for (let i = 0; i < 3; i++) counts[index + i]!--;
    for (const rest of extractGroups(counts, remaining - 1)) {
      results.push([{ type: "shuntsu", kind }, ...rest]);
    }
    for (let i = 0; i < 3; i++) counts[index + i]!++;
  }

  return results;
}

/** 門前部分を「雀頭＋groupCount個の面子」に分ける方法をすべて返す。 */
export function decompose(
  kinds: readonly TileKind[],
  groupCount: number,
): Decomposition[] {
  if (kinds.length !== groupCount * 3 + 2) return [];
  const counts = toCounts(kinds);
  const results: Decomposition[] = [];
  HAND_KINDS.forEach((pair, index) => {
    if (counts[index]! < 2) return;
    counts[index]! -= 2;
    for (const groups of extractGroups(counts, groupCount)) {
      results.push({ pair, groups });
    }
    counts[index]! += 2;
  });
  return results;
}

export function isChiitoitsu(kinds: readonly TileKind[]): boolean {
  if (kinds.length !== 14) return false;
  return toCounts(kinds).every((count) => count === 0 || count === 2);
}

export function isKokushi(kinds: readonly TileKind[]): boolean {
  if (kinds.length !== 14) return false;
  if (!kinds.every(isYaochu)) return false;
  return new Set(kinds).size === YAOCHU_KINDS.length;
}

/** 門前部分（和了牌を含む）が和了形かどうか。meldCount は副露と暗槓の数。 */
export function isCompleteHand(
  kinds: readonly TileKind[],
  meldCount: number,
): boolean {
  if (meldCount === 0 && (isChiitoitsu(kinds) || isKokushi(kinds))) return true;
  return decompose(kinds, 4 - meldCount).length > 0;
}

/**
 * 待ち牌の種類を返す。空ならノーテン。
 * 自分の手牌と副露で4枚使い切っている牌は待ちに数えない。
 */
export function waitingKinds(
  concealed: readonly TileId[],
  melds: readonly Meld[],
): TileKind[] {
  const kinds = kindsOf(concealed);
  const held = toCounts([...kinds, ...melds.flatMap((m) => kindsOf(m.tiles))]);
  return HAND_KINDS.filter(
    (kind, index) =>
      held[index]! < 4 && isCompleteHand([...kinds, kind], melds.length),
  );
}
