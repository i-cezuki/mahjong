/**
 * 牌の定義。総数112枚。
 *
 * 種類は「数字＋色」の2文字で表す。
 * m=萬子（1と9のみ）、p=筒子、s=索子、z=字牌（1東 2南 3西 4北 5白 6發 7中）、f=花牌。
 */
export type TileKind =
  | "1m"
  | "9m"
  | `${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}${"p" | "s"}`
  | `${1 | 2 | 3 | 4 | 5 | 6 | 7}z`
  | "1f";

export type TileVariant =
  "normal" | "red" | "gold" | "pocchi" | "reversePocchi";

/** 0〜111。同じ種類の牌も1枚ずつ区別する。 */
export type TileId = number;

export interface Tile {
  readonly id: TileId;
  readonly kind: TileKind;
  readonly variant: TileVariant;
}

const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const HONORS = [1, 2, 3, 4, 5, 6, 7] as const;

/** 並べ替えの順番でもある。 */
export const TILE_KINDS: readonly TileKind[] = [
  "1m",
  "9m",
  ...NUMBERS.map((n) => `${n}p` as const),
  ...NUMBERS.map((n) => `${n}s` as const),
  ...HONORS.map((n) => `${n}z` as const),
  "1f",
];

const NORMAL: readonly TileVariant[] = ["normal", "normal", "normal", "normal"];
const FIVE: readonly TileVariant[] = ["red", "gold", "normal", "normal"];
const WHITE: readonly TileVariant[] = [
  "pocchi",
  "reversePocchi",
  "normal",
  "normal",
];

function variantsOf(kind: TileKind): readonly TileVariant[] {
  if (kind === "5p" || kind === "5s") return FIVE;
  if (kind === "5z") return WHITE;
  return NORMAL;
}

export const ALL_TILES: readonly Tile[] = TILE_KINDS.flatMap((kind) =>
  variantsOf(kind).map((variant) => ({ kind, variant })),
).map((tile, id) => ({ id, ...tile }));

export const TILE_COUNT = ALL_TILES.length;

export function tileOf(id: TileId): Tile {
  const tile = ALL_TILES[id];
  if (tile === undefined) throw new RangeError(`存在しない牌です: ${id}`);
  return tile;
}

export function isFlower(id: TileId): boolean {
  return tileOf(id).kind === "1f";
}

/** ドラ表示牌の種類から、ドラになる種類を返す。 */
export function doraKind(indicator: TileKind): TileKind {
  const rank = Number(indicator[0]);
  const suit = indicator[1];
  switch (suit) {
    case "m":
      return rank === 1 ? "9m" : "1m";
    case "p":
    case "s":
      return `${(rank % 9) + 1}${suit}` as TileKind;
    case "z":
      // 東→南→西→北→東、白→發→中→白
      if (rank <= 4) return `${(rank % 4) + 1}z` as TileKind;
      return `${((rank - 4) % 3) + 5}z` as TileKind;
    default:
      return "1f";
  }
}

const KIND_ORDER = new Map(TILE_KINDS.map((kind, index) => [kind, index]));

/** 種類の順（同じ種類ならid順）に並べた新しい配列を返す。 */
export function sortTiles(ids: readonly TileId[]): TileId[] {
  const order = (id: TileId) => KIND_ORDER.get(tileOf(id).kind) ?? 0;
  return [...ids].sort((a, b) => order(a) - order(b) || a - b);
}

export type Suit = "m" | "p" | "s" | "z" | "f";

export function suitOf(kind: TileKind): Suit {
  return kind[1] as Suit;
}

export function rankOf(kind: TileKind): number {
  return Number(kind[0]);
}

export function isHonor(kind: TileKind): boolean {
  return suitOf(kind) === "z";
}

/** 老頭牌（数牌の1と9） */
export function isTerminal(kind: TileKind): boolean {
  const suit = suitOf(kind);
  const rank = rankOf(kind);
  return (
    (suit === "m" || suit === "p" || suit === "s") && (rank === 1 || rank === 9)
  );
}

/** 么九牌（老頭牌と字牌） */
export function isYaochu(kind: TileKind): boolean {
  return isHonor(kind) || isTerminal(kind);
}

export function kindsOf(ids: readonly TileId[]): TileKind[] {
  return ids.map((id) => tileOf(id).kind);
}
