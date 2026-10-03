import { Tile, TileBack } from "@/components/tile";
import type { MeldState, Seat, TileId } from "@/engine";
import { Flowers, Melds } from "./melds";

/**
 * 相手の席。外側に裏向きの手牌、内側に抜いた花牌と副露を置く。
 * オープンリーチ中は手牌を表向きにする。
 */
export function Opponent({
  side,
  seat,
  handCount,
  openHand,
  melds,
  flowers,
}: {
  side: "left" | "right";
  seat: Seat;
  handCount: number;
  /** オープンリーチで公開している手牌。ツモ牌は含まない */
  openHand: readonly TileId[] | null;
  melds: readonly MeldState[];
  flowers: readonly TileId[];
}) {
  const right = side === "right";
  return (
    <div className={`flex h-full gap-2 ${right ? "flex-row-reverse" : ""}`}>
      {/* 左の人は上から、右の人は下から、その人から見て左から右に並ぶ */}
      <div className={`flex gap-px ${right ? "flex-col-reverse" : "flex-col"}`}>
        {openHand
          ? [
              ...openHand.map((tile) => (
                <Tile
                  key={tile}
                  id={tile}
                  width={20}
                  rotation={right ? 270 : 90}
                />
              )),
              // 手番のツモ牌は切るまで裏向き
              ...Array.from({ length: handCount - openHand.length }, (_, i) => (
                <TileBack key={`drawn-${i}`} width={20} sideways />
              )),
            ]
          : Array.from({ length: handCount }, (_, i) => (
              <TileBack key={i} width={20} sideways />
            ))}
      </div>
      <div className={`flex flex-col gap-1.5 ${right ? "items-end" : ""}`}>
        <Flowers flowers={flowers} width={24} />
        <Melds
          melds={melds}
          seat={seat}
          width={24}
          className={`flex-col ${right ? "items-end" : ""}`}
        />
      </div>
    </div>
  );
}
