import { tileOf } from "@/engine";
import type { TileId, WinRecord } from "@/engine";

export interface WinHand {
  /** 手牌。和了牌と、引いたポッチは含まない */
  hand: TileId[];
  /** ポッチ・逆ポッチの和了で引いた白。それ以外は null */
  pocchi: TileId | null;
  /** 和了牌。ポッチ・逆ポッチは高め取りした牌（手牌にはない） */
  winTile: TileId | null;
}

/**
 * 公開された手牌を、手牌と和了牌に分ける。
 * ポッチ・逆ポッチの和了牌は高め取りした種類の「普通の牌」で、手牌の牌と番号が重なることがある。
 * そのため手牌からは和了牌ではなく、引いたポッチ（同じ見た目の白は1枚しかない）を外す。
 * @param kind 和了の種類。流局のテンパイなどで和了でなければ null
 */
export function winHand(
  hand: readonly TileId[],
  kind: WinRecord["kind"] | null,
  winTile: TileId | null,
): WinHand {
  if (kind === "pocchi" || kind === "reversePocchi") {
    const pocchi = hand.find((tile) => tileOf(tile).variant === kind) ?? null;
    return {
      hand: hand.filter((tile) => tile !== pocchi),
      pocchi,
      winTile,
    };
  }
  return {
    hand: hand.filter((tile) => tile !== winTile),
    pocchi: null,
    winTile,
  };
}
