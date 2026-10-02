import { Tile } from "@/components/tile";
import type { Discard, TileId } from "@/engine";

const PER_ROW = 6;

/** 河。6枚で折り返す。リーチ宣言牌は横向き、鳴かれた牌は薄くする。 */
export function River({
  discards,
  width,
  highlight,
}: {
  discards: readonly Discard[];
  /** 牌の幅 */
  width: number;
  /** 応答待ちになっている牌（枠を付ける） */
  highlight: TileId | null;
}) {
  const rows: Discard[][] = [];
  for (let i = 0; i < discards.length; i += PER_ROW) {
    rows.push(discards.slice(i, i + PER_ROW));
  }
  return (
    <div className="flex flex-col">
      {rows.map((row, i) => (
        <div key={i} className="flex items-end">
          {row.map((discard) => (
            <span
              key={discard.tile}
              className={`flex ${
                discard.tile === highlight
                  ? "rounded-[3px] outline-2 outline-cyan-300"
                  : ""
              }`}
            >
              <Tile
                id={discard.tile}
                width={width}
                sideways={discard.riichi === true}
                dimmed={discard.called === true}
              />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
