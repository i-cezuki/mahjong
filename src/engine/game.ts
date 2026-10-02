import { finalPayout, rankSeats } from "./payout";
import { applyAction, startRound } from "./round";
import { IllegalActionError } from "./state";
import type { Action, RoundEvent, RoundOutcome, RoundState } from "./state";
import { SEATS } from "./wall";
import type { PerSeat, Seat } from "./wall";

const START_POINTS = 30000;
/** 東場と南場の局数 */
const ROUNDS_PER_WIND = 3;
/** 南3局 */
const LAST_ROUND_INDEX = ROUNDS_PER_WIND * 2 - 1;

export interface GameResult {
  /** 残った供託をトップに加えた最終の持ち点 */
  points: PerSeat<number>;
  /** 1着から順の席 */
  ranking: Seat[];
  /** 支払い表の枚数（スコア） */
  payout: PerSeat<number>;
  /** 祝儀の枚数 */
  chips: PerSeat<number>;
}

export interface GameState {
  phase: "playing" | "ended";
  /** 起家 */
  firstDealer: Seat;
  /** 0〜2が東1〜3局、3〜5が南1〜3局、6以降はサドンデス */
  roundIndex: number;
  honba: number;
  /** 終わった局までの祝儀の累計 */
  chips: PerSeat<number>;
  /** 進行中の局。持ち点と供託はこの中にある。 */
  round: RoundState;
  result: GameResult | null;
}

/** nextRound はサーバーが出す操作。次の局の乱数の種を渡す。 */
export type GameAction = Action | { type: "nextRound"; seed: string };

export type GameEvent =
  | RoundEvent
  | { type: "roundStart"; roundIndex: number; honba: number; dealer: Seat }
  | { type: "gameEnd"; result: GameResult };

export interface GameStep {
  state: GameState;
  events: GameEvent[];
}

export type NextPlan =
  { end: true } | { end: false; roundIndex: number; honba: number };

export function dealerOf(firstDealer: Seat, roundIndex: number): Seat {
  return ((firstDealer + roundIndex) % 3) as Seat;
}

export function roundWindOf(roundIndex: number): "1z" | "2z" {
  return roundIndex < ROUNDS_PER_WIND ? "1z" : "2z";
}

/**
 * 局が終わったあと、次にどの局を打つか（または終局か）を決める。
 * points は精算後の持ち点。
 */
export function planNext(params: {
  firstDealer: Seat;
  roundIndex: number;
  honba: number;
  points: PerSeat<number>;
  outcome: Pick<RoundOutcome, "type" | "dealerWon" | "dealerTenpai">;
}): NextPlan {
  const { firstDealer, roundIndex, points, outcome } = params;

  // 飛び。0点ちょうども含む
  if (points.some((p) => p <= 0)) return { end: true };

  const isWin = outcome.type === "win";
  // 流局は必ず本場＋1。子の和了だけ0に戻る
  const honba = isWin && !outcome.dealerWon ? 0 : params.honba + 1;
  const dealerContinues = isWin ? outcome.dealerWon : outcome.dealerTenpai;
  const allEven = points.every((p) => p === START_POINTS);

  // サドンデス：3人同点でなくなるまで、親を順番に回して続ける
  if (roundIndex > LAST_ROUND_INDEX) {
    return allEven
      ? { end: false, roundIndex: roundIndex + 1, honba }
      : { end: true };
  }

  if (roundIndex === LAST_ROUND_INDEX) {
    const dealer = dealerOf(firstDealer, roundIndex);
    const soleTop = SEATS.every(
      (seat) => seat === dealer || points[dealer] > points[seat],
    );
    if (dealerContinues && !soleTop) return { end: false, roundIndex, honba };
    return allEven
      ? { end: false, roundIndex: roundIndex + 1, honba }
      : { end: true };
  }

  return {
    end: false,
    roundIndex: dealerContinues ? roundIndex : roundIndex + 1,
    honba,
  };
}

/** 終局の精算。残った供託はトップが取る。 */
export function finalizeGame(params: {
  firstDealer: Seat;
  points: PerSeat<number>;
  kyotaku: number;
  chips: PerSeat<number>;
}): GameResult {
  const { firstDealer, kyotaku } = params;
  const points: PerSeat<number> = [...params.points];
  points[rankSeats(points, firstDealer)[0]!] += kyotaku;
  return {
    points,
    ranking: rankSeats(points, firstDealer),
    payout: finalPayout(points, firstDealer),
    chips: [...params.chips],
  };
}

export function startGame(params: {
  seed: string;
  firstDealer: Seat;
}): GameStep {
  const { seed, firstDealer } = params;
  const step = startRound({ seed, dealer: firstDealer, firstDealer });
  return {
    state: {
      phase: "playing",
      firstDealer,
      roundIndex: 0,
      honba: 0,
      chips: [0, 0, 0],
      round: step.state,
      result: null,
    },
    events: [
      { type: "roundStart", roundIndex: 0, honba: 0, dealer: firstDealer },
      ...step.events,
    ],
  };
}

function planFor(game: GameState): NextPlan {
  return planNext({
    firstDealer: game.firstDealer,
    roundIndex: game.roundIndex,
    honba: game.honba,
    points: game.round.points,
    outcome: game.round.outcome!,
  });
}

/** 操作を適用した新しい状態とイベントを返す。不正な操作は IllegalActionError。 */
export function applyGameAction(game: GameState, action: GameAction): GameStep {
  if (game.phase === "ended") throw new IllegalActionError("gameEnded");

  if (action.type === "nextRound") {
    if (game.round.phase !== "ended")
      throw new IllegalActionError("notAllowed");
    const plan = planFor(game);
    // 終局なら局が終わった時点で phase が ended になっているので、ここには来ない
    if (plan.end) throw new IllegalActionError("gameEnded");

    const dealer = dealerOf(game.firstDealer, plan.roundIndex);
    const step = startRound({
      seed: action.seed,
      dealer,
      firstDealer: game.firstDealer,
      roundWind: roundWindOf(plan.roundIndex),
      honba: plan.honba,
      kyotaku: game.round.kyotaku,
      points: game.round.points,
      // 古い対局には記録がない。startRound が全員未使用として扱う
      ...(game.round.doubleStakeUsed && {
        doubleStakeUsed: game.round.doubleStakeUsed,
      }),
    });
    return {
      state: {
        ...game,
        roundIndex: plan.roundIndex,
        honba: plan.honba,
        round: step.state,
      },
      events: [
        {
          type: "roundStart",
          roundIndex: plan.roundIndex,
          honba: plan.honba,
          dealer,
        },
        ...step.events,
      ],
    };
  }

  const step = applyAction(game.round, action);
  const state: GameState = { ...game, round: step.state };
  const events: GameEvent[] = [...step.events];

  // サイコロチャンスまで終わって、局が完全に終わったとき
  if (step.state.phase === "ended") {
    const chips: PerSeat<number> = [...game.chips];
    for (const seat of SEATS) chips[seat] += step.state.chipDeltas[seat];
    state.chips = chips;

    if (planFor(state).end) {
      state.phase = "ended";
      state.result = finalizeGame({
        firstDealer: game.firstDealer,
        points: step.state.points,
        kyotaku: step.state.kyotaku,
        chips,
      });
      events.push({ type: "gameEnd", result: state.result });
    }
  }
  return { state, events };
}
