import { tileOf } from "@/engine/tiles";
import type { TileId, TileVariant } from "@/engine/tiles";

/** 素材の牌画像の縦横比（47×63px） */
export const TILE_RATIO = 63 / 47;

const SUFFIX: Record<TileVariant, string> = {
  normal: "",
  red: "-red",
  gold: "-gold",
  pocchi: "-pocchi",
  reversePocchi: "-reverse-pocchi",
};

/** 牌の画像のパス。素材にある牌はGIF、加工して作った牌はPNG。 */
export function tileImage(id: TileId): string {
  const { kind, variant } = tileOf(id);
  if (variant === "normal" && kind !== "1f") return `/tiles/${kind}.gif`;
  return `/tiles/${kind}${SUFFIX[variant]}.png`;
}
