import type { Seat } from "@/engine";
import type { PlayerView } from "@/server/table";

/**
 * フェーズ8より前に保存された画面データ（終わった対局など）には持ち時間の項目がない。
 * 期限なし、自動なしとして補う。オープンリーチの手牌も、それより前の画面データにはない。
 */
export function withClockFields(view: PlayerView): PlayerView {
  const raw: Partial<PlayerView> = view;
  return {
    ...view,
    deadline: raw.deadline ?? null,
    // 席ごとの期限より前の画面データでは、待たれている人の期限は共通の1つだった
    myDeadline:
      raw.myDeadline !== undefined
        ? raw.myDeadline
        : view.actions.length > 0
          ? (raw.deadline ?? null)
          : null,
    startedAt: raw.startedAt ?? null,
    serverNow: raw.serverNow ?? 0,
    bank: raw.bank ?? 0,
    auto: raw.auto ?? [false, false, false],
    // 長考ボタンより前に保存された画面データにはない
    canThink: raw.canThink ?? false,
    thinking: raw.thinking ?? false,
    // オープンリーチより前に保存された画面データにはない
    openHands: raw.openHands ?? [null, null, null],
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

export interface ClockDisplay {
  /** 表示する秒数 */
  seconds: number;
  /**
   * いま減っている時間。base は基本の時間、think は長考ボタンの30秒、
   * reserve は基本の時間（または30秒）を使い切ったあとの持ち時間（長考）
   */
  stage: "base" | "think" | "reserve";
}

/**
 * 残り時間の表示。期限はサーバーの時刻なので、表示がずれても進行は変わらない。
 * @param bankMs 手番と応答のときの自分の持ち時間。サイコロの指定と局の結果は null。
 *   基本の時間が残っている間はその秒数（5→1）、切れたら持ち時間の秒数（長考 20→）を出す。
 * @param thinking 長考ボタンを押した判断。基本の時間の代わりに30秒（30→1）を数える。
 */
export function clockDisplay(
  remainingMs: number,
  bankMs: number | null,
  thinking = false,
): ClockDisplay {
  const seconds = (ms: number) => Math.max(0, Math.ceil(ms / 1000));
  const first = thinking ? "think" : "base";
  if (bankMs === null || bankMs === 0) {
    return { seconds: seconds(remainingMs), stage: first };
  }
  return remainingMs > bankMs
    ? { seconds: seconds(remainingMs - bankMs), stage: first }
    : { seconds: seconds(remainingMs), stage: "reserve" };
}

/** 期限を過ぎてから時間切れを申告するまでの間。3人が同時に送らないよう席でずらす。 */
export function tickDelayMs(seat: Seat): number {
  return 300 + seat * 200;
}
