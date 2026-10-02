import { SEATS } from "./wall";
import type { PerSeat, Seat } from "./wall";

export interface WinPoints {
  /** ロンで放銃者が払う点数 */
  ron: number;
  /** ツモで子が払う点数（親の和了なら2人ともこの額） */
  tsumoFromChild: number;
  /** 子のツモで親が払う点数（親の和了なら0） */
  tsumoFromDealer: number;
}

/** [翻の下限, 子ロン, 子ツモの子払い, 子ツモの親払い, 親ロン, 親ツモ] */
const TABLE = [
  [13, 32000, 12000, 20000, 48000, 24000],
  [11, 24000, 8000, 16000, 36000, 18000],
  [8, 16000, 6000, 10000, 24000, 12000],
  [6, 12000, 4000, 8000, 18000, 9000],
  [4, 8000, 3000, 5000, 12000, 6000],
  [3, 4000, 1000, 3000, 6000, 3000],
  [2, 2000, 1000, 1000, 4000, 2000],
  [1, 1000, 1000, 1000, 2000, 1000],
] as const;

const HONBA_POINTS = 1000;

/**
 * 点数表を引く。符計算はない。
 * yakuman が1以上なら役満の点数にその数を掛ける。0で13翻以上なら数え役満。
 */
export function winPoints(params: {
  han: number;
  yakuman: number;
  isDealer: boolean;
}): WinPoints {
  const { han, yakuman, isDealer } = params;
  const row = TABLE.find(([minHan]) => (yakuman > 0 ? 13 : han) >= minHan);
  if (row === undefined) throw new RangeError(`翻数が不正です: ${han}`);

  const multiplier = Math.max(yakuman, 1);
  const [, childRon, fromChild, fromDealer, dealerRon, dealerTsumo] = row;
  return isDealer
    ? {
        ron: dealerRon * multiplier,
        tsumoFromChild: dealerTsumo * multiplier,
        tsumoFromDealer: 0,
      }
    : {
        ron: childRon * multiplier,
        tsumoFromChild: fromChild * multiplier,
        tsumoFromDealer: fromDealer * multiplier,
      };
}

/**
 * 和了1件の点棒の移動を返す。loser が null ならツモ。
 * 本場はロンなら放銃者が、ツモなら2人がそれぞれ1本につき1000点払う。供託は和了者が取る。
 */
export function settleWin(params: {
  winner: Seat;
  loser: Seat | null;
  dealer: Seat;
  han: number;
  yakuman: number;
  honba: number;
  kyotaku: number;
}): PerSeat<number> {
  const { winner, loser, dealer, honba, kyotaku } = params;
  if (loser === winner) throw new Error("和了者と放銃者が同じです");

  const points = winPoints({ ...params, isDealer: winner === dealer });
  const bonus = honba * HONBA_POINTS;
  const deltas: PerSeat<number> = [0, 0, 0];

  for (const seat of SEATS) {
    if (seat === winner) continue;
    let payment = 0;
    if (loser === null) {
      payment =
        (seat === dealer ? points.tsumoFromDealer : points.tsumoFromChild) +
        bonus;
    } else if (seat === loser) {
      payment = points.ron + bonus;
    }
    deltas[seat] -= payment;
    deltas[winner] += payment;
  }
  deltas[winner] += kyotaku;
  return deltas;
}
