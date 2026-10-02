import { SEATS } from "./wall";
import type { PerSeat, Seat } from "./wall";
import type { WinResult } from "./yaku";

const RED_CHIPS = 1;
const GOLD_CHIPS = 2;
const IPPATSU_CHIPS = 1;
const YAKUMAN_RON_CHIPS = 20;
const YAKUMAN_TSUMO_CHIPS = 10;

/**
 * 和了で、支払う1人あたりが出す祝儀の枚数を返す。
 * ロンなら放銃者が、ツモなら2人がそれぞれこの枚数を払う。飛び賞は含まない。
 */
export function winChips(params: {
  result: WinResult;
  tsumo: boolean;
  /** リーチ一発が成立している */
  ippatsu: boolean;
  /** 和了者が2倍リーチをしている */
  doubleStake: boolean;
}): number {
  const { result, tsumo, ippatsu, doubleStake } = params;
  const chips =
    result.dora.red * RED_CHIPS +
    result.dora.gold * GOLD_CHIPS +
    result.uraChipCount +
    (ippatsu ? IPPATSU_CHIPS : 0) +
    result.yakuman * (tsumo ? YAKUMAN_TSUMO_CHIPS : YAKUMAN_RON_CHIPS);
  return doubleStake ? chips * 2 : chips;
}

/** 祝儀の移動を返す。loser が null ならツモで、2人がそれぞれ chips 枚を払う。 */
export function settleChips(params: {
  winner: Seat;
  loser: Seat | null;
  chips: number;
}): PerSeat<number> {
  const { winner, loser, chips } = params;
  const deltas: PerSeat<number> = [0, 0, 0];
  for (const seat of SEATS) {
    if (seat === winner || (loser !== null && seat !== loser)) continue;
    deltas[seat] -= chips;
    deltas[winner] += chips;
  }
  return deltas;
}
