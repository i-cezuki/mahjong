import type { Discard, PerSeat } from "@/engine";
import type { PlayerView, TableAction } from "@/server/table";

/** 席ごとの値のうち、1人分だけを置き換える。 */
function replaceAt<T>(values: PerSeat<T>, seat: number, value: T): PerSeat<T> {
  const next: PerSeat<T> = [...values];
  next[seat as 0 | 1 | 2] = value;
  return next;
}

/**
 * サーバーの応答を待たずに、自分の操作の結果を先に画面へ出すための画面データを作る。
 * 結果が自分の手元だけで決まる操作（打牌、リーチ、スキップ、局の結果の確認）だけを扱う。
 * ツモや鳴きのように、サーバーでないと結果が決まらない操作は null（応答を待つ）。
 * 応答が返るまで次の操作をさせないよう、操作の一覧と期限は空にする。
 * サーバーに拒否されたら、呼び出す側が元の画面データに戻す。
 */
export function optimisticView(
  view: PlayerView,
  action: TableAction,
): PlayerView | null {
  const { seat } = action;
  const waiting = { actions: [], deadline: null, myDeadline: null };

  switch (action.type) {
    case "discard":
    case "riichi": {
      const { tile } = action;
      const declaring = action.type === "riichi";
      const discard: Discard = {
        tile,
        tsumogiri: tile === view.drawn,
        ...(declaring && { riichi: true }),
      };
      return {
        ...view,
        ...waiting,
        hand: view.hand.filter((id) => id !== tile),
        drawn: null,
        handCounts: replaceAt(view.handCounts, seat, view.handCounts[seat] - 1),
        rivers: replaceAt(view.rivers, seat, [...view.rivers[seat], discard]),
        riichi: declaring
          ? replaceAt(view.riichi, seat, {
              doubleStake: action.doubleStake,
              ...(action.open && { open: true }),
            })
          : view.riichi,
      };
    }
    case "pass":
      return { ...view, ...waiting };
    case "confirm":
      return {
        ...view,
        ...waiting,
        confirmed: replaceAt(view.confirmed, seat, true),
      };
    default:
      return null;
  }
}
