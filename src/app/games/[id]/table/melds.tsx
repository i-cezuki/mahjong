import { Tile, TileBack } from "@/components/tile";
import type { MeldState, Seat, TileId } from "@/engine";
import { meldTiles } from "../logic/melds";

/** 副露1つ。鳴いた牌は横向きにして、鳴いた相手の側に置く（並べ方は logic/melds.ts）。 */
function Meld({
  meld,
  seat,
  width,
  glow,
}: {
  meld: MeldState;
  seat: Seat;
  width: number;
  glow?: ((tile: TileId) => boolean) | undefined;
}) {
  return (
    <span className="flex items-end">
      {meldTiles(meld, seat).map(({ tile, sideways, back }) =>
        back ? (
          <TileBack key={tile} width={width} />
        ) : (
          <Tile
            key={tile}
            id={tile}
            width={width}
            sideways={sideways}
            glow={glow?.(tile) ?? false}
          />
        ),
      )}
    </span>
  );
}

/** 副露の並び */
export function Melds({
  melds,
  seat,
  width,
  glow,
  className = "",
}: {
  melds: readonly MeldState[];
  /** 鳴いた人の席。鳴いた牌を置く側を決めるのに使う */
  seat: Seat;
  width: number;
  /** 光らせる牌 */
  glow?: ((tile: TileId) => boolean) | undefined;
  className?: string;
}) {
  return (
    <div className={`flex gap-1.5 ${className}`}>
      {melds.map((meld) => (
        <Meld
          key={meld.tiles[0]}
          meld={meld}
          seat={seat}
          width={width}
          glow={glow}
        />
      ))}
    </div>
  );
}

/** 抜いた花牌 */
export function Flowers({
  flowers,
  width,
}: {
  flowers: readonly TileId[];
  width: number;
}) {
  return (
    <div className="flex">
      {flowers.map((tile) => (
        <Tile key={tile} id={tile} width={width} />
      ))}
    </div>
  );
}
