import { SEATS } from "@/engine";
import type { Seat } from "@/engine";
import type { PlayerView } from "@/server/table";

/** 卓に大きく出す発声の種類。 */
export type CallKind =
  | "riichi"
  | "doubleStakeRiichi"
  | "openRiichi"
  | "pon"
  | "kan"
  | "ron"
  | "tsumo"
  | "pocchi";

export interface Call {
  seat: Seat;
  kind: CallKind;
}

export const CALL_LABELS: Record<CallKind, string> = {
  riichi: "リーチ",
  doubleStakeRiichi: "2倍リーチ",
  openRiichi: "オープンリーチ",
  pon: "ポン",
  kan: "カン",
  ron: "ロン",
  tsumo: "ツモ",
  pocchi: "ポッチ",
};

/** 和了の発声。出している間は、局の結果を出すのを待つ。 */
export function isWinCall(call: Call): boolean {
  return call.kind === "ron" || call.kind === "tsumo" || call.kind === "pocchi";
}

/**
 * 前の画面データと比べて、新しく起きた発声を出す。
 * リーチ、鳴き、和了の順。局が変わったときは出さない。
 */
export function detectCalls(before: PlayerView, after: PlayerView): Call[] {
  if (before.roundIndex !== after.roundIndex || before.honba !== after.honba) {
    return [];
  }
  const calls: Call[] = [];

  for (const seat of SEATS) {
    const riichi = after.riichi[seat];
    if (riichi && !before.riichi[seat]) {
      calls.push({
        seat,
        kind: riichi.doubleStake
          ? "doubleStakeRiichi"
          : riichi.open
            ? "openRiichi"
            : "riichi",
      });
    }
  }

  for (const seat of SEATS) {
    const was = before.melds[seat];
    const now = after.melds[seat];
    const added = now[now.length - 1];
    if (now.length > was.length && added) {
      calls.push({ seat, kind: added.type === "pon" ? "pon" : "kan" });
    } else if (
      // 加槓は、ポンした面子が槓子に変わる
      now.some((meld, i) => meld.type === "kakan" && was[i]?.type === "pon")
    ) {
      calls.push({ seat, kind: "kan" });
    }
  }

  if (!before.outcome && after.outcome) {
    for (const win of after.outcome.wins) {
      // 流し役満は流局のあとの精算で、発声はない
      if (win.kind === "nagashi") continue;
      calls.push({
        seat: win.seat,
        kind: win.kind === "ron" || win.kind === "tsumo" ? win.kind : "pocchi",
      });
    }
  }
  return calls;
}

/**
 * 前の画面データと比べて、いま手牌から切った（手出しした）相手の席を出す。
 * ツモ切りと自分の打牌は出さない。局が変わったときも出さない。
 */
export function detectTedashi(before: PlayerView, after: PlayerView): Seat[] {
  if (before.roundIndex !== after.roundIndex || before.honba !== after.honba) {
    return [];
  }
  return SEATS.filter((seat) => {
    if (seat === after.seat) return false;
    const river = after.rivers[seat];
    const last = river[river.length - 1];
    return (
      river.length > before.rivers[seat].length &&
      last !== undefined &&
      !last.tsumogiri
    );
  });
}
