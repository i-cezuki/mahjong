import { doraKind, plainTileOf, tileOf } from "@/engine";
import type { TileId } from "@/engine";

/** 山の牌1枚分の見せ方。back は裏向き、empty は取られたあと、next は次にツモる牌。 */
export type WallCell = "back" | "empty" | "next" | { dora: TileId };

/** 山の1山（上下2枚） */
export interface WallColumn {
  part: "rinshan" | "dora" | "live";
  top: WallCell;
  bottom: WallCell;
}

/** 嶺上牌の山の数。嶺上牌は8枚固定。 */
const RINSHAN_COLUMNS = 4;

/**
 * 画面に描く山の並び。左から、嶺上牌、ドラ表示の山（上が表示牌、下が裏ドラ）、ツモ山。
 * 画面データには山の中身がないので、枚数と表示牌だけから組み立てる。
 * @param rinshanLeft 残っている嶺上牌の枚数
 */
export function wallColumns(params: {
  wallCount: number;
  doraIndicators: readonly TileId[];
  rinshanLeft: number;
}): WallColumn[] {
  const { wallCount, doraIndicators, rinshanLeft } = params;
  const columns: WallColumn[] = [];

  // 嶺上牌は左の山の上から順に取る
  const taken = RINSHAN_COLUMNS * 2 - rinshanLeft;
  for (let i = 0; i < RINSHAN_COLUMNS; i++) {
    columns.push({
      part: "rinshan",
      top: taken > i * 2 ? "empty" : "back",
      bottom: taken > i * 2 + 1 ? "empty" : "back",
    });
  }

  for (const dora of doraIndicators) {
    columns.push({ part: "dora", top: { dora }, bottom: "back" });
  }

  // ツモ山は右端の上から順に取る。奇数なら右端は下の牌だけ
  const full = Math.floor(wallCount / 2);
  for (let i = 0; i < full; i++) {
    const last = i === full - 1 && wallCount % 2 === 0;
    columns.push({ part: "live", top: last ? "next" : "back", bottom: "back" });
  }
  if (wallCount % 2 === 1) {
    columns.push({ part: "live", top: "empty", bottom: "next" });
  }
  return columns;
}

/**
 * ドラ表示牌から、実際のドラ（表示牌の次の牌）を返す。
 * 絵柄を出すためのもので、その種類の通常の牌を1枚ずつ返す。
 */
export function doraTiles(indicators: readonly TileId[]): TileId[] {
  return indicators.map((id) => plainTileOf(doraKind(tileOf(id).kind)));
}
