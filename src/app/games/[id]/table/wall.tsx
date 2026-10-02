import { Tile } from "@/components/tile";
import type { PlayerView } from "@/server/table";
import { wallColumns } from "../logic/wall";
import type { WallCell } from "../logic/wall";

/** 山の牌1枚の大きさ */
const CELL_WIDTH = 11;
const CELL_HEIGHT = 15;
/** 嶺上牌の枚数（花牌4枚＋槓4回でちょうど使い切る） */
const RINSHAN_TILES = 8;
/** 配牌直後の山の数。幅を固定して、牌が減っても位置が動かないようにする */
const MAX_COLUMNS = 36;

function Cell({ cell }: { cell: WallCell }) {
  if (typeof cell === "object")
    return <Tile id={cell.dora} width={CELL_WIDTH} />;
  const look =
    cell === "back"
      ? "border border-[#0a1a44] bg-[#1d3f8f]"
      : cell === "next"
        ? "border border-cyan-200 bg-cyan-400 shadow-[0_0_6px_#22d3ee]"
        : "";
  return (
    <span
      className={`block ${look}`}
      style={{ width: CELL_WIDTH, height: CELL_HEIGHT }}
    />
  );
}

/**
 * 山。残り枚数と、上下2段に並べた小さな牌で表す。
 * 左から嶺上牌、ドラ表示牌（表向き）、ツモ山。次にツモる牌は水色にする。
 */
export function WallPanel({ view }: { view: PlayerView }) {
  const flowers = view.flowers.reduce((n, tiles) => n + tiles.length, 0);
  const kans = view.doraIndicators.length - 1;
  const columns = wallColumns({
    wallCount: view.wallCount,
    doraIndicators: view.doraIndicators,
    rinshanLeft: RINSHAN_TILES - flowers - kans,
  });

  return (
    <div className="flex items-end gap-2">
      <div className="flex flex-col items-center gap-0.5 pb-0.5 leading-none">
        <span className="rounded-sm border border-cyan-400/60 px-2 text-[9px]">
          山
        </span>
        <span className="font-mono text-[26px] leading-none text-cyan-300">
          {view.wallCount}
          <span className="ml-0.5 font-sans text-xs text-foreground">枚</span>
        </span>
      </div>
      <div
        className="flex flex-col gap-px"
        style={{ width: MAX_COLUMNS * CELL_WIDTH }}
      >
        <div className="relative h-2.5 text-[9px] leading-none opacity-70">
          <span className="absolute left-0">嶺上</span>
          <span
            className="absolute text-cyan-300"
            style={{ left: 4 * CELL_WIDTH }}
          >
            ドラ表示
          </span>
        </div>
        <div className="flex">
          {columns.map((column, i) => (
            <span key={i} className="flex flex-col">
              <Cell cell={column.top} />
              <Cell cell={column.bottom} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
