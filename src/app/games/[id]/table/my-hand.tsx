import { displayHand } from "@/components/hand-order";
import { Tile } from "@/components/tile";
import type { TileId } from "@/engine";

/** 手牌の牌の幅。14枚とツモ牌の間で、卓の幅（1040）のほぼいっぱいに広がる */
const HAND_TILE_WIDTH = 66;

/** 自分の手牌。ツモ牌は右端に少し離して置く。 */
export function MyHand({
  hand,
  drawn,
  pickable,
  dimOthers,
  selected,
  onTap,
}: {
  hand: readonly TileId[];
  drawn: TileId | null;
  /** いま切れる牌 */
  pickable: readonly TileId[];
  /** 切れない牌を薄くする（リーチの牌選び） */
  dimOthers: boolean;
  /** 1回目のタップで浮いている牌 */
  selected: TileId | null;
  onTap: (tile: TileId) => void;
}) {
  return (
    <div className="flex items-end">
      {displayHand(hand, drawn).map((tile) => {
        const canPick = pickable.includes(tile);
        return (
          <button
            key={tile}
            type="button"
            disabled={!canPick}
            onClick={() => onTap(tile)}
            className={`flex ${tile === drawn ? "ml-3" : ""} ${
              canPick ? "cursor-pointer" : "cursor-default"
            }`}
          >
            <Tile
              id={tile}
              width={HAND_TILE_WIDTH}
              raised={tile === selected}
              dimmed={dimOthers && !canPick}
            />
          </button>
        );
      })}
    </div>
  );
}
