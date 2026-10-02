import type { TileId } from "@/engine";

/** 花牌を抜く途中の見せ方。自分の手牌と花の、いま画面に出す内容。 */
export interface FlowerStage {
  hand: TileId[];
  drawn: TileId | null;
  flowers: TileId[];
  /** 花牌を見せている最中（この間は操作できない） */
  staging: boolean;
}

/**
 * サーバーは花牌を抜いて補充するところまで一度に済ませる。
 * 画面では、抜いた花牌をいったんツモ牌の位置に出してから、花に移して補充牌を出す。
 * @param flowers 自分が抜いた花牌（抜いた順）
 * @param shown すでに花に移して見せた枚数
 */
export function flowerStage(
  hand: readonly TileId[],
  drawn: TileId | null,
  flowers: readonly TileId[],
  shown: number,
): FlowerStage {
  const flower = flowers[shown];
  if (flower === undefined || drawn === null) {
    return { hand: [...hand], drawn, flowers: [...flowers], staging: false };
  }
  return {
    hand: [...hand.filter((tile) => tile !== drawn), flower],
    drawn: flower,
    flowers: flowers.slice(0, shown),
    staging: true,
  };
}
