import { TileBack } from "@/components/tile";
import type { MeldState, TileId } from "@/engine";
import { Flowers, Melds } from "./melds";

/** 相手の席。外側に裏向きの手牌、内側に抜いた花牌と副露を置く。 */
export function Opponent({
  side,
  handCount,
  melds,
  flowers,
}: {
  side: "left" | "right";
  handCount: number;
  melds: readonly MeldState[];
  flowers: readonly TileId[];
}) {
  const right = side === "right";
  return (
    <div className={`flex h-full gap-2 ${right ? "flex-row-reverse" : ""}`}>
      <div className="flex flex-col gap-px">
        {Array.from({ length: handCount }, (_, i) => (
          <TileBack key={i} width={20} sideways />
        ))}
      </div>
      <div className={`flex flex-col gap-1.5 ${right ? "items-end" : ""}`}>
        <Flowers flowers={flowers} width={24} />
        <Melds
          melds={melds}
          width={24}
          className={`flex-col ${right ? "items-end" : ""}`}
        />
      </div>
    </div>
  );
}
