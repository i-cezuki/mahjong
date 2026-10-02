import { Tile } from "@/components/tile";
import type { TileRotation } from "@/components/tile";
import type { Discard, TileId } from "@/engine";

const PER_ROW = 6;

/**
 * 河を置く向き。捨てた人から見た並びになるように、牌と列の向きを変える。
 * - self：自分。左から右へ並べ、下へ折り返す。
 * - left：上家。牌の上を右に向け、上から下へ並べる。1列目が卓の中央側（右）。
 * - right：下家。牌の上を左に向け、下から上へ並べる。1列目が卓の中央側（左）。
 */
export type RiverFacing = "self" | "left" | "right";

const LAYOUT: Record<
  RiverFacing,
  { rotation: TileRotation; rows: string; row: string }
> = {
  self: { rotation: 0, rows: "flex-col", row: "flex-row items-end" },
  left: { rotation: 90, rows: "flex-row-reverse", row: "flex-col items-end" },
  right: {
    rotation: 270,
    rows: "flex-row",
    row: "flex-col-reverse items-start",
  },
};

/** 河。6枚で折り返す。リーチ宣言牌は90度倒し、鳴かれた牌は薄くする。 */
export function River({
  discards,
  width,
  highlight,
  facing,
}: {
  discards: readonly Discard[];
  /** 牌の幅 */
  width: number;
  /** 応答待ちになっている牌（枠を付ける） */
  highlight: TileId | null;
  facing: RiverFacing;
}) {
  const { rotation, rows, row } = LAYOUT[facing];
  const riichiRotation = ((rotation + 90) % 360) as TileRotation;
  const lines: Discard[][] = [];
  for (let i = 0; i < discards.length; i += PER_ROW) {
    lines.push(discards.slice(i, i + PER_ROW));
  }
  return (
    <div className={`flex h-full ${rows}`}>
      {lines.map((line, i) => (
        <div key={i} className={`flex ${row}`}>
          {line.map((discard) => (
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
                rotation={discard.riichi ? riichiRotation : rotation}
                dimmed={discard.called === true}
              />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
