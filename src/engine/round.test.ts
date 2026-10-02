import { describe, expect, it } from "vitest";
import { createRng } from "./rng";
import {
  IllegalActionError,
  applyAction,
  legalActions,
  startRound,
  startRoundFromDeck,
} from "./round";
import type { RoundEvent, RoundState, Seat } from "./round";
import { deckWithSwaps, range, seedOf, tilesInRound } from "./testing";
import { isFlower } from "./tiles";
import { SEATS } from "./wall";

/** 手番の人がツモ切りし、他家は全員スルーする。 */
function tsumogiri(state: RoundState): {
  state: RoundState;
  events: RoundEvent[];
} {
  let step = applyAction(state, {
    type: "discard",
    seat: state.turn,
    tile: state.drawn!,
  });
  const events = [...step.events];
  while (step.state.phase === "awaitResponses") {
    const seat = SEATS.find((s) => legalActions(step.state, s).length > 0)!;
    step = applyAction(step.state, { type: "pass", seat });
    events.push(...step.events);
  }
  return { state: step.state, events };
}

function expectIllegal(run: () => unknown, code: string): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(IllegalActionError);
    expect((error as IllegalActionError).code).toBe(code);
    return;
  }
  expect.unreachable("例外が出るはず");
}

describe("局の開始", () => {
  it("親が1枚ツモって14枚、子は13枚で、親の操作待ちになる", () => {
    const { state } = startRoundFromDeck(deckWithSwaps(), { dealer: 0 });
    expect(state.phase).toBe("awaitTurnAction");
    expect(state.dealer).toBe(0);
    expect(state.turn).toBe(0);
    expect(state.hands[0]).toEqual([...range(0, 13), 39]);
    expect(state.hands[1]).toEqual(range(13, 26));
    expect(state.hands[2]).toEqual(range(26, 39));
    expect(state.drawn).toBe(39);
    expect(state.wall.live).toHaveLength(62);
    expect(state.wall.doraIndicators).toEqual([110]);
    expect(state.outcome).toBeNull();
  });

  it("親が席2なら席2の手番から始まる", () => {
    const { state } = startRoundFromDeck(deckWithSwaps(), { dealer: 2 });
    expect(state.turn).toBe(2);
    expect(state.hands.map((hand) => hand.length)).toEqual([13, 13, 14]);
  });

  it("配牌と第一ツモのイベントを返す", () => {
    const { events } = startRoundFromDeck(deckWithSwaps(), { dealer: 0 });
    expect(events).toEqual([
      {
        type: "deal",
        dealer: 0,
        hands: [range(0, 13), range(13, 26), range(26, 39)],
        doraIndicator: 110,
      },
      { type: "draw", seat: 0, tile: 39, source: "wall" },
    ]);
  });

  it("種から山を作る。同じ種なら同じ局、違う種なら違う局", () => {
    const a = startRound({ seed: seedOf(1), dealer: 0 });
    expect(tilesInRound(a.state)).toEqual(range(0, 112));
    expect(startRound({ seed: seedOf(1), dealer: 0 })).toEqual(a);
    expect(startRound({ seed: seedOf(2), dealer: 0 }).state).not.toEqual(
      a.state,
    );
  });

  it("手牌は並べ替えて持つ", () => {
    const { state } = startRound({ seed: seedOf(3), dealer: 0 });
    for (const hand of state.hands) {
      expect(hand).toEqual([...hand].sort((a, b) => a - b));
    }
  });
});

describe("花牌", () => {
  it("親の配牌の花牌は第一ツモのあとに抜き、嶺上牌から補充する", () => {
    const { state, events } = startRoundFromDeck(deckWithSwaps([0, 108]), {
      dealer: 0,
    });
    expect(state.flowers[0]).toEqual([108]);
    expect(state.hands[0]).toEqual([...range(1, 13), 39, 102]);
    expect(state.drawn).toBe(102);
    expect(state.wall.live).toHaveLength(62);
    expect(state.wall.rinshan).toHaveLength(7);
    expect(events.slice(1)).toEqual([
      { type: "draw", seat: 0, tile: 39, source: "wall" },
      { type: "flower", seat: 0, tile: 108 },
      { type: "draw", seat: 0, tile: 102, source: "flower" },
    ]);
  });

  it("子の配牌の花牌は、その人の手番が来るまで抜かない", () => {
    const started = startRoundFromDeck(deckWithSwaps([13, 108]), {
      dealer: 0,
    }).state;
    expect(started.hands[1]).toContain(108);
    expect(started.flowers[1]).toEqual([]);

    const { state, events } = tsumogiri(started);
    expect(state.turn).toBe(1);
    expect(state.flowers[1]).toEqual([108]);
    expect(state.hands[1]).toEqual([...range(14, 26), 40, 102]);
    expect(state.drawn).toBe(102);
    expect(events).toEqual([
      { type: "discard", seat: 0, tile: 39, tsumogiri: true },
      { type: "draw", seat: 1, tile: 40, source: "wall" },
      { type: "flower", seat: 1, tile: 108 },
      { type: "draw", seat: 1, tile: 102, source: "flower" },
    ]);
  });

  it("ツモった花牌は抜いて補充し、補充牌がツモ牌になる", () => {
    const { state } = startRoundFromDeck(deckWithSwaps([39, 108]), {
      dealer: 0,
    });
    expect(state.flowers[0]).toEqual([108]);
    expect(state.hands[0]).toEqual([...range(0, 13), 102]);
    expect(state.drawn).toBe(102);
  });

  it("補充牌も花牌なら続けて抜く", () => {
    const deck = deckWithSwaps([39, 108], [102, 109]);
    const { state, events } = startRoundFromDeck(deck, { dealer: 0 });
    expect(state.flowers[0]).toEqual([108, 109]);
    expect(state.hands[0]).toEqual([...range(0, 13), 103]);
    expect(state.drawn).toBe(103);
    expect(state.wall.rinshan).toHaveLength(6);
    expect(events.slice(1)).toEqual([
      { type: "draw", seat: 0, tile: 108, source: "wall" },
      { type: "flower", seat: 0, tile: 108 },
      { type: "draw", seat: 0, tile: 109, source: "flower" },
      { type: "flower", seat: 0, tile: 109 },
      { type: "draw", seat: 0, tile: 103, source: "flower" },
    ]);
  });

  it("配牌に花牌が2枚あれば2枚とも抜く", () => {
    const deck = deckWithSwaps([0, 108], [1, 109]);
    const { state } = startRoundFromDeck(deck, { dealer: 0 });
    expect(state.flowers[0]).toEqual([108, 109]);
    expect(state.hands[0]).toEqual([...range(2, 13), 39, 102, 103]);
    expect(state.drawn).toBe(103);
  });

  it("花牌を抜いてもツモ山は減らない", () => {
    const { state } = startRoundFromDeck(deckWithSwaps([0, 108]), {
      dealer: 0,
    });
    expect(state.wall.live).toEqual(range(40, 102));
  });
});

describe("打牌", () => {
  const started = startRoundFromDeck(deckWithSwaps(), { dealer: 0 }).state;

  it("手牌から河へ移り、次の人がツモる", () => {
    const { state, events } = applyAction(started, {
      type: "discard",
      seat: 0,
      tile: 5,
    });
    expect(state.hands[0]).toEqual([...range(0, 5), ...range(6, 13), 39]);
    expect(state.rivers[0]).toEqual([{ tile: 5, tsumogiri: false }]);
    expect(state.turn).toBe(1);
    expect(state.hands[1]).toEqual([...range(13, 26), 40]);
    expect(state.drawn).toBe(40);
    expect(events).toEqual([
      { type: "discard", seat: 0, tile: 5, tsumogiri: false },
      { type: "draw", seat: 1, tile: 40, source: "wall" },
    ]);
  });

  it("ツモった牌を切るとツモ切りとして記録する", () => {
    const { state } = applyAction(started, {
      type: "discard",
      seat: 0,
      tile: 39,
    });
    expect(state.rivers[0]).toEqual([{ tile: 39, tsumogiri: true }]);
  });

  it("席2の次は席0に戻る", () => {
    let state = started;
    for (let i = 0; i < 3; i++) state = tsumogiri(state).state;
    expect(state.turn).toBe(0);
  });

  it("元の状態を書き換えない", () => {
    const before = structuredClone(started);
    tsumogiri(started);
    expect(started).toEqual(before);
  });

  it("手番でない人の打牌は拒否する", () => {
    expectIllegal(
      () => applyAction(started, { type: "discard", seat: 1, tile: 13 }),
      "notYourTurn",
    );
  });

  it("手牌にない牌の打牌は拒否する", () => {
    expectIllegal(
      () => applyAction(started, { type: "discard", seat: 0, tile: 13 }),
      "tileNotInHand",
    );
  });
});

describe("合法手の一覧", () => {
  const started = startRoundFromDeck(deckWithSwaps(), { dealer: 0 }).state;

  it("手番の人は手牌14枚のどれでも切れる", () => {
    const discards = legalActions(started, 0).filter(
      (a) => a.type === "discard",
    );
    expect(discards).toEqual(
      [...range(0, 13), 39].map((tile) => ({ type: "discard", seat: 0, tile })),
    );
  });

  it("手番でない人にできる操作はない", () => {
    expect(legalActions(started, 1)).toEqual([]);
    expect(legalActions(started, 2)).toEqual([]);
  });
});

describe("流局", () => {
  function playOut(state: RoundState): {
    state: RoundState;
    events: RoundEvent[];
    discards: number;
  } {
    let events: RoundEvent[] = [];
    let discards = 0;
    while (state.phase !== "ended") {
      ({ state, events } = tsumogiri(state));
      discards++;
    }
    return { state, events, discards };
  }

  it("ツモ山63枚をツモり切り、最後の打牌で流局する", () => {
    const { state, events, discards } = playOut(
      startRoundFromDeck(deckWithSwaps(), { dealer: 0 }).state,
    );
    expect(discards).toBe(63);
    expect(state.wall.live).toEqual([]);
    expect(state.drawn).toBeNull();
    // id順の山では席1と席2が筒子の清一色で聴牌している
    expect(state.outcome).toMatchObject({
      type: "exhaustiveDraw",
      tenpai: [1, 2],
      pointDeltas: [-2000, 1000, 1000],
    });
    expect(events).toEqual([
      { type: "discard", seat: 2, tile: 101, tsumogiri: true },
      { type: "roundEnd", outcome: state.outcome },
    ]);
  });

  it("最後の1枚をツモった時点ではまだ流局しない", () => {
    let state = startRoundFromDeck(deckWithSwaps(), { dealer: 0 }).state;
    for (let i = 0; i < 62; i++) state = tsumogiri(state).state;
    expect(state.wall.live).toEqual([]);
    expect(state.phase).toBe("awaitTurnAction");
    expect(state.drawn).toBe(101);
  });

  it("流局後は操作できない", () => {
    const { state } = playOut(
      startRoundFromDeck(deckWithSwaps(), { dealer: 0 }).state,
    );
    expect(legalActions(state, 0)).toEqual([]);
    expectIllegal(
      () => applyAction(state, { type: "discard", seat: 0, tile: 0 }),
      "roundEnded",
    );
  });
});

describe("自動対局による検証", () => {
  it("乱数で操作しても牌は112枚、点棒は90000点のままで、必ず局が終わる", () => {
    for (let n = 0; n < 200; n++) {
      const seed = seedOf(n);
      const picker = createRng(seed, 99);
      let state = startRound({ seed, dealer: (n % 3) as Seat }).state;
      let steps = 0;

      while (state.phase !== "ended") {
        expect(tilesInRound(state)).toEqual(range(0, 112));
        expect(state.points.reduce((a, b) => a + b, 0) + state.kyotaku).toBe(
          90000,
        );
        if (state.phase === "awaitTurnAction") {
          expect(state.hands[state.turn].some(isFlower)).toBe(false);
        }

        const actions = SEATS.flatMap((seat) => legalActions(state, seat));
        expect(actions.length).toBeGreaterThan(0);
        state = applyAction(
          state,
          actions[picker.nextInt(actions.length)]!,
        ).state;
        expect(++steps).toBeLessThan(1000);
      }

      expect(tilesInRound(state)).toEqual(range(0, 112));
      expect(state.points.reduce((a, b) => a + b, 0) + state.kyotaku).toBe(
        90000,
      );
      expect(state.chipDeltas.reduce((a, b) => a + b, 0)).toBe(0);
      expect(state.outcome).not.toBeNull();
    }
  });
});
