import type { TileId } from "@/engine";
import type { TableAction } from "@/server/table";

type Of<T extends TableAction["type"]> = Extract<TableAction, { type: T }>;

/** サーバーから届いた「いま可能な操作」を、画面の部品ごとにまとめたもの。 */
export interface ActionMenu {
  /** 切れる牌 */
  discards: TileId[];
  /** リーチして切れる牌（通常と2倍で同じ） */
  riichiTiles: TileId[];
  tsumo: TableAction | null;
  ron: TableAction | null;
  pons: Of<"pon">[];
  minkan: TableAction | null;
  ankans: Of<"ankan">[];
  kakans: Of<"kakan">[];
  pass: TableAction | null;
  confirm: TableAction | null;
  dice: Of<"dice">[];
}

export function buildMenu(actions: readonly TableAction[]): ActionMenu {
  const all = <T extends TableAction["type"]>(type: T) =>
    actions.filter((a): a is Of<T> => a.type === type);
  const one = (type: TableAction["type"]) =>
    actions.find((a) => a.type === type) ?? null;
  return {
    discards: all("discard").map((a) => a.tile),
    riichiTiles: [...new Set(all("riichi").map((a) => a.tile))],
    tsumo: one("tsumo"),
    ron: one("ron"),
    pons: all("pon"),
    minkan: one("minkan"),
    ankans: all("ankan"),
    kakans: all("kakan"),
    pass: one("pass"),
    confirm: one("confirm"),
    dice: all("dice"),
  };
}

export interface AutoSettings {
  /** ツモとロンを自動で送る */
  autoWin: boolean;
  /** ポンと大明槓しかできない応答を自動でスキップする */
  noCall: boolean;
}

/**
 * 自動で送る操作。なければ null。
 * 切り替えボタンの設定のほかに、リーチ後は和了牌以外をツモ切りする。
 * @param inRiichi 自分がリーチしている
 */
export function autoAction(
  actions: readonly TableAction[],
  settings: AutoSettings,
  inRiichi: boolean,
): TableAction | null {
  const menu = buildMenu(actions);
  const win = menu.tsumo ?? menu.ron;
  if (settings.autoWin && win) return win;
  // ロンができるときは本人に選ばせる
  if (settings.noCall && menu.pass && !menu.ron) return menu.pass;
  // リーチ後に切れるのはツモ牌だけ。和了や暗槓を選べるときは本人に任せる
  const [drawn] = menu.discards;
  const mustDiscard = actions.length === 1 && drawn !== undefined;
  if (inRiichi && mustDiscard) return actions[0]!;
  return null;
}
