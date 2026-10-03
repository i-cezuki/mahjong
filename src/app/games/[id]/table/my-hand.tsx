import { useRef } from "react";
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
  onSlide,
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
  /** 指を滑らせて乗った牌。浮かせるだけで、切らない */
  onSlide: (tile: TileId) => void;
}) {
  /** 押してから指が別の牌に移った。指を離したときのタップを打牌に数えない */
  const slid = useRef(false);
  /** 押している間に最後に乗っていた牌 */
  const over = useRef<TileId | null>(null);

  // タッチでは指の下の要素ではなく押し始めた要素にイベントが来るので、座標から牌を探す
  const tileAt = (x: number, y: number): TileId | null => {
    const element = document.elementFromPoint(x, y)?.closest("[data-tile]");
    const tile = Number(element?.getAttribute("data-tile"));
    return element && pickable.includes(tile) ? tile : null;
  };

  return (
    <div
      className="flex touch-none items-end"
      onPointerDown={(event) => {
        slid.current = false;
        over.current = tileAt(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (event.buttons === 0 && event.pointerType === "mouse") return;
        const tile = tileAt(event.clientX, event.clientY);
        if (tile === null || tile === over.current) return;
        over.current = tile;
        slid.current = true;
        onSlide(tile);
      }}
    >
      {displayHand(hand, drawn).map((tile) => {
        const canPick = pickable.includes(tile);
        return (
          <button
            key={tile}
            type="button"
            data-tile={tile}
            disabled={!canPick}
            onClick={() => {
              if (slid.current) {
                slid.current = false;
                return;
              }
              onTap(tile);
            }}
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
