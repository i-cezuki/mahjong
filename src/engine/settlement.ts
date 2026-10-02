import { waitingKinds } from "./agari";
import { settleChips, winChips } from "./chips";
import { rankSeats } from "./payout";
import { settleWin, winPoints } from "./score";
import type {
  DiceChance,
  RoundEvent,
  RoundOutcome,
  RoundState,
  WinKind,
  WinRecord,
} from "./state";
import { isYaochu, plainTileOf, tileOf } from "./tiles";
import type { TileId } from "./tiles";
import { SEATS, nextSeat } from "./wall";
import type { PerSeat, Seat } from "./wall";
import { evaluateWin } from "./yaku";
import type { Wind, WinInput, WinResult } from "./yaku";

const NOTEN_PAYMENT = 1000;
const TOBI_CHIPS = 2;
const NAGASHI_CHIPS = 10;
const DICE_CHIPS = 70;
const WINDS: readonly Wind[] = ["1z", "2z", "3z"];

interface WinDraft {
  seat: Seat;
  from: Seat | null;
  kind: WinKind;
  winTile: TileId | null;
  result: WinResult | null;
}

export function seatWindOf(state: RoundState, seat: Seat): Wind {
  return WINDS[(seat - state.dealer + 3) % 3]!;
}

/** 打牌した人から見て手番が近い順に並べる。 */
export function orderFrom(start: Seat, seats: readonly Seat[]): Seat[] {
  const order = [start, nextSeat(start), nextSeat(nextSeat(start))];
  return order.filter((seat) => seats.includes(seat));
}

/**
 * 和了の判定に渡す入力を作る。
 * ツモなら state.drawn を手牌から除いて winTile を和了牌とする（ポッチは高め取りした牌を渡す）。
 */
export function buildWinInput(
  state: RoundState,
  seat: Seat,
  winTile: TileId,
  tsumo: boolean,
): WinInput {
  const hand = state.hands[seat];
  const riichi = state.riichi[seat];
  const lastTile = state.wall.live.length === 0;
  return {
    concealed: tsumo ? hand.filter((id) => id !== state.drawn) : hand,
    winTile,
    melds: state.melds[seat],
    flowers: state.flowers[seat],
    tsumo,
    seatWind: seatWindOf(state, seat),
    roundWind: state.roundWind,
    riichi: riichi
      ? riichi.doubleRiichi
        ? "doubleRiichi"
        : "riichi"
      : undefined,
    ippatsu: riichi?.ippatsu ?? false,
    lastTile: lastTile && !(tsumo && state.rinshanDraw),
    rinshan: tsumo && state.rinshanDraw,
    firstTurn: tsumo && !state.anyCall && state.rivers[seat].length === 0,
    doraIndicators: state.wall.doraIndicators,
    uraIndicators: state.wall.uraIndicators,
  };
}

/** ノーテン罰符。1人テンパイは2人から1000ずつ、2人テンパイはノーテンの1人が1000ずつ。 */
export function notenPayments(tenpai: readonly Seat[]): PerSeat<number> {
  const deltas: PerSeat<number> = [0, 0, 0];
  if (tenpai.length === 0 || tenpai.length === 3) return deltas;
  for (const payer of SEATS.filter((seat) => !tenpai.includes(seat))) {
    for (const receiver of tenpai) {
      deltas[payer] -= NOTEN_PAYMENT;
      deltas[receiver] += NOTEN_PAYMENT;
    }
  }
  return deltas;
}

function addInto(target: PerSeat<number>, deltas: PerSeat<number>): void {
  for (const seat of SEATS) target[seat] += deltas[seat];
}

function negate(deltas: PerSeat<number>): PerSeat<number> {
  return [-deltas[0] + 0, -deltas[1] + 0, -deltas[2] + 0];
}

export function settleTsumo(
  state: RoundState,
  seat: Seat,
  events: RoundEvent[],
): void {
  const winTile = state.drawn!;
  const result = evaluateWin(buildWinInput(state, seat, winTile, true));
  if (result === null) throw new Error("和了できない手です");
  settleWins(
    state,
    [{ seat, from: null, kind: "tsumo", winTile, result }],
    events,
  );
}

/** winners は放銃者に近い順。 */
export function settleRon(
  state: RoundState,
  winners: readonly Seat[],
  from: Seat,
  tile: TileId,
  events: RoundEvent[],
): void {
  const drafts = winners.map((seat): WinDraft => {
    const result = evaluateWin(buildWinInput(state, seat, tile, false));
    if (result === null) throw new Error("和了できない手です");
    return { seat, from, kind: "ron", winTile: tile, result };
  });
  settleWins(state, drafts, events);
}

/**
 * リーチ中に引いたポッチ・逆ポッチの和了。
 * 待ち牌のうち、裏ドラ込みで最も高くなる牌（同点なら祝儀の多い牌）でツモ和了したことにする。
 */
export function settlePocchi(
  state: RoundState,
  seat: Seat,
  events: RoundEvent[],
): void {
  const pocchi = state.drawn!;
  const concealed = state.hands[seat].filter((id) => id !== pocchi);
  const isDealer = seat === state.dealer;
  const riichi = state.riichi[seat]!;

  let best: {
    winTile: TileId;
    result: WinResult;
    points: number;
    chips: number;
  } | null = null;
  for (const kind of waitingKinds(concealed, state.melds[seat])) {
    const winTile = plainTileOf(kind);
    const result = evaluateWin(buildWinInput(state, seat, winTile, true));
    if (result === null) continue;
    const table = winPoints({ ...result, isDealer });
    const points =
      table.tsumoFromChild +
      (isDealer ? table.tsumoFromChild : table.tsumoFromDealer);
    const chips = winChips({
      result,
      tsumo: true,
      ippatsu: riichi.ippatsu,
      doubleStake: riichi.doubleStake,
    });
    if (
      best === null ||
      points > best.points ||
      (points === best.points && chips > best.chips)
    ) {
      best = { winTile, result, points, chips };
    }
  }
  if (best === null) throw new Error("リーチ中なのに待ちがありません");

  const kind =
    tileOf(pocchi).variant === "reversePocchi" ? "reversePocchi" : "pocchi";
  settleWins(
    state,
    [{ seat, from: null, kind, winTile: best.winTile, result: best.result }],
    events,
  );
}

/** ツモり切ったあとの精算。流し役満があれば和了として扱い、なければノーテン罰符。 */
export function settleExhaustiveDraw(
  state: RoundState,
  events: RoundEvent[],
): void {
  const nagashi = orderFrom(state.dealer, SEATS).filter((seat) => {
    const river = state.rivers[seat];
    return (
      river.length > 0 &&
      river.every((d) => !d.called && isYaochu(tileOf(d.tile).kind))
    );
  });
  if (nagashi.length > 0) {
    settleWins(
      state,
      nagashi.map((seat) => ({
        seat,
        from: null,
        kind: "nagashi",
        winTile: null,
        result: null,
      })),
      events,
    );
    return;
  }

  const tenpai = SEATS.filter(
    (seat) => waitingKinds(state.hands[seat], state.melds[seat]).length > 0,
  );
  const pointDeltas = notenPayments(tenpai);
  addInto(state.points, pointDeltas);
  finishRound(
    state,
    {
      type: "exhaustiveDraw",
      wins: [],
      tenpai,
      dealerWon: false,
      dealerTenpai: tenpai.includes(state.dealer),
      pointDeltas,
    },
    new Map(),
    events,
  );
}

/**
 * 和了の精算。drafts の先頭の人が供託と本場を取る。
 * 逆ポッチは、ツモで受け取るはずだった点数と祝儀を本人が2人に払う（供託は本人が回収する）。
 */
function settleWins(
  state: RoundState,
  drafts: readonly WinDraft[],
  events: RoundEvent[],
): void {
  const wins: WinRecord[] = [];
  const pointDeltas: PerSeat<number> = [0, 0, 0];
  /** 飛んだときに飛び賞を受け取る和了者（直接点棒を払った相手） */
  const paidTo = new Map<Seat, Seat>();

  drafts.forEach((draft, index) => {
    const { seat, from, kind, result } = draft;
    const others = SEATS.filter((s) => s !== seat);
    const riichi = state.riichi[seat];
    const doubleStake = riichi?.doubleStake ?? false;
    const ippatsu = riichi?.ippatsu ?? false;
    const reverse = kind === "reversePocchi";
    const first = index === 0;

    const base = settleWin({
      winner: seat,
      loser: from,
      dealer: state.dealer,
      han: result?.han ?? 13,
      yakuman: result?.yakuman ?? 1,
      honba: first ? state.honba : 0,
      kyotaku: 0,
    });
    const points = reverse ? negate(base) : base;
    if (first) points[seat] += state.kyotaku;

    const chipsPerPayer = result
      ? winChips({ result, tsumo: from === null, ippatsu, doubleStake })
      : NAGASHI_CHIPS * (doubleStake ? 2 : 1);
    const chipBase = settleChips({
      winner: seat,
      loser: from,
      chips: chipsPerPayer,
    });
    const chips = reverse ? negate(chipBase) : chipBase;

    const chances =
      (state.flowers[seat].length === 4 ? 1 : 0) +
      (result?.yakuman ?? 1) +
      ((kind === "pocchi" || reverse) && ippatsu ? 1 : 0);
    const payers = from === null ? others : [from];
    const chance: DiceChance = {
      seat,
      chipsPerHit: DICE_CHIPS * (doubleStake ? 2 : 1),
      transfers: reverse
        ? others.map((other): [Seat, Seat] => [seat, other])
        : payers.map((payer): [Seat, Seat] => [payer, seat]),
    };
    for (let i = 0; i < chances; i++) state.dice.push(structuredClone(chance));

    if (!reverse) {
      for (const payer of payers) {
        if (!paidTo.has(payer)) paidTo.set(payer, seat);
      }
    }

    addInto(pointDeltas, points);
    wins.push({ ...draft, pointDeltas: points, chipDeltas: chips });
  });

  addInto(state.points, pointDeltas);
  state.kyotaku = 0;

  finishRound(
    state,
    {
      type: "win",
      wins,
      tenpai: [],
      dealerWon: wins.some((win) => win.seat === state.dealer),
      dealerTenpai: false,
      pointDeltas,
    },
    paidTo,
    events,
  );
}

/** 飛び賞を付けて局を終える。サイコロチャンスが残っていればその待ちに入る。 */
function finishRound(
  state: RoundState,
  base: Pick<
    RoundOutcome,
    "type" | "wins" | "tenpai" | "dealerWon" | "dealerTenpai" | "pointDeltas"
  >,
  paidTo: ReadonlyMap<Seat, Seat>,
  events: RoundEvent[],
): void {
  const chipDeltas: PerSeat<number> = [0, 0, 0];
  for (const win of base.wins) addInto(chipDeltas, win.chipDeltas);

  // 持ち点が0以下の人は飛び。直接飛ばした和了者がいなければ、その時点のトップが受け取る
  const top = rankSeats(state.points, state.firstDealer)[0]!;
  const tobi: RoundOutcome["tobi"] = [];
  for (const seat of SEATS) {
    if (state.points[seat] > 0) continue;
    const to = paidTo.get(seat) ?? top;
    if (to === seat) continue;
    chipDeltas[seat] -= TOBI_CHIPS;
    chipDeltas[to] += TOBI_CHIPS;
    tobi.push({ seat, to });
  }
  addInto(state.chipDeltas, chipDeltas);

  const riichiWon = base.wins.some((win) => state.riichi[win.seat] !== null);
  const outcome: RoundOutcome = {
    ...base,
    chipDeltas,
    tobi,
    uraIndicators: riichiWon ? [...state.wall.uraIndicators] : [],
  };
  state.outcome = outcome;
  state.pending = null;
  state.phase = state.dice.length > 0 ? "diceChance" : "ended";
  events.push({ type: "roundEnd", outcome: structuredClone(outcome) });
}
