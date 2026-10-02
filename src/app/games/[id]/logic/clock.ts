import type { Seat } from "@/engine";
import type { PlayerView } from "@/server/table";

/**
 * フェーズ8より前に保存された画面データ（終わった対局など）には持ち時間の項目がない。
 * 期限なし、自動なしとして補う。
 */
export function withClockFields(view: PlayerView): PlayerView {
  const raw: Partial<PlayerView> = view;
  return {
    ...view,
    deadline: raw.deadline ?? null,
    serverNow: raw.serverNow ?? 0,
    bank: raw.bank ?? 0,
    auto: raw.auto ?? [false, false, false],
  };
}

/**
 * サーバーの時計との差（自分の時計 − サーバーの時計）を見積もる。
 * 通信の遅れや、取り直した古い画面データでは差が大きく出るので、最小値を採る。
 * @param serverNow サーバーが付けた時刻。0 は「付いていない」で、使わない。
 */
export function estimateOffset(
  previous: number | null,
  receivedAt: number,
  serverNow: number,
): number | null {
  if (serverNow === 0) return previous;
  const sample = receivedAt - serverNow;
  return previous === null ? sample : Math.min(previous, sample);
}

/**
 * 残り時間の表示。
 * @param bankMs 手番のときの自分の持ち時間。手番以外は null。
 *   手番では、基本の時間が残っている間はその秒数、切れたら持ち時間を「+12」の形で出す。
 */
export function clockLabel(remainingMs: number, bankMs: number | null): string {
  const seconds = (ms: number) => Math.max(0, Math.ceil(ms / 1000));
  if (bankMs === null || bankMs === 0) return String(seconds(remainingMs));
  return remainingMs > bankMs
    ? String(seconds(remainingMs - bankMs))
    : `+${seconds(remainingMs)}`;
}

/** 期限を過ぎてから時間切れを申告するまでの間。3人が同時に送らないよう席でずらす。 */
export function tickDelayMs(seat: Seat): number {
  return 300 + seat * 200;
}
