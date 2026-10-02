import { describe, expect, it } from "vitest";
import {
  applyGameAction,
  dealerOf,
  finalizeGame,
  planNext,
  roundWindOf,
  startGame,
} from "./game";
import type { GameAction, GameState } from "./game";
import { createRng } from "./rng";
import type { Rng } from "./rng";
import { IllegalActionError, legalActions, startRoundFromDeck } from "./round";
import type { Action, RoundOutcome, RoundSetup, RoundState } from "./round";
import { buildDeck, range, seedOf, tilesInRound } from "./testing";
import type { DeckSpec } from "./testing";
import { rankOf, suitOf, tileOf } from "./tiles";
import { SEATS } from "./wall";
import type { PerSeat, Seat } from "./wall";

type OutcomeSummary = Pick<RoundOutcome, "type" | "dealerWon" | "dealerTenpai">;

const CHILD_WIN: OutcomeSummary = {
  type: "win",
  dealerWon: false,
  dealerTenpai: false,
};
const DEALER_WIN: OutcomeSummary = {
  type: "win",
  dealerWon: true,
  dealerTenpai: false,
};
const DRAW_TENPAI: OutcomeSummary = {
  type: "exhaustiveDraw",
  dealerWon: false,
  dealerTenpai: true,
};
const DRAW_NOTEN: OutcomeSummary = {
  type: "exhaustiveDraw",
  dealerWon: false,
  dealerTenpai: false,
};
const EVEN: PerSeat<number> = [30000, 30000, 30000];

function plan(
  roundIndex: number,
  outcome: OutcomeSummary,
  points: PerSeat<number> = [31000, 30000, 29000],
  honba = 2,
) {
  return planNext({ firstDealer: 0, roundIndex, honba, points, outcome });
}

describe("局の順番", () => {
  it("親は起家から順に回り、サドンデスは起家に戻る", () => {
    expect(range(0, 8).map((index) => dealerOf(0, index))).toEqual([
      0, 1, 2, 0, 1, 2, 0, 1,
    ]);
    expect(dealerOf(1, 4)).toBe(2);
  });

  it("東場は3局、以降は南場", () => {
    expect(range(0, 7).map(roundWindOf)).toEqual([
      "1z",
      "1z",
      "1z",
      "2z",
      "2z",
      "2z",
      "2z",
    ]);
  });
});

describe("planNext（次の局）", () => {
  it("子の和了は親が流れて本場は0に戻る", () => {
    expect(plan(0, CHILD_WIN)).toEqual({ end: false, roundIndex: 1, honba: 0 });
    expect(plan(2, CHILD_WIN)).toEqual({ end: false, roundIndex: 3, honba: 0 });
  });

  it("親の和了は連荘で本場が増える", () => {
    expect(plan(0, DEALER_WIN)).toEqual({
      end: false,
      roundIndex: 0,
      honba: 3,
    });
  });

  it("流局は必ず本場が増え、親がテンパイなら連荘、ノーテンなら親流れ", () => {
    expect(plan(1, DRAW_TENPAI)).toEqual({
      end: false,
      roundIndex: 1,
      honba: 3,
    });
    expect(plan(1, DRAW_NOTEN)).toEqual({
      end: false,
      roundIndex: 2,
      honba: 3,
    });
  });

  it("持ち点が0以下の人がいれば終了（0点ちょうども飛び）", () => {
    expect(plan(0, DEALER_WIN, [60000, 30000, 0])).toEqual({ end: true });
    expect(plan(1, DRAW_TENPAI, [-1000, 46000, 45000])).toEqual({ end: true });
  });

  describe("オーラス（南3局、親は席2）", () => {
    it("子の和了、または親ノーテンの流局で終了", () => {
      expect(plan(5, CHILD_WIN)).toEqual({ end: true });
      expect(plan(5, DRAW_NOTEN)).toEqual({ end: true });
    });

    it("親の和了や親テンパイの流局は、親が単独1位なら終了", () => {
      expect(plan(5, DEALER_WIN, [20000, 30000, 40000])).toEqual({ end: true });
      expect(plan(5, DRAW_TENPAI, [20000, 30000, 40000])).toEqual({
        end: true,
      });
    });

    it("親が単独1位でなければ連荘", () => {
      const next = { end: false, roundIndex: 5, honba: 3 };
      expect(plan(5, DEALER_WIN, [40000, 20000, 30000])).toEqual(next);
      expect(plan(5, DRAW_TENPAI, [40000, 20000, 30000])).toEqual(next);
      // 同点1位は単独ではない
      expect(plan(5, DEALER_WIN, [35000, 20000, 35000])).toEqual(next);
    });

    it("3人とも30000点で終わったらサドンデス。本場は引き継ぐ", () => {
      expect(plan(5, DRAW_NOTEN, EVEN)).toEqual({
        end: false,
        roundIndex: 6,
        honba: 3,
      });
    });

    it("3人とも30000点でも親テンパイなら、サドンデスではなく連荘", () => {
      expect(plan(5, DRAW_TENPAI, EVEN)).toEqual({
        end: false,
        roundIndex: 5,
        honba: 3,
      });
    });
  });

  describe("サドンデス", () => {
    it("3人同点でなくなれば、親の和了でも終了", () => {
      expect(plan(6, DEALER_WIN, [32000, 29000, 29000])).toEqual({ end: true });
      expect(plan(6, DRAW_TENPAI, [32000, 29000, 29000])).toEqual({
        end: true,
      });
    });

    it("まだ3人同点なら次の人が親でもう1局", () => {
      expect(plan(6, DRAW_NOTEN, EVEN)).toEqual({
        end: false,
        roundIndex: 7,
        honba: 3,
      });
      expect(plan(6, DRAW_TENPAI, EVEN)).toEqual({
        end: false,
        roundIndex: 7,
        honba: 3,
      });
    });
  });
});

describe("finalizeGame（終局の精算）", () => {
  it("残った供託はトップが取り、支払い表の枚数を出す", () => {
    const result = finalizeGame({
      firstDealer: 0,
      points: [40000, 25000, 24000],
      kyotaku: 1000,
      chips: [5, -2, -3],
    });
    expect(result).toEqual({
      points: [41000, 25000, 24000],
      ranking: [0, 1, 2],
      payout: [34, -11, -23],
      chips: [5, -2, -3],
    });
  });

  it("同点トップなら起家に近い方が供託を取る", () => {
    const result = finalizeGame({
      firstDealer: 1,
      points: [35000, 35000, 19000],
      kyotaku: 1000,
      chips: [0, 0, 0],
    });
    expect(result.points).toEqual([35000, 36000, 19000]);
    expect(result.ranking).toEqual([1, 0, 2]);
  });
});

// ---- 半荘の通し ----

const JUNK_A = "19m258p36s4s23z567z";
const JUNK_B = "19m369p25s7s23z567z";
const PLAIN = "123p456p789s111s4z";

/** 進行中の局を、並びの決まった山の局に差し替える。 */
function withRound(
  game: GameState,
  spec: DeckSpec,
  setup: Partial<RoundSetup> = {},
): GameState {
  const round = startRoundFromDeck(buildDeck(spec), {
    dealer: 0,
    firstDealer: game.firstDealer,
    ...setup,
  }).state;
  return { ...game, round };
}

function play(game: GameState, action: GameAction): GameState {
  return applyGameAction(game, action).state;
}

/** 親（席0）が4巡目にツモ和了する局を進める。 */
function dealerTsumo(game: GameState): GameState {
  for (let i = 0; i < 3; i++) {
    game = play(game, {
      type: "discard",
      seat: game.round.turn,
      tile: game.round.drawn!,
    });
  }
  return play(game, { type: "tsumo", seat: 0 });
}

const TSUMO_DECK: DeckSpec = {
  hands: [PLAIN, JUNK_A, JUNK_B],
  live: "2z9p9p4z",
};

describe("半荘の進行", () => {
  it("東1局、起家の親、30000点持ちで始まる", () => {
    const { state, events } = startGame({ seed: seedOf(1), firstDealer: 1 });
    expect(state).toMatchObject({
      phase: "playing",
      firstDealer: 1,
      roundIndex: 0,
      honba: 0,
      chips: [0, 0, 0],
      result: null,
    });
    expect(state.round).toMatchObject({
      dealer: 1,
      firstDealer: 1,
      roundWind: "1z",
      honba: 0,
      kyotaku: 0,
      points: [30000, 30000, 30000],
      seed: seedOf(1),
    });
    expect(events[0]).toEqual({
      type: "roundStart",
      roundIndex: 0,
      honba: 0,
      dealer: 1,
    });
  });

  it("局の途中では次の局に進めない", () => {
    const { state } = startGame({ seed: seedOf(1), firstDealer: 0 });
    expect(() =>
      applyGameAction(state, { type: "nextRound", seed: seedOf(2) }),
    ).toThrow(IllegalActionError);
  });

  it("親が和了したら連荘し、持ち点と本場を引き継ぐ", () => {
    let game = startGame({ seed: seedOf(1), firstDealer: 0 }).state;
    game = dealerTsumo(withRound(game, TSUMO_DECK));
    expect(game.phase).toBe("playing");
    expect(game.round.phase).toBe("ended");

    const { state, events } = applyGameAction(game, {
      type: "nextRound",
      seed: seedOf(2),
    });
    expect(state.roundIndex).toBe(0);
    expect(state.honba).toBe(1);
    expect(state.round).toMatchObject({
      phase: "awaitTurnAction",
      dealer: 0,
      honba: 1,
      points: [32000, 29000, 29000],
      seed: seedOf(2),
    });
    expect(events[0]).toEqual({
      type: "roundStart",
      roundIndex: 0,
      honba: 1,
      dealer: 0,
    });
  });

  it("供託は次の局に持ち越す", () => {
    let game = startGame({ seed: seedOf(1), firstDealer: 0 }).state;
    game = withRound(
      game,
      { hands: [JUNK_A, PLAIN, JUNK_B], live: "2p" },
      { kyotaku: 2000, points: [30000, 30000, 28000] },
    );
    game.round.wall.live = [];
    game = play(game, { type: "discard", seat: 0, tile: game.round.drawn! });
    game = play(game, { type: "nextRound", seed: seedOf(2) });
    expect(game.roundIndex).toBe(1);
    expect(game.honba).toBe(1);
    expect(game.round).toMatchObject({
      dealer: 1,
      kyotaku: 2000,
      points: [29000, 32000, 27000],
    });
  });

  it("2倍リーチを使ったことは次の局に持ち越す", () => {
    let game = startGame({ seed: seedOf(1), firstDealer: 0 }).state;
    // 么九牌だけを切ると流し役満になるので、4筒を引いて切る
    game = withRound(game, { hands: [PLAIN, JUNK_A, JUNK_B], live: "4p4p" });
    game = play(game, {
      type: "riichi",
      seat: 0,
      tile: game.round.drawn!,
      doubleStake: true,
    });
    expect(game.round.doubleStakeUsed).toEqual([true, false, false]);

    // 次の人の打牌で流局にする
    game.round.wall.live = [];
    game = play(game, { type: "discard", seat: 1, tile: game.round.drawn! });
    expect(game.round.phase).toBe("ended");
    game = play(game, { type: "nextRound", seed: seedOf(2) });
    expect(game.round.doubleStakeUsed).toEqual([true, false, false]);
    const stakes = legalActions(game.round, 0).flatMap((action) =>
      action.type === "riichi" ? [action.doubleStake] : [],
    );
    expect(stakes).not.toContain(true);
  });

  it("局ごとの祝儀を累計する", () => {
    let game = startGame({ seed: seedOf(1), firstDealer: 0 }).state;
    // 天和：役満祝儀10枚ずつ、サイコロチャンスあり
    game = withRound(game, { hands: [PLAIN, JUNK_A, JUNK_B], live: "4z" });
    game = play(game, { type: "tsumo", seat: 0 });
    expect(game.round.phase).toBe("diceChance");
    expect(game.chips).toEqual([0, 0, 0]);

    game = play(game, { type: "dice", seat: 0, faces: [1, 2] });
    expect(game.round.phase).toBe("ended");
    expect(game.chips).toEqual(game.round.chipDeltas);
    expect(game.chips[0]).toBeGreaterThanOrEqual(20);
  });

  it("誰かが飛んだら終局し、支払い表と祝儀の結果を出す", () => {
    let game = startGame({ seed: seedOf(1), firstDealer: 0 }).state;
    game = withRound(game, TSUMO_DECK, { points: [88000, 1000, 1000] });
    const before = game;
    for (let i = 0; i < 3; i++) {
      game = play(game, {
        type: "discard",
        seat: game.round.turn,
        tile: game.round.drawn!,
      });
    }
    const { state, events } = applyGameAction(game, { type: "tsumo", seat: 0 });

    expect(state.phase).toBe("ended");
    expect(state.result).toEqual({
      points: [90000, 0, 0],
      ranking: [0, 1, 2],
      payout: [56, -23, -33],
      chips: [4, -2, -2],
    });
    expect(events.at(-1)).toEqual({ type: "gameEnd", result: state.result });
    expect(before.phase).toBe("playing");
    expect(() =>
      applyGameAction(state, { type: "nextRound", seed: seedOf(2) }),
    ).toThrow(IllegalActionError);
  });
});

// ---- 自動対局 ----

/** 孤立した牌ほど小さい値になる。 */
function connectivity(round: RoundState, seat: Seat, tile: number): number {
  const kind = tileOf(tile).kind;
  let score = 0;
  for (const other of round.hands[seat]) {
    if (other === tile) continue;
    const otherKind = tileOf(other).kind;
    if (otherKind === kind) score += 3;
    else if (
      suitOf(kind) === suitOf(otherKind) &&
      "ps".includes(suitOf(kind))
    ) {
      const distance = Math.abs(rankOf(kind) - rankOf(otherKind));
      if (distance === 1) score += 2;
      else if (distance === 2) score += 1;
    }
  }
  return score;
}

/** それなりに和了に向かう打ち手。乱数で鳴きやリーチも混ぜる。 */
function chooseAction(round: RoundState, rng: Rng): Action {
  const actions = SEATS.flatMap((seat) => legalActions(round, seat));
  const pick = (list: Action[]) => list[rng.nextInt(list.length)]!;
  const of = (...types: Action["type"][]) =>
    actions.filter((a) => types.includes(a.type));
  const chance = (percent: number) => rng.nextInt(100) < percent;

  if (round.phase === "diceChance") return pick(actions);
  if (of("tsumo", "ron").length > 0 && chance(90))
    return pick(of("tsumo", "ron"));
  if (of("riichi").length > 0 && chance(70)) return pick(of("riichi"));
  if (of("ankan", "kakan", "minkan").length > 0 && chance(50)) {
    return pick(of("ankan", "kakan", "minkan"));
  }
  if (of("pon").length > 0 && chance(30)) return pick(of("pon"));
  if (of("pass").length > 0) return pick(of("pass"));

  const discards = of("discard");
  const scored = discards.map((action) => ({
    action,
    score: "tile" in action ? connectivity(round, action.seat, action.tile) : 0,
  }));
  const lowest = Math.min(...scored.map((s) => s.score));
  return pick(scored.filter((s) => s.score === lowest).map((s) => s.action));
}

describe("自動対局による検証", () => {
  it("半荘を最後まで回しても、牌、点棒、祝儀、スコアの合計が崩れない", () => {
    const sum = (values: readonly number[]) =>
      values.reduce((a, b) => a + b, 0);
    const seen = new Set<string>();
    let rounds = 0;

    for (let n = 0; n < 60; n++) {
      const rng = createRng(seedOf(n), 99);
      let nextSeed = n * 1000;
      let game = startGame({
        seed: seedOf(nextSeed++),
        firstDealer: (n % 3) as Seat,
      }).state;

      for (let steps = 0; game.phase === "playing"; steps++) {
        expect(steps).toBeLessThan(20000);
        const { round } = game;
        expect(tilesInRound(round)).toEqual(range(0, 112));
        expect(sum(round.points) + round.kyotaku).toBe(90000);
        expect(sum(round.chipDeltas)).toBe(0);

        if (round.phase === "ended") {
          rounds++;
          for (const win of round.outcome!.wins) seen.add(win.kind);
          seen.add(round.outcome!.type);
          if (round.riichi.some((r) => r !== null)) seen.add("riichi");
          for (const meld of round.melds.flat()) seen.add(meld.type);
          if (game.roundIndex >= 3) seen.add("south");
          game = play(game, { type: "nextRound", seed: seedOf(nextSeed++) });
        } else {
          game = play(game, chooseAction(round, rng));
        }
      }

      const result = game.result!;
      expect(sum(result.points)).toBe(90000);
      expect(sum(result.payout)).toBe(0);
      expect(sum(result.chips)).toBe(0);
      expect([...result.ranking].sort()).toEqual([0, 1, 2]);
      expect(result.points[result.ranking[0]!]).toBeGreaterThanOrEqual(
        result.points[result.ranking[2]!],
      );
    }

    // 主要な展開をひととおり通っていること
    for (const key of [
      "tsumo",
      "ron",
      "exhaustiveDraw",
      "riichi",
      "pon",
      "ankan",
      "minkan",
      "kakan",
      "pocchi",
      "reversePocchi",
      "south",
    ]) {
      expect(seen, key).toContain(key);
    }
    expect(rounds).toBeGreaterThan(200);
  }, 60_000);
});
