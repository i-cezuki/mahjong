import type { PerSeat } from "@/engine";
import type { PlayerView } from "@/server/table";

/**
 * 打牌のあと、次の人のツモをまだ見せない間か。
 * サーバーはツモを見せるまでの間を乱数で決め、待ちの開始（startedAt）をその分だけ保存時刻より後ろにずらす。
 * @param now サーバーの現在時刻の見積もり
 */
export function isDrawHeld(view: PlayerView, now: number): boolean {
  return (
    view.roundPhase === "awaitTurnAction" &&
    view.startedAt !== null &&
    view.startedAt > view.serverNow &&
    now < view.startedAt
  );
}

function replaceAt<T>(values: PerSeat<T>, seat: number, value: T): PerSeat<T> {
  const next: PerSeat<T> = [...values];
  next[seat as 0 | 1 | 2] = value;
  return next;
}

/**
 * ツモを見せる前の画面データ。ツモで変わる項目（山の残り、手番の人の手牌と枚数、花牌）だけを、
 * ひとつ前の画面データのままにする。打牌や手番の移動はそのまま見せる。
 * @param previous ひとつ前の版の画面データ
 */
export function heldView(previous: PlayerView, view: PlayerView): PlayerView {
  const turn = view.turn;
  return {
    ...view,
    hand: turn === view.seat ? previous.hand : view.hand,
    drawn: null,
    actions: [],
    myDeadline: null,
    wallCount: previous.wallCount,
    handCounts: replaceAt(view.handCounts, turn, previous.handCounts[turn]),
    flowers: replaceAt(view.flowers, turn, previous.flowers[turn]),
    openHands: replaceAt(view.openHands, turn, previous.openHands[turn]),
  };
}
