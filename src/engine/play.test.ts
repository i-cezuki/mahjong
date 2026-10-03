import { describe, expect, it } from "vitest";
import {
  IllegalActionError,
  applyAction,
  legalActions,
  startRoundFromDeck,
} from "./round";
import type { Action, RoundSetup, RoundState, Seat } from "./round";
import { notenPayments } from "./settlement";
import { buildDeck } from "./testing";
import type { DeckSpec } from "./testing";
import { tileOf } from "./tiles";
import type { TileId, TileVariant } from "./tiles";

// ---- 進行用の補助 ----

const MODIFIERS: Record<string, TileVariant> = {
  r: "red",
  g: "gold",
  o: "pocchi",
  x: "reversePocchi",
};

/** 手牌から "5s" や "r5p" に当たる牌を探す。修飾がなければ通常の牌を優先する。 */
function find(state: RoundState, seat: Seat, notation: string): TileId {
  const variant = MODIFIERS[notation[0]!];
  const kind = variant ? notation.slice(1) : notation;
  const matches = state.hands[seat].filter((id) => tileOf(id).kind === kind);
  const tile = variant
    ? matches.find((id) => tileOf(id).variant === variant)
    : (matches.find((id) => tileOf(id).variant === "normal") ?? matches[0]);
  if (tile === undefined) throw new Error(`席${seat}の手牌に${notation}がない`);
  return tile;
}

function start(spec: DeckSpec, setup: Partial<RoundSetup> = {}): RoundState {
  return startRoundFromDeck(buildDeck(spec), { dealer: 0, ...setup }).state;
}

function act(state: RoundState, action: Action): RoundState {
  return applyAction(state, action).state;
}

function discard(state: RoundState, notation: string): RoundState {
  const seat = state.turn;
  return act(state, {
    type: "discard",
    seat,
    tile: find(state, seat, notation),
  });
}

function riichi(
  state: RoundState,
  notation: string,
  doubleStake = false,
): RoundState {
  const seat = state.turn;
  const tile = find(state, seat, notation);
  return act(state, { type: "riichi", seat, tile, doubleStake });
}

function openRiichi(state: RoundState, notation: string): RoundState {
  const seat = state.turn;
  const tile = find(state, seat, notation);
  return act(state, {
    type: "riichi",
    seat,
    tile,
    doubleStake: false,
    open: true,
  });
}

function passAll(state: RoundState): RoundState {
  while (state.phase === "awaitResponses") {
    const seat = ([0, 1, 2] as const).find(
      (s) => legalActions(state, s).length > 0,
    )!;
    state = act(state, { type: "pass", seat });
  }
  return state;
}

/** ツモ切りして、他家は全員スルー。 */
function giri(state: RoundState, times = 1): RoundState {
  for (let i = 0; i < times; i++) {
    state = passAll(
      act(state, { type: "discard", seat: state.turn, tile: state.drawn! }),
    );
  }
  return state;
}

function types(state: RoundState, seat: Seat): string[] {
  return [...new Set(legalActions(state, seat).map((a) => a.type))].sort();
}

function expectNotAllowed(state: RoundState, action: Action): void {
  try {
    applyAction(state, action);
  } catch (error) {
    expect(error).toBeInstanceOf(IllegalActionError);
    expect((error as IllegalActionError).code).toBe("notAllowed");
    return;
  }
  expect.unreachable("拒否されるはず");
}

function yakuNames(state: RoundState, index = 0): string[] {
  return (state.outcome?.wins[index]?.result?.yaku ?? [])
    .map((yaku) => yaku.name)
    .sort();
}

// ---- よく使う手牌 ----

/** 対子のないバラバラの手 */
const JUNK_A = "19m258p36s4s23z567z";
const JUNK_B = "19m369p25s7s23z567z";
/** 役のない門前の聴牌（北単騎） */
const PLAIN = "123p456p789s111s4z";
/** 断么九の5索単騎 */
const TANYAO_TANKI = "234p456p234s678s5s";
/** 断么九・平和の5索8索待ち */
const TANYAO_RYANMEN = "234p456p234s67s88s";

describe("ツモ和了", () => {
  const spec: DeckSpec = {
    hands: [PLAIN, JUNK_A, JUNK_B],
    live: "2z9p9p4z",
  };

  it("和了牌をツモったらツモ和了でき、点棒が動いて局が終わる", () => {
    let state = giri(start(spec), 3);
    expect(state.turn).toBe(0);
    expect(types(state, 0)).toContain("tsumo");

    state = act(state, { type: "tsumo", seat: 0 });
    expect(state.phase).toBe("ended");
    expect(yakuNames(state)).toEqual(["menzenTsumo"]);
    expect(state.outcome).toMatchObject({
      type: "win",
      dealerWon: true,
      pointDeltas: [2000, -1000, -1000],
      chipDeltas: [0, 0, 0],
    });
    expect(state.outcome?.wins[0]).toMatchObject({
      seat: 0,
      from: null,
      kind: "tsumo",
    });
    expect(state.points).toEqual([32000, 29000, 29000]);
  });

  it("和了形でなければツモ和了できない", () => {
    const state = start(spec);
    expect(types(state, 0)).not.toContain("tsumo");
    expectNotAllowed(state, { type: "tsumo", seat: 0 });
  });

  it("親の第一ツモの和了は天和で、サイコロチャンスに進む", () => {
    let state = start({ hands: [PLAIN, JUNK_A, JUNK_B], live: "4z" });
    state = act(state, { type: "tsumo", seat: 0 });
    expect(yakuNames(state)).toEqual(["tenhou"]);
    expect(state.points).toEqual([78000, 6000, 6000]);
    expect(state.chipDeltas).toEqual([20, -10, -10]);
    expect(state.phase).toBe("diceChance");
    expect(state.dice).toEqual([
      {
        seat: 0,
        chipsPerHit: 70,
        transfers: [
          [1, 0],
          [2, 0],
        ],
      },
    ]);
  });

  it("ツモり切りの最後の牌でのツモは海底が付く", () => {
    let state = giri(start(spec), 2);
    state.wall.live = state.wall.live.slice(0, 1);
    state = act(giri(state), { type: "tsumo", seat: 0 });
    expect(yakuNames(state)).toEqual(["haitei", "menzenTsumo"]);
  });

  it("花牌の補充牌での和了に嶺上開花は付かない", () => {
    let state = start({
      hands: [PLAIN, JUNK_A, JUNK_B],
      live: "2z9p9p1f",
      rinshan: "4z",
    });
    state = act(giri(state, 3), { type: "tsumo", seat: 0 });
    expect(yakuNames(state)).toEqual(["menzenTsumo"]);
    expect(state.outcome?.wins[0]?.result?.han).toBe(2);
    expect(state.points).toEqual([34000, 28000, 28000]);
  });
});

describe("ロン和了", () => {
  const spec: DeckSpec = {
    hands: ["19m147p258s1234z6z", TANYAO_TANKI, "19m369p39s123z567z"],
    live: "4z",
  };

  it("他家の打牌でロンできる", () => {
    let state = discard(start(spec), "5s");
    expect(state.phase).toBe("awaitResponses");
    expect(types(state, 1)).toEqual(["pass", "ron"]);
    expect(legalActions(state, 2)).toEqual([]);

    state = act(state, { type: "ron", seat: 1 });
    expect(state.phase).toBe("ended");
    expect(yakuNames(state)).toEqual(["tanyao"]);
    expect(state.outcome?.wins[0]).toMatchObject({
      seat: 1,
      from: 0,
      kind: "ron",
    });
    expect(state.outcome?.dealerWon).toBe(false);
    expect(state.points).toEqual([29000, 31000, 30000]);
  });

  it("役がない手ではロンできない", () => {
    const state = discard(
      start({
        hands: ["19m147p258s1234z6z", PLAIN, "19m369p39s123z567z"],
        live: "9p",
      }),
      "4z",
    );
    expect(state.phase).toBe("awaitTurnAction");
    expect(state.turn).toBe(1);
  });

  it("河底のロン", () => {
    let state = start(spec);
    state.wall.live = [];
    state = act(discard(state, "5s"), { type: "ron", seat: 1 });
    expect(yakuNames(state)).toEqual(["houtei", "tanyao"]);
  });

  it("応答待ちの間は手番の操作ができない", () => {
    const state = discard(start(spec), "5s");
    expect(legalActions(state, 0)).toEqual([]);
    expect(() => applyAction(state, { type: "pass", seat: 2 })).toThrow(
      IllegalActionError,
    );
  });

  describe("ダブロン", () => {
    const double: DeckSpec = {
      hands: ["19m17p5s28s1234z67z", TANYAO_TANKI, "234p456p678p46s22s"],
      live: "4z",
    };
    const setup = {
      honba: 1,
      kyotaku: 1000,
      points: [30000, 30000, 29000],
    } as const;

    it("2人ともロンでき、供託と本場は放銃者に近い方が取る", () => {
      let state = discard(
        start(double, { ...setup, points: [...setup.points] }),
        "5s",
      );
      state = act(state, { type: "ron", seat: 2 });
      expect(state.phase).toBe("awaitResponses");
      state = act(state, { type: "ron", seat: 1 });
      expect(state.outcome?.wins.map((win) => win.seat)).toEqual([1, 2]);
      expect(state.outcome?.pointDeltas).toEqual([-3000, 3000, 1000]);
      expect(state.points).toEqual([27000, 33000, 30000]);
      expect(state.kyotaku).toBe(0);
    });

    it("近い方が見逃せば、遠い方が供託と本場を取る", () => {
      let state = discard(
        start(double, { ...setup, points: [...setup.points] }),
        "5s",
      );
      state = act(state, { type: "pass", seat: 1 });
      state = act(state, { type: "ron", seat: 2 });
      expect(state.points).toEqual([28000, 30000, 32000]);
    });
  });
});

describe("フリテン", () => {
  it("同巡フリテン：見逃すと次の自分の打牌までロンできない", () => {
    let state = start({
      hands: ["19m147p5s29s1234z6z", TANYAO_RYANMEN, "19m369p89s123z567z"],
      live: "4z1z2z3z6zg5s",
    });
    state = giri(state, 2);
    state = discard(state, "8s");
    expect(types(state, 1)).toContain("ron");
    state = passAll(state);

    // 同巡のうちは、別の人が待ち牌を切ってもロンできない
    state = discard(state, "5s");
    expect(state.phase).toBe("awaitTurnAction");
    expect(state.turn).toBe(1);

    // 自分が打牌したら解消する
    state = giri(state);
    state = act(state, { type: "discard", seat: 2, tile: state.drawn! });
    expect(types(state, 1)).toContain("ron");
  });

  it("河フリテン：自分の河に待ち牌があるとロンできない", () => {
    let state = start({
      hands: ["19m147p29s1234z67z", TANYAO_RYANMEN, "19m369p89s123z567z"],
      live: "4z5s2z3z8s",
    });
    state = giri(state);
    state = giri(state); // 席1がツモった5索をそのまま切る
    state = discard(state, "8s");
    expect(types(state, 1)).toEqual(["pass", "pon"]);

    // ツモ和了はできる
    state = giri(passAll(state));
    expect(state.turn).toBe(1);
    expect(types(state, 1)).toContain("tsumo");
  });

  it("リーチ後に見逃すと、以後はツモ和了しかできない", () => {
    let state = start({
      hands: ["19m147p29s1234z67z", TANYAO_RYANMEN, "19m369p89s123z567z"],
      live: "1z4z2z3z3zg5s9p8s",
    });
    state = giri(state);
    state = riichi(state, "4z");
    state = discard(state, "8s");
    // リーチ中はポンできない
    expect(types(state, 1)).toEqual(["pass", "ron"]);
    state = passAll(state);
    expect(state.riichi[1]?.furiten).toBe(true);

    state = giri(state, 2);
    state = act(state, { type: "discard", seat: 2, tile: state.drawn! });
    expect(state.phase).toBe("awaitTurnAction");

    state = giri(state);
    expect(state.turn).toBe(1);
    expect(types(state, 1)).toContain("tsumo");
  });
});

describe("ポン", () => {
  const spec: DeckSpec = {
    hands: [
      "19m147p258s1234z7z",
      "19m258p36s4s23z56z7s",
      "19m369p29s77z123z5z",
    ],
    live: "4z9p9p",
  };

  it("対子があれば他家の打牌をポンでき、鳴いた人の手番になる", () => {
    let state = discard(start(spec), "7z");
    expect(legalActions(state, 1)).toEqual([]);
    expect(types(state, 2)).toEqual(["pass", "pon"]);

    const pon = legalActions(state, 2).find((a) => a.type === "pon")!;
    state = act(state, pon);
    expect(state.phase).toBe("awaitTurnAction");
    expect(state.turn).toBe(2);
    expect(state.drawn).toBeNull();
    expect(state.hands[2]).toHaveLength(11);
    expect(state.melds[2]).toMatchObject([{ type: "pon", from: 0 }]);
    expect(state.melds[2][0]?.tiles.map((id) => tileOf(id).kind)).toEqual([
      "7z",
      "7z",
      "7z",
    ]);
    expect(state.rivers[0][0]?.called).toBe(true);
    // ポンの直後は打牌だけ
    expect(types(state, 2)).toEqual(["discard"]);
    expect(legalActions(state, 2)).toHaveLength(11);
  });

  it("ポンした人が打牌すると、その下家の手番になる", () => {
    let state = discard(start(spec), "7z");
    state = act(
      state,
      legalActions(state, 2).find((a) => a.type === "pon")!,
    );
    state = passAll(discard(state, "9s"));
    expect(state.turn).toBe(0);
    expect(state.drawn).not.toBeNull();
  });

  it("スルーすれば次の人がツモる", () => {
    const state = passAll(discard(start(spec), "7z"));
    expect(state.turn).toBe(1);
    expect(state.melds[2]).toEqual([]);
  });

  it("同じ牌の喰い替えはできない", () => {
    let state = start({
      hands: [
        "19m147p258s1234z7z",
        "19m258p36s4s23z56z7s",
        "19m369p29s777z12z5z",
      ],
      live: "4z",
    });
    state = discard(state, "7z");
    state = act(
      state,
      legalActions(state, 2).find((a) => a.type === "pon")!,
    );
    const remaining = find(state, 2, "7z");
    expect(
      legalActions(state, 2).map((a) => "tile" in a && a.tile),
    ).not.toContain(remaining);
    expectNotAllowed(state, { type: "discard", seat: 2, tile: remaining });
  });

  it("最初の手番より前にポンしても、配牌の花牌は次のツモ番まで抜かない", () => {
    let state = start({
      hands: [
        "19m147p258s1234z7z",
        "19m258p36s4s23z56z7s",
        "19m369p29s77z123z1f",
      ],
      live: "4z9p9p9p",
      rinshan: "8p",
    });
    state = discard(state, "7z");
    state = act(
      state,
      legalActions(state, 2).find((a) => a.type === "pon")!,
    );
    const flower = find(state, 2, "1f");
    expect(state.flowers[2]).toEqual([]);
    expect(state.hands[2]).toHaveLength(11);

    // 花牌は切れない
    expect(legalActions(state, 2)).toHaveLength(10);
    expectNotAllowed(state, { type: "discard", seat: 2, tile: flower });

    // 次のツモ番で抜いて補充する
    state = passAll(discard(state, "9s"));
    expect(state.hands[2]).toContain(flower);
    state = giri(state, 2);
    expect(state.turn).toBe(2);
    expect(state.flowers[2]).toEqual([flower]);
    expect(tileOf(state.drawn!).kind).toBe("8p");
  });

  it("赤や金を含めるかどうかを選べる", () => {
    let state = start({
      hands: [
        "19m147p258s1234z5p",
        "19m28p36s4s23z56z7s9s",
        "19m369p29sr5pg5p5p123z",
      ],
      live: "4z",
    });
    state = discard(state, "5p");
    const pons = legalActions(state, 2).filter((a) => a.type === "pon");
    expect(pons).toHaveLength(3);
  });

  it("最後の打牌はポンできない", () => {
    let state = start(spec);
    state.wall.live = [];
    state = discard(state, "7z");
    expect(state.outcome).not.toBeNull();
    expect(state.melds[2]).toEqual([]);
  });

  it("ロンはポンより優先する", () => {
    let state = start({
      hands: ["19m147p5s28s1234z6z", TANYAO_TANKI, "19m369pr5sg5s9s123z67z"],
      live: "4z",
    });
    state = discard(state, "5s");
    state = act(
      state,
      legalActions(state, 2).find((a) => a.type === "pon")!,
    );
    expect(state.phase).toBe("awaitResponses");
    state = act(state, { type: "ron", seat: 1 });
    expect(state.outcome?.wins[0]?.seat).toBe(1);
    expect(state.melds[2]).toEqual([]);
  });
});

describe("槓", () => {
  it("暗槓：槓ドラをめくり、嶺上牌をツモる", () => {
    let state = start({
      hands: ["1111p258s1234z67z", JUNK_A, JUNK_B],
      live: "9p",
      liveTail: "3p2p",
      rinshan: "3z",
    });
    expect(types(state, 0)).toContain("ankan");
    const result = applyAction(state, { type: "ankan", seat: 0, kind: "1p" });
    state = result.state;

    expect(state.melds[0]).toMatchObject([{ type: "ankan", from: null }]);
    expect(state.melds[0][0]?.tiles).toHaveLength(4);
    expect(state.wall.doraIndicators.map((id) => tileOf(id).kind)).toEqual([
      "1m",
      "2p",
    ]);
    expect(state.wall.uraIndicators.map((id) => tileOf(id).kind)).toEqual([
      "9m",
      "3p",
    ]);
    expect(state.wall.live).toHaveLength(60);
    expect(tileOf(state.drawn!).kind).toBe("3z");
    expect(state.hands[0]).toHaveLength(11);
    expect(state.turn).toBe(0);
    expect(state.phase).toBe("awaitTurnAction");
    expect(result.events.map((event) => event.type)).toEqual([
      "kan",
      "dora",
      "draw",
    ]);
    expect(result.events[2]).toMatchObject({ source: "kan" });
  });

  it("嶺上牌で和了すれば嶺上開花", () => {
    let state = start({
      hands: ["1111p123s456s789s", JUNK_A, JUNK_B],
      live: "4z",
      liveTail: "6z6z",
      rinshan: "4z",
    });
    state = act(state, { type: "ankan", seat: 0, kind: "1p" });
    state = act(state, { type: "tsumo", seat: 0 });
    expect(yakuNames(state)).toEqual(["ittsu", "menzenTsumo", "rinshan"]);
  });

  it("大明槓：3枚持っていれば他家の打牌を槓できる", () => {
    let state = start({
      hands: [
        "19m147p258s1234z7z",
        "19m258p36s4s23z56z7s",
        "19m369p29s777z12z5z",
      ],
      live: "4z",
      rinshan: "9p",
    });
    state = discard(state, "7z");
    expect(types(state, 2)).toEqual(["minkan", "pass", "pon"]);
    state = act(state, { type: "minkan", seat: 2 });
    expect(state.melds[2]).toMatchObject([{ type: "minkan", from: 0 }]);
    expect(state.melds[2][0]?.tiles).toHaveLength(4);
    expect(state.wall.doraIndicators).toHaveLength(2);
    expect(state.turn).toBe(2);
    expect(tileOf(state.drawn!).kind).toBe("9p");
    expect(state.hands[2]).toHaveLength(11);
  });

  it("加槓：ポンした牌の4枚目をツモったら槓できる", () => {
    let state = start({
      hands: [
        "19m147p258s1234z7z",
        "19m258p36s4s23z56z7s",
        "19m369p29s77z123z5z",
      ],
      live: "4z9p9p7z",
      rinshan: "9p",
    });
    state = discard(state, "7z");
    state = act(
      state,
      legalActions(state, 2).find((a) => a.type === "pon")!,
    );
    state = passAll(discard(state, "9s"));
    state = giri(state, 2);
    expect(state.turn).toBe(2);
    expect(types(state, 2)).toContain("kakan");

    state = act(state, { type: "kakan", seat: 2, tile: find(state, 2, "7z") });
    expect(state.melds[2]).toMatchObject([{ type: "kakan", from: 0 }]);
    expect(state.melds[2][0]?.tiles).toHaveLength(4);
    expect(state.wall.doraIndicators).toHaveLength(2);
    expect(tileOf(state.drawn!).kind).toBe("9p");
  });

  it("ツモ山が2枚未満なら槓できない", () => {
    const state = start({
      hands: ["1111p258s1234z67z", JUNK_A, JUNK_B],
      live: "9p",
    });
    state.wall.live = state.wall.live.slice(0, 1);
    expect(types(state, 0)).not.toContain("ankan");
    expectNotAllowed(state, { type: "ankan", seat: 0, kind: "1p" });
  });
});

describe("リーチ", () => {
  const hands: DeckSpec["hands"] = ["111p234s567s789s4z", JUNK_A, JUNK_B];
  const spec: DeckSpec = { hands, live: "3z9p9p2z" };

  it("宣言すると1000点を供託し、以後はツモ切りしかできない", () => {
    let state = start(spec);
    expect(types(state, 0)).toContain("riichi");
    state = riichi(state, "3z");
    expect(state.rivers[0][0]).toMatchObject({ riichi: true });
    expect(state.points).toEqual([29000, 30000, 30000]);
    expect(state.kyotaku).toBe(1000);
    expect(state.riichi[0]).toEqual({
      doubleRiichi: true,
      doubleStake: false,
      ippatsu: true,
      furiten: false,
    });

    state = giri(state, 2);
    expect(legalActions(state, 0)).toEqual([
      { type: "discard", seat: 0, tile: state.drawn },
    ]);
  });

  it("聴牌にならない打牌ではリーチできない", () => {
    const state = start(spec);
    expectNotAllowed(state, {
      type: "riichi",
      seat: 0,
      tile: find(state, 0, "1p"),
      doubleStake: false,
    });
    const junk = start({ hands: [JUNK_A, PLAIN, JUNK_B], live: "9p" });
    expect(types(junk, 0)).not.toContain("riichi");
  });

  it("2倍リーチは5000点を供託する", () => {
    const state = riichi(start(spec), "3z", true);
    expect(state.points).toEqual([25000, 30000, 30000]);
    expect(state.kyotaku).toBe(5000);
    expect(state.riichi[0]?.doubleStake).toBe(true);
  });

  it("2倍リーチが成立すると、使ったことを記録する。通常のリーチでは記録しない", () => {
    expect(riichi(start(spec), "3z", true).doubleStakeUsed).toEqual([
      true,
      false,
      false,
    ]);
    expect(riichi(start(spec), "3z").doubleStakeUsed).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("2倍リーチは半荘に1回まで。使った人は通常のリーチしか宣言できない", () => {
    const state = start(spec, { doubleStakeUsed: [true, false, false] });
    const stakes = legalActions(state, 0).flatMap((action) =>
      action.type === "riichi" ? [action.doubleStake] : [],
    );
    expect(stakes.length).toBeGreaterThan(0);
    expect(stakes).not.toContain(true);
    expectNotAllowed(state, {
      type: "riichi",
      seat: 0,
      tile: find(state, 0, "3z"),
      doubleStake: true,
    });
    expect(riichi(state, "3z").riichi[0]?.doubleStake).toBe(false);
  });

  it("ほかの人が2倍リーチを使っていても、自分は宣言できる", () => {
    const state = start(spec, { doubleStakeUsed: [false, true, true] });
    expect(riichi(state, "3z", true).riichi[0]?.doubleStake).toBe(true);
  });

  it("宣言牌でロンされた2倍リーチは成立しないので、使ったことにならない", () => {
    let state = start({
      hands: ["111p999p111s44z5s3z", TANYAO_TANKI, JUNK_A],
      live: "3z",
    });
    state = riichi(state, "5s", true);
    state = act(state, { type: "ron", seat: 1 });
    expect(state.doubleStakeUsed).toEqual([false, false, false]);
  });

  it("記録のない状態（この決まりができる前に始まった対局）でも2倍リーチを宣言できる", () => {
    const old = start(spec);
    delete (old as Partial<RoundState>).doubleStakeUsed;
    const state = riichi(old, "3z", true);
    expect(state.doubleStakeUsed).toEqual([true, false, false]);
  });

  it("オープンリーチは2000点を供託する", () => {
    const state = openRiichi(start(spec), "3z");
    expect(state.points).toEqual([28000, 30000, 30000]);
    expect(state.kyotaku).toBe(2000);
    expect(state.riichi[0]).toMatchObject({ open: true, doubleStake: false });
  });

  it("オープンリーチは通常のリーチと同じく、宣言できる牌ごとに選べる", () => {
    const state = start(spec);
    const riichiTiles = (open: boolean) =>
      legalActions(state, 0).flatMap((action) =>
        action.type === "riichi" &&
        !action.doubleStake &&
        (action.open ?? false) === open
          ? [action.tile]
          : [],
      );
    expect(riichiTiles(true).length).toBeGreaterThan(0);
    expect(riichiTiles(true)).toEqual(riichiTiles(false));
  });

  it("オープンリーチと2倍リーチは同時に宣言できない", () => {
    const state = start(spec);
    expect(
      legalActions(state, 0).some(
        (action) =>
          action.type === "riichi" && action.doubleStake && action.open,
      ),
    ).toBe(false);
    expectNotAllowed(state, {
      type: "riichi",
      seat: 0,
      tile: find(state, 0, "3z"),
      doubleStake: true,
      open: true,
    });
  });

  it("オープンリーチの成立は牌譜に残る", () => {
    const state = start(spec);
    let step = applyAction(state, {
      type: "riichi",
      seat: 0,
      tile: find(state, 0, "3z"),
      doubleStake: false,
      open: true,
    });
    const events = [...step.events];
    while (step.state.phase === "awaitResponses") {
      const current = step.state;
      const seat = ([0, 1, 2] as const).find(
        (s) => legalActions(current, s).length > 0,
      )!;
      step = applyAction(current, { type: "pass", seat });
      events.push(...step.events);
    }
    expect(events).toContainEqual({
      type: "riichi",
      seat: 0,
      doubleRiichi: true,
      doubleStake: false,
      open: true,
    });
  });

  it("オープンリーチで和了するとオープンリーチの1翻が付く", () => {
    let state = start({ hands, live: "3z9p9p2z9s9s4z" });
    state = giri(openRiichi(state, "3z"), 5);
    state = act(state, { type: "tsumo", seat: 0 });
    expect(yakuNames(state)).toEqual([
      "doubleRiichi",
      "menzenTsumo",
      "openRiichi",
    ]);
  });

  it("宣言牌でロンされたオープンリーチは成立せず、供託も出さない", () => {
    let state = start({
      hands: ["111p999p111s44z5s3z", TANYAO_TANKI, JUNK_A],
      live: "3z",
    });
    state = openRiichi(state, "5s");
    state = act(state, { type: "ron", seat: 1 });
    expect(state.points).toEqual([29000, 31000, 30000]);
    expect(state.kyotaku).toBe(0);
  });

  it("持ち点が足りなくても宣言でき、マイナスになる", () => {
    const state = riichi(start(spec, { points: [500, 30000, 59500] }), "3z");
    expect(state.points[0]).toBe(-500);
  });

  it("2巡目以降のリーチはダブルリーチにならない", () => {
    let state = giri(start({ hands, live: "9p9p9p3z" }), 3);
    state = riichi(state, "3z");
    expect(state.riichi[0]?.doubleRiichi).toBe(false);
  });

  it("鳴いた手ではリーチできない", () => {
    let state = start({
      hands: [
        "19m147p258s1234z7z",
        "19m258p36s4s23z56z7s",
        "234p456p678p77z2s3s",
      ],
      live: "4z",
    });
    state = discard(state, "7z");
    state = act(
      state,
      legalActions(state, 2).find((a) => a.type === "pon")!,
    );
    expect(types(state, 2)).toEqual(["discard"]);
  });

  it("宣言牌でロンされたらリーチは成立せず、供託も出さない", () => {
    let state = start({
      hands: ["111p999p111s44z5s3z", TANYAO_TANKI, JUNK_A],
      live: "3z",
    });
    state = riichi(state, "5s");
    state = act(state, { type: "ron", seat: 1 });
    expect(state.points).toEqual([29000, 31000, 30000]);
    expect(state.kyotaku).toBe(0);
  });

  it("一発：リーチ後、次の自分のツモまでに和了する", () => {
    let state = start({ hands, live: "3z9p9p4z" });
    state = giri(riichi(state, "3z"), 2);
    state = act(state, { type: "tsumo", seat: 0 });
    expect(yakuNames(state)).toEqual([
      "doubleRiichi",
      "ippatsu",
      "menzenTsumo",
    ]);
    expect(state.points).toEqual([42000, 24000, 24000]);
    expect(state.chipDeltas).toEqual([2, -1, -1]);
  });

  it("一発は1巡で消える", () => {
    let state = start({ hands, live: "3z9p9p2z9s9s4z" });
    state = giri(riichi(state, "3z"), 5);
    state = act(state, { type: "tsumo", seat: 0 });
    expect(yakuNames(state)).toEqual(["doubleRiichi", "menzenTsumo"]);
  });

  it("一発はポンで消える", () => {
    let state = start({
      hands: [hands[0], "19m258p36s4s23z56z7s", "19m369p29s66z123z5z"],
      live: "3z2z4z",
    });
    state = riichi(state, "3z");
    state = discard(state, "6z");
    state = act(
      state,
      legalActions(state, 2).find((a) => a.type === "pon")!,
    );
    state = passAll(discard(state, "9s"));
    state = act(state, { type: "tsumo", seat: 0 });
    expect(yakuNames(state)).toEqual(["doubleRiichi", "menzenTsumo"]);
  });

  it("裏ドラはリーチして和了したときに乗り、祝儀が付く", () => {
    let state = start({ hands, live: "3z9p9p2z9s9s4z", ura: "3z" });
    state = giri(riichi(state, "3z"), 5);
    state = act(state, { type: "tsumo", seat: 0 });
    expect(state.outcome?.wins[0]?.result?.dora.ura).toBe(2);
    expect(state.chipDeltas).toEqual([4, -2, -2]);
  });

  describe("リーチ後の暗槓", () => {
    it("待ちも面子構成も変わらなければできる", () => {
      let state = start({ hands, live: "3z9p9p1p" });
      state = giri(riichi(state, "3z"), 2);
      expect(types(state, 0)).toEqual(["ankan", "discard"]);
    });

    it("待ちが変わるならできない", () => {
      let state = start({
        hands: ["1112p456s789s444z", JUNK_A, JUNK_B],
        live: "1z9p9p1p",
      });
      state = giri(riichi(state, "1z"), 2);
      expect(types(state, 0)).toEqual(["discard"]);
    });
  });
});

describe("ポッチと逆ポッチ", () => {
  /** 1筒なら一気通貫が付く147筒待ち */
  const hands: DeckSpec["hands"] = ["23456789p11s234s", JUNK_A, JUNK_B];

  it("リーチ後にポッチを引くと、高めでツモ和了したことになる", () => {
    let state = start({ hands, live: "4z9p9po5z" });
    state = giri(riichi(state, "4z"), 2);

    expect(state.outcome?.wins[0]).toMatchObject({ seat: 0, kind: "pocchi" });
    expect(tileOf(state.outcome!.wins[0]!.winTile!).kind).toBe("1p");
    expect(yakuNames(state)).toEqual([
      "doubleRiichi",
      "ippatsu",
      "ittsu",
      "menzenTsumo",
      "pinfu",
    ]);
    expect(state.points).toEqual([48000, 21000, 21000]);
    expect(state.chipDeltas).toEqual([2, -1, -1]);
    // 一発でツモったのでサイコロチャンス
    expect(state.phase).toBe("diceChance");
    expect(state.dice).toEqual([
      {
        seat: 0,
        chipsPerHit: 70,
        transfers: [
          [1, 0],
          [2, 0],
        ],
      },
    ]);
  });

  it("逆ポッチは支払いが逆になり、供託は本人が回収する", () => {
    let state = start({ hands, live: "4z9p9px5z" });
    state = giri(riichi(state, "4z"), 2);

    expect(state.outcome?.wins[0]).toMatchObject({
      seat: 0,
      kind: "reversePocchi",
    });
    expect(state.outcome?.dealerWon).toBe(true);
    expect(state.points).toEqual([12000, 39000, 39000]);
    expect(state.kyotaku).toBe(0);
    expect(state.chipDeltas).toEqual([-2, 1, 1]);
    expect(state.dice).toEqual([
      {
        seat: 0,
        chipsPerHit: 70,
        transfers: [
          [0, 1],
          [0, 2],
        ],
      },
    ]);
  });

  it("2倍リーチ中は祝儀とサイコロの当たりが2倍", () => {
    let state = start({ hands, live: "4z9p9po5z" });
    state = giri(riichi(state, "4z", true), 2);
    expect(state.points).toEqual([48000, 21000, 21000]);
    expect(state.chipDeltas).toEqual([4, -2, -2]);
    expect(state.dice[0]?.chipsPerHit).toBe(140);
  });

  it("一発でなければサイコロチャンスにならない", () => {
    let state = start({ hands, live: "4z9p9p2z9s9so5z" });
    state = giri(riichi(state, "4z"), 5);
    expect(state.outcome?.wins[0]?.kind).toBe("pocchi");
    expect(state.phase).toBe("ended");
  });

  it("リーチしていなければ普通の白", () => {
    let state = start({ hands, live: "4z9p9po5z" });
    state = giri(state, 3);
    expect(state.phase).toBe("awaitTurnAction");
    expect(state.outcome).toBeNull();
    expect(types(state, 0)).toContain("discard");
  });

  it("逆ポッチの支払いで本人が飛んだら、飛び賞はトップが受け取る", () => {
    let state = start(
      { hands, live: "4z9p9px5z" },
      { points: [5000, 42500, 42500] },
    );
    state = giri(riichi(state, "4z"), 2);
    expect(state.points).toEqual([-13000, 51500, 51500]);
    expect(state.outcome?.tobi).toEqual([{ seat: 0, to: 1 }]);
    expect(state.chipDeltas).toEqual([-4, 3, 1]);
  });
});

describe("流局", () => {
  it.each<[Seat[], number[]]>([
    [[], [0, 0, 0]],
    [[1], [-1000, 2000, -1000]],
    [
      [0, 2],
      [1000, -2000, 1000],
    ],
    [
      [0, 1, 2],
      [0, 0, 0],
    ],
  ])("テンパイが %j ならノーテン罰符は %j", (tenpai, expected) => {
    expect(notenPayments(tenpai)).toEqual(expected);
  });

  it("テンパイの人がノーテンの人から罰符を受け取り、供託は残る", () => {
    let state = start(
      { hands: [JUNK_A, PLAIN, JUNK_B], live: "2p" },
      { kyotaku: 2000, points: [30000, 30000, 28000] },
    );
    state.wall.live = [];
    state = giri(state);
    expect(state.phase).toBe("ended");
    expect(state.outcome).toMatchObject({
      type: "exhaustiveDraw",
      tenpai: [1],
      dealerTenpai: false,
      dealerWon: false,
      pointDeltas: [-1000, 2000, -1000],
    });
    expect(state.points).toEqual([29000, 32000, 27000]);
    expect(state.kyotaku).toBe(2000);
  });

  it("流局で飛んだら、飛び賞はその時点のトップが受け取る", () => {
    let state = start(
      { hands: [JUNK_A, PLAIN, JUNK_B], live: "2p" },
      { points: [1000, 30000, 59000] },
    );
    state.wall.live = [];
    state = giri(state);
    expect(state.points).toEqual([0, 32000, 58000]);
    expect(state.outcome?.tobi).toEqual([{ seat: 0, to: 2 }]);
    expect(state.chipDeltas).toEqual([-2, 0, 2]);
  });

  it("流し役満：捨て牌がすべて么九牌で鳴かれていなければ役満ツモと同じ支払い", () => {
    let state = start(
      { hands: [JUNK_A, JUNK_B, PLAIN], live: "1z" },
      { honba: 1 },
    );
    state.wall.live = [];
    state = giri(state);
    expect(state.outcome).toMatchObject({ type: "win", dealerWon: true });
    expect(state.outcome?.wins[0]).toMatchObject({ seat: 0, kind: "nagashi" });
    expect(state.points).toEqual([80000, 5000, 5000]);
    expect(state.chipDeltas).toEqual([20, -10, -10]);
    expect(state.phase).toBe("diceChance");
  });

  it("中張牌を1枚でも切っていれば流し役満にならない", () => {
    let state = start({ hands: [JUNK_A, JUNK_B, PLAIN], live: "2p" });
    state.wall.live = [];
    state = giri(state);
    expect(state.outcome?.type).toBe("exhaustiveDraw");
  });
});

describe("飛び賞", () => {
  it("ロンで飛ばしたら和了者が2枚受け取る（0点ちょうども飛び）", () => {
    let state = start(
      {
        hands: ["19m147p258s1234z6z", TANYAO_TANKI, "19m369p39s123z567z"],
        live: "4z",
      },
      { points: [1000, 30000, 59000] },
    );
    state = act(discard(state, "5s"), { type: "ron", seat: 1 });
    expect(state.points).toEqual([0, 31000, 59000]);
    expect(state.outcome?.tobi).toEqual([{ seat: 0, to: 1 }]);
    expect(state.chipDeltas).toEqual([-2, 2, 0]);
  });

  it("ツモで2人同時に飛ばしたら2枚ずつ受け取る", () => {
    let state = start(
      { hands: [PLAIN, JUNK_A, JUNK_B], live: "2z9p9p4z" },
      { points: [88000, 1000, 1000] },
    );
    state = act(giri(state, 3), { type: "tsumo", seat: 0 });
    expect(state.points).toEqual([90000, 0, 0]);
    expect(state.chipDeltas).toEqual([4, -2, -2]);
  });
});

describe("サイコロチャンス", () => {
  function tenhou(): RoundState {
    const state = start({ hands: [PLAIN, JUNK_A, JUNK_B], live: "4z" });
    return act(state, { type: "tsumo", seat: 0 });
  }

  it("和了者だけが、ゾロ目以外の15通りから出目を選べる", () => {
    const state = tenhou();
    expect(legalActions(state, 0)).toHaveLength(15);
    expect(legalActions(state, 1)).toEqual([]);
    expectNotAllowed(state, { type: "dice", seat: 0, faces: [3, 3] });
    expectNotAllowed(state, { type: "dice", seat: 1, faces: [1, 2] });
  });

  it("振った結果を記録し、当たり1回につき70枚を2人が払って局が終わる", () => {
    const before = tenhou();
    const { state, events } = applyAction(before, {
      type: "dice",
      seat: 0,
      faces: [2, 1],
    });
    const event = events.find((e) => e.type === "dice");
    if (event?.type !== "dice") throw new Error("サイコロのイベントがない");
    expect(event.faces).toEqual([1, 2]);
    expect(event.rolls.filter(([a, b]) => a !== b)).toHaveLength(4);
    const chips = event.hits * 70;
    expect(event.chipDeltas).toEqual([chips * 2, -chips, -chips]);
    expect(state.chipDeltas).toEqual([
      20 + chips * 2,
      -10 - chips,
      -10 - chips,
    ]);
    expect(state.dice).toEqual([]);
    expect(state.phase).toBe("ended");
  });

  it("ダブル役満ならチャンスは2回", () => {
    // 天和＋四暗刻（単騎）
    let state = start({
      hands: ["111p333p777s999s4z", JUNK_A, JUNK_B],
      live: "4z",
    });
    state = act(state, { type: "tsumo", seat: 0 });
    expect(state.outcome?.wins[0]?.result?.yakuman).toBe(2);
    expect(state.dice).toHaveLength(2);
    state = act(state, { type: "dice", seat: 0, faces: [1, 2] });
    expect(state.phase).toBe("diceChance");
    state = act(state, { type: "dice", seat: 0, faces: [1, 2] });
    expect(state.phase).toBe("ended");
  });
});
