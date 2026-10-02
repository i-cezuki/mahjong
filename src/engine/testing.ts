import { TILE_COUNT } from "./tiles";
import type { TileId } from "./tiles";

/**
 * テスト用。id順に並んだ山（deck[i] === i）の指定位置を入れ替えて返す。
 *
 * 親が席0のとき、位置0〜12が親、13〜25が南家、26〜38が西家の配牌、
 * 39〜101がツモ山、102〜109が嶺上牌、110がドラ表示牌、111が裏ドラ表示牌。
 * id順のままだと花牌（108〜111）は嶺上牌の末尾と表示牌にあり、対局には出てこない。
 */
export function deckWithSwaps(...swaps: [number, number][]): TileId[] {
  const deck = Array.from({ length: TILE_COUNT }, (_, i) => i);
  for (const [a, b] of swaps) {
    [deck[a], deck[b]] = [deck[b]!, deck[a]!];
  }
  return deck;
}

export function range(start: number, end: number): number[] {
  return Array.from({ length: end - start }, (_, i) => start + i);
}

export function seedOf(n: number): string {
  return n.toString(16).padStart(64, "0");
}
