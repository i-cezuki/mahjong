import type { TileId } from "@/engine/tiles";

/**
 * 手牌を表示する順に並べる。並べ替え済みの手牌からツモ牌を抜き、右端に置く。
 * ツモ牌がなければ（他家の手番、ポンの直後）そのまま返す。
 */
export function displayHand(
  hand: readonly TileId[],
  drawn: TileId | null,
): TileId[] {
  if (drawn === null || !hand.includes(drawn)) return [...hand];
  return [...hand.filter((tile) => tile !== drawn), drawn];
}
