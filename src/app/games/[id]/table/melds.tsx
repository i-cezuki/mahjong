import { Tile, TileBack } from "@/components/tile";
import type { MeldState, TileId } from "@/engine";

/**
 * 副露1つ。鳴いた牌を横向きにする。
 * 牌の並びはエンジンが決めている：ポンは [手牌, 手牌, 鳴いた牌]、
 * 大明槓は [手牌×3, 鳴いた牌]、加槓は [手牌, 手牌, 鳴いた牌, 加えた牌]。
 */
function Meld({ meld, width }: { meld: MeldState; width: number }) {
  if (meld.type === "ankan") {
    // 暗槓は両端を裏向きにする
    return (
      <span className="flex items-end">
        {meld.tiles.map((tile, i) =>
          i === 0 || i === 3 ? (
            <TileBack key={tile} width={width} />
          ) : (
            <Tile key={tile} id={tile} width={width} />
          ),
        )}
      </span>
    );
  }
  const firstCalled = meld.type === "minkan" ? 3 : 2;
  return (
    <span className="flex items-end">
      {meld.tiles.map((tile, i) => (
        <Tile key={tile} id={tile} width={width} sideways={i >= firstCalled} />
      ))}
    </span>
  );
}

/** 副露の並び */
export function Melds({
  melds,
  width,
  className = "",
}: {
  melds: readonly MeldState[];
  width: number;
  className?: string;
}) {
  return (
    <div className={`flex gap-1.5 ${className}`}>
      {melds.map((meld) => (
        <Meld key={meld.tiles[0]} meld={meld} width={width} />
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
