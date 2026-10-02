import { tileOf } from "@/engine/tiles";
import type { TileId, TileVariant } from "@/engine/tiles";

/** 牌画像の縦横比（元素材は47×63px、表示用PNGは3倍で生成） */
export const TILE_RATIO = 63 / 47;

const SUFFIX: Record<TileVariant, string> = {
  normal: "",
  red: "-red",
  gold: "-gold",
  pocchi: "-pocchi",
  reversePocchi: "-reverse-pocchi",
};

/** 牌の画像のパス。すべて表示用に高解像度PNGを使う。 */
export function tileImage(id: TileId): string {
  const { kind, variant } = tileOf(id);
  return `/tiles/${kind}${SUFFIX[variant]}.png`;
}
