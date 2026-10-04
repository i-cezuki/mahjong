import { describe, expect, it } from "vitest";
import {
  IllegalActionError,
  SEATS,
  createRng,
  startRoundFromDeck,
  tileOf,
} from "@/engine";
import type { Seat, TileId } from "@/engine";
import { buildDeck, seedOf } from "@/engine/testing";
import { applyTableAction, buildView, parseAction, startTable } from "./table";
import type { PlayAction, PlayerView, TableAction, TableState } from "./table";

/** 画面データの中で、牌が入る場所をすべて集める。 */
function tilesInView(view: PlayerView): TileId[] {
  return [
    ...view.hand,
    ...(view.drawn === null ? [] : [view.drawn]),
    ...view.doraIndicators,
    ...view.melds.flat().flatMap((meld) => meld.tiles),
    ...view.flowers.flat(),
    ...view.rivers.flat().map((discard) => discard.tile),
    ...(view.lastDiscard ? [view.lastDiscard.tile] : []),
    ...view.revealed.flatMap((hand) => hand ?? []),
    ...view.openHands.flatMap((hand) => hand ?? []),
    ...(view.outcome?.uraIndicators ?? []),
    ...(view.outcome?.wins.flatMap((win) =>
      win.winTile === null ? [] : [win.winTile],
    ) ?? []),
    ...view.actions.flatMap((action) => {
      switch (action.type) {
        case "discard":
        case "riichi":
        case "kakan":
          return [action.tile];
        case "pon":
          return action.tiles;
        default:
          return [];
      }
    }),
  ];
}

/** その席から見えてよい牌 */
function visibleTiles(table: TableState, seat: Seat): Set<TileId> {
  const round = table.game.round;
  const outcome = round.outcome;
  const shown = outcome
    ? SEATS.filter(
        (s) =>
          outcome.tenpai.includes(s) ||
          outcome.wins.some((win) => win.seat === s && win.result !== null),
      )
    : [];
  // 成立したオープンリーチの手牌。ツモ牌は切るまで見せない。
  // 宣言牌に応答できる人には、応答するまで成立していない扱い
  const pending = round.phase === "awaitResponses" ? round.pending : null;
  const responding =
    pending !== null &&
    pending.options[seat] !== null &&
    pending.responses[seat] === null;
  const open = SEATS.filter(
    (s) =>
      round.riichi[s]?.open &&
      !(responding && pending.seat === s && pending.riichiStake !== null),
  );
  return new Set([
    ...round.hands[seat],
    ...shown.flatMap((s) => round.hands[s]),
    ...open.flatMap((s) =>
      round.hands[s].filter((id) => s !== round.turn || id !== round.drawn),
    ),
    ...round.wall.doraIndicators,
    ...round.melds.flat().flatMap((meld) => meld.tiles),
    ...round.flowers.flat(),
    ...round.rivers.flat().map((discard) => discard.tile),
    ...(outcome?.uraIndicators ?? []),
    // ポッチの高め取りは、山にある通常の牌を和了牌として表示する
    ...(outcome?.wins.flatMap((win) =>
      win.winTile === null ? [] : [win.winTile],
    ) ?? []),
  ]);
}

const VIEW_KEYS = [
  "actions",
  "auto",
  "bank",
  "canThink",
  "chips",
  "confirmed",
  "deadline",
  "dealer",
  "dice",
  "diceChance",
  "doraIndicators",
  "drawn",
  "flowers",
  "hand",
  "handCounts",
  "honba",
  "kyotaku",
  "lastDiscard",
  "melds",
  "myDeadline",
  "openHands",
  "outcome",
  "phase",
  "points",
  "result",
  "revealed",
  "riichi",
  "rivers",
  "roundIndex",
  "roundPhase",
  "roundWind",
  "seat",
  "serverNow",
  "startedAt",
  "thinking",
  "turn",
  "wallCount",
];

function assertNoLeak(table: TableState, views: PlayerView[]): void {
  for (const view of views) {
    const seat = view.seat;
    expect(Object.keys(view).sort()).toEqual(VIEW_KEYS);

    const visible = visibleTiles(table, seat);
    for (const tile of tilesInView(view)) {
      if (!visible.has(tile)) {
        throw new Error(`席${seat}の画面データに非公開の牌 ${tile} がある`);
      }
    }
    expect(JSON.stringify(view)).not.toContain(table.game.round.seed);
    for (const other of SEATS) {
      expect(view.handCounts[other]).toBe(table.game.round.hands[other].length);
    }
  }
}

/** 3人の画面データに出ている操作だけを使って、乱数で1半荘を進める。 */
function autoPlay(seedNumber: number): { table: TableState; steps: number } {
  const rng = createRng(seedOf(seedNumber), 7);
  let seedCount = 0;
  const nextSeed = () => seedOf(seedNumber * 1000 + ++seedCount);

  let { table } = startTable({ seed: nextSeed() });
  let steps = 0;
  while (table.game.phase === "playing") {
    const views = SEATS.map((seat) => buildView(table, seat));
    assertNoLeak(table, views);
    const actions = views.flatMap((view) => view.actions);
    expect(actions.length).toBeGreaterThan(0);
    // 和了を優先して局が早く終わるようにする
    const win = actions.find((a) => a.type === "tsumo" || a.type === "ron");
    const action = win ?? actions[rng.nextInt(actions.length)]!;
    table = applyTableAction(table, action, nextSeed).table;
    if (++steps > 20000) throw new Error("対局が終わりません");
  }
  assertNoLeak(
    table,
    SEATS.map((seat) => buildView(table, seat)),
  );
  return { table, steps };
}

describe("startTable（対局の開始）", () => {
  it("起家は席0で、親の手番から始まる", () => {
    const { table, events } = startTable({ seed: seedOf(1) });
    expect(table.game.firstDealer).toBe(0);
    expect(table.game.round.turn).toBe(0);
    expect(table.confirmed).toEqual([false, false, false]);
    expect(events[0]).toEqual({ type: "seed", seed: seedOf(1) });
    expect(events[1]).toMatchObject({ type: "roundStart", roundIndex: 0 });
  });
});

describe("buildView（画面データ）", () => {
  it("自分の手牌と、他家の手牌の枚数だけが入る", () => {
    const { table } = startTable({ seed: seedOf(2) });
    const view = buildView(table, 1);
    expect(view.seat).toBe(1);
    expect(view.hand).toEqual(table.game.round.hands[1]);
    expect(view.handCounts).toEqual([14, 13, 13]);
    expect(view.drawn).toBeNull();
    expect(view.wallCount).toBe(table.game.round.wall.live.length);
  });

  it("ツモ牌は手番の本人にだけ見える", () => {
    const { table } = startTable({ seed: seedOf(2) });
    expect(buildView(table, 0).drawn).toBe(table.game.round.drawn);
    expect(buildView(table, 2).drawn).toBeNull();
  });

  it("可能な操作は手番の人にだけ出る", () => {
    const { table } = startTable({ seed: seedOf(2) });
    expect(buildView(table, 0).actions.length).toBeGreaterThan(0);
    expect(buildView(table, 1).actions).toEqual([]);
    expect(buildView(table, 2).actions).toEqual([]);
  });
});

describe("applyTableAction（操作の適用）", () => {
  it("他人の手番には操作できない", () => {
    const { table } = startTable({ seed: seedOf(3) });
    const tile = table.game.round.hands[1][0]!;
    expect(() =>
      applyTableAction(table, { type: "discard", seat: 1, tile }, () =>
        seedOf(9),
      ),
    ).toThrow(IllegalActionError);
  });

  it("局の途中では結果の確認はできない", () => {
    const { table } = startTable({ seed: seedOf(3) });
    expect(() =>
      applyTableAction(table, { type: "confirm", seat: 0 }, () => seedOf(9)),
    ).toThrow(IllegalActionError);
  });

  it("3人が結果を確認すると次の局が始まり、種が記録される", () => {
    // 局が終わって対局が続いている状態まで進める
    let table: TableState | null = null;
    for (let n = 1; table === null; n++) {
      const rng = createRng(seedOf(n), 3);
      let current = startTable({ seed: seedOf(n) }).table;
      while (
        current.game.phase === "playing" &&
        current.game.round.phase !== "ended"
      ) {
        const actions = SEATS.flatMap((s) => buildView(current, s).actions);
        const action = actions[rng.nextInt(actions.length)]!;
        current = applyTableAction(current, action, () => seedOf(0)).table;
      }
      if (current.game.phase === "playing") table = current;
    }

    for (const seat of SEATS) {
      expect(buildView(table, seat).actions).toEqual([
        { type: "confirm", seat },
      ]);
    }
    const first = applyTableAction(table, { type: "confirm", seat: 0 }, () =>
      seedOf(50),
    );
    expect(first.events).toEqual([]);
    expect(first.table.confirmed).toEqual([true, false, false]);
    expect(buildView(first.table, 0).actions).toEqual([]);
    expect(() =>
      applyTableAction(first.table, { type: "confirm", seat: 0 }, () =>
        seedOf(50),
      ),
    ).toThrow(IllegalActionError);

    const second = applyTableAction(
      first.table,
      { type: "confirm", seat: 1 },
      () => seedOf(50),
    );
    const third = applyTableAction(
      second.table,
      { type: "confirm", seat: 2 },
      () => seedOf(50),
    );
    expect(third.events[0]).toEqual({ type: "seed", seed: seedOf(50) });
    expect(third.events[1]).toMatchObject({ type: "roundStart" });
    expect(third.table.game.round.phase).toBe("awaitTurnAction");
    expect(third.table.game.round.seed).toBe(seedOf(50));
    expect(third.table.confirmed).toEqual([false, false, false]);
    expect(third.table.dice).toEqual([]);
  });

  it("元の状態を書き換えない", () => {
    const { table } = startTable({ seed: seedOf(4) });
    const before = structuredClone(table);
    const action = buildView(table, 0).actions[0]!;
    applyTableAction(table, action, () => seedOf(9));
    expect(table).toEqual(before);
  });
});

const GAMES = 10;

describe("自動対局", () => {
  it("画面データの操作だけで終局まで進み、非公開の牌が混ざらない", () => {
    for (let n = 1; n <= GAMES; n++) {
      const { table } = autoPlay(n);
      expect(table.game.phase).toBe("ended");
      expect(table.game.result).not.toBeNull();
      const view = buildView(table, 0);
      expect(view.result).toEqual(table.game.result);
      expect(view.actions).toEqual([]);
    }
  }, 60_000);
});

describe("オープンリーチ", () => {
  /** 席0がオープンリーチできる配牌。打牌への応答はだれもできない */
  function openRiichiTable(open: boolean): TableState {
    const round = startRoundFromDeck(
      buildDeck({
        hands: [
          "111p234s567s789s4z",
          "19m258p36s4s23z567z",
          "19m369p25s7s23z567z",
        ],
        live: "3z9p9p2z",
      }),
      { dealer: 0 },
    ).state;
    const start = startTable({ seed: seedOf(1) }).table;
    const table: TableState = { ...start, game: { ...start.game, round } };
    const tile = round.hands[0].find((id) =>
      buildView(table, 0).actions.some(
        (a) => a.type === "riichi" && a.tile === id,
      ),
    )!;
    return applyTableAction(
      table,
      {
        type: "riichi",
        seat: 0,
        tile,
        doubleStake: false,
        ...(open && { open: true }),
      },
      () => seedOf(2),
    ).table;
  }

  it("成立したら、その人の手牌が全員に見える", () => {
    const table = openRiichiTable(true);
    const round = table.game.round;
    expect(round.riichi[0]?.open).toBe(true);
    expect(buildView(table, 1).openHands).toEqual([round.hands[0], null, null]);
    expect(buildView(table, 2).riichi[0]).toEqual({
      doubleStake: false,
      open: true,
    });
    assertNoLeak(
      table,
      SEATS.map((seat) => buildView(table, seat)),
    );
  });

  it("通常のリーチでは手牌は見えない", () => {
    const table = openRiichiTable(false);
    expect(buildView(table, 1).openHands).toEqual([null, null, null]);
    expect(buildView(table, 1).riichi[0]).toEqual({ doubleStake: false });
  });

  it("自分の手番のツモ牌は、切るまで他家に見せない", () => {
    let table = openRiichiTable(true);
    // 席1と席2がツモ切りして、席0の手番に戻す
    for (const seat of [1, 2] as const) {
      const drawn = table.game.round.drawn!;
      table = applyTableAction(
        table,
        { type: "discard", seat, tile: drawn },
        () => seedOf(3),
      ).table;
    }
    const round = table.game.round;
    expect(round.turn).toBe(0);
    expect(round.drawn).not.toBeNull();
    const shown = buildView(table, 1).openHands[0]!;
    expect(shown).toHaveLength(13);
    expect(shown).not.toContain(round.drawn);
    assertNoLeak(
      table,
      SEATS.map((seat) => buildView(table, seat)),
    );
  });
});

describe("打牌への応答待ち", () => {
  /** 席1だけが席0の北をポンできる配牌 */
  function ponTable(): TableState {
    const round = startRoundFromDeck(
      buildDeck({
        hands: [
          "111p234s567s789s4z",
          "19m258p36s4z4z3z567z",
          "19m369p25s7s23z567z",
        ],
        live: "3z9p9p2z",
      }),
      { dealer: 0 },
    ).state;
    const start = startTable({ seed: seedOf(1) }).table;
    return { ...start, game: { ...start.game, round } };
  }

  const north = (table: TableState) =>
    table.game.round.hands[0].find((id) => tileOf(id).kind === "4z")!;

  const play = (table: TableState, action: PlayAction) =>
    applyTableAction(table, action, () => seedOf(2)).table;

  /** 応答待ちかどうかで変わりうる項目 */
  const shape = (view: PlayerView) => ({
    roundPhase: view.roundPhase,
    turn: view.turn,
    lastDiscard: view.lastDiscard,
    points: view.points,
    kyotaku: view.kyotaku,
    openHands: view.openHands,
    riichi: view.riichi,
  });

  it("応答できる人にだけ応答待ちが見え、ほかの人には打牌が通ったように見える", () => {
    const start = ponTable();
    const tile = north(start);
    const table = play(start, { type: "discard", seat: 0, tile });
    expect(table.game.round.phase).toBe("awaitResponses");

    const responder = buildView(table, 1);
    expect(responder.roundPhase).toBe("awaitResponses");
    expect(responder.turn).toBe(0);
    expect(responder.lastDiscard).toEqual({ seat: 0, tile });
    expect(responder.actions.some((a) => a.type === "pon")).toBe(true);

    // スルーされて席1の手番になったあとと、見え方が同じ
    const passed = play(table, { type: "pass", seat: 1 });
    for (const seat of [0, 2] as const) {
      const view = buildView(table, seat);
      expect(view.lastDiscard).toBeNull();
      expect(shape(view)).toEqual(shape(buildView(passed, seat)));
    }
    assertNoLeak(
      table,
      SEATS.map((seat) => buildView(table, seat)),
    );
  });

  it("スルーしたあとは、応答した人にも応答待ちを見せない", () => {
    const start = ponTable();
    const table = play(start, { type: "discard", seat: 0, tile: north(start) });
    const round = table.game.round;
    // ほかに応答できる人が残っている状態を作る
    const pending = round.pending!;
    const both: TableState = {
      ...table,
      game: {
        ...table.game,
        round: {
          ...round,
          pending: {
            ...pending,
            options: [null, pending.options[1], pending.options[1]],
            responses: [null, { type: "pass" }, null],
          },
        },
      },
    };
    const view = buildView(both, 1);
    expect(view.roundPhase).toBe("awaitTurnAction");
    expect(view.lastDiscard).toBeNull();
    expect(buildView(both, 2).roundPhase).toBe("awaitResponses");
  });

  it("リーチの宣言牌に応答できる人がいても、ほかの人には供託とオープンリーチの手牌が先に見える", () => {
    const start = ponTable();
    const tile = north(start);
    const table = play(start, {
      type: "riichi",
      seat: 0,
      tile,
      doubleStake: false,
      open: true,
    });
    expect(table.game.round.phase).toBe("awaitResponses");
    const passed = play(table, { type: "pass", seat: 1 });

    expect(shape(buildView(table, 2))).toEqual(shape(buildView(passed, 2)));
    const responder = buildView(table, 1);
    expect(responder.points).toEqual(table.game.round.points);
    expect(responder.kyotaku).toBe(table.game.round.kyotaku);
    expect(responder.openHands[0]).toBeNull();
    assertNoLeak(
      table,
      SEATS.map((seat) => buildView(table, seat)),
    );
  });
});

describe("サイコロチャンス", () => {
  it("出目を指定する人にだけ操作が出て、結果が全員の画面データに載る", () => {
    // 親（席0）の天和
    const round = startRoundFromDeck(
      buildDeck({
        hands: [
          "123p456p789s111s4z",
          "19m258p36s4s23z567z",
          "19m369p25s7s23z567z",
        ],
        live: "4z",
      }),
      { dealer: 0 },
    ).state;
    const start = startTable({ seed: seedOf(1) }).table;
    let table: TableState = { ...start, game: { ...start.game, round } };

    table = applyTableAction(table, { type: "tsumo", seat: 0 }, () =>
      seedOf(2),
    ).table;
    expect(buildView(table, 1).diceChance).toEqual({ seat: 0, remaining: 1 });
    expect(buildView(table, 0).actions).toHaveLength(15);
    expect(buildView(table, 1).actions).toEqual([]);
    expect(buildView(table, 1).revealed[0]).toEqual(round.hands[0]);
    assertNoLeak(
      table,
      SEATS.map((seat) => buildView(table, seat)),
    );

    table = applyTableAction(
      table,
      { type: "dice", seat: 0, faces: [1, 2] },
      () => seedOf(2),
    ).table;
    const view = buildView(table, 2);
    expect(view.diceChance).toBeNull();
    expect(view.dice).toHaveLength(1);
    expect(view.dice[0]).toMatchObject({ seat: 0, faces: [1, 2] });
    expect(view.dice[0]).not.toHaveProperty("type");
    expect(view.actions).toEqual([{ type: "confirm", seat: 2 }]);
  });
});

describe("持ち時間の項目", () => {
  it("clock がなければ、期限なし・自動なしとして出す", () => {
    const { table } = startTable({ seed: seedOf(2) });
    const view = buildView(table, 1);
    expect(view.deadline).toBeNull();
    expect(view.serverNow).toBe(0);
    expect(view.bank).toBe(0);
    expect(view.auto).toEqual([false, false, false]);
  });

  it("期限、保存した時刻、自分の持ち時間、3人の自動を出す。他人の持ち時間は出さない", () => {
    const start = startTable({ seed: seedOf(2) }).table;
    const table: TableState = {
      ...start,
      clock: {
        savedAt: 5_000,
        startedAt: 4_000,
        deadlines: [null, 12_000, 9_000],
        deadline: 9_000,
        bank: [11_111, 22_222, 33_333],
        auto: [false, true, false],
        thinkUsed: [false, false, false],
        thinking: [false, false, false],
      },
    };
    const view = buildView(table, 1);
    expect(view.deadline).toBe(9_000);
    expect(view.myDeadline).toBe(12_000);
    expect(view.startedAt).toBe(4_000);
    expect(buildView(table, 0).myDeadline).toBeNull();
    expect(view.serverNow).toBe(5_000);
    expect(view.bank).toBe(22_222);
    expect(view.auto).toEqual([false, true, false]);
    expect(JSON.stringify(view)).not.toContain("11111");
    expect(JSON.stringify(view)).not.toContain("33333");
  });

  it("次の局へ進んでも clock を引き継ぐ", () => {
    // 親（席0）の天和
    const round = startRoundFromDeck(
      buildDeck({
        hands: [
          "123p456p789s111s4z",
          "19m258p36s4s23z567z",
          "19m369p25s7s23z567z",
        ],
        live: "4z",
      }),
      { dealer: 0 },
    ).state;
    const start = startTable({ seed: seedOf(1) }).table;
    const clock = {
      savedAt: 1,
      startedAt: 1,
      deadlines: [2, null, null] as [number | null, null, null],
      deadline: 2,
      bank: [3, 4, 5] as [number, number, number],
      auto: [false, false, false] as [boolean, boolean, boolean],
      thinkUsed: [true, false, false] as [boolean, boolean, boolean],
      thinking: [false, false, false] as [boolean, boolean, boolean],
    };
    let table: TableState = { ...start, game: { ...start.game, round }, clock };
    const next = () => seedOf(2);
    table = applyTableAction(table, { type: "tsumo", seat: 0 }, next).table;
    table = applyTableAction(
      table,
      { type: "dice", seat: 0, faces: [1, 2] },
      next,
    ).table;
    for (const seat of SEATS) {
      table = applyTableAction(table, { type: "confirm", seat }, next).table;
    }
    expect(table.game.round.phase).toBe("awaitTurnAction");
    expect(table.clock).toEqual(clock);
  });
});

describe("parseAction（クライアントから届いた操作の検証）", () => {
  it("復帰（resume）を受け付ける", () => {
    expect(parseAction({ type: "resume" }, 2)).toEqual({
      type: "resume",
      seat: 2,
    });
  });

  const ok = (input: unknown, expected: TableAction) =>
    expect(parseAction(input, 1)).toEqual(expected);

  it("席はサーバーが決める。送られてきた席は使わない", () => {
    ok({ type: "pass", seat: 2 }, { type: "pass", seat: 1 });
  });

  it("各操作を受け付ける", () => {
    ok({ type: "discard", tile: 5 }, { type: "discard", seat: 1, tile: 5 });
    ok(
      { type: "riichi", tile: 5, doubleStake: true },
      { type: "riichi", seat: 1, tile: 5, doubleStake: true },
    );
    ok(
      { type: "riichi", tile: 5, doubleStake: false, open: true },
      { type: "riichi", seat: 1, tile: 5, doubleStake: false, open: true },
    );
    ok({ type: "tsumo" }, { type: "tsumo", seat: 1 });
    ok({ type: "ankan", kind: "5p" }, { type: "ankan", seat: 1, kind: "5p" });
    ok({ type: "kakan", tile: 111 }, { type: "kakan", seat: 1, tile: 111 });
    ok({ type: "ron" }, { type: "ron", seat: 1 });
    ok({ type: "pon", tiles: [8, 9] }, { type: "pon", seat: 1, tiles: [8, 9] });
    ok({ type: "minkan" }, { type: "minkan", seat: 1 });
    ok(
      { type: "dice", faces: [1, 6] },
      { type: "dice", seat: 1, faces: [1, 6] },
    );
    ok({ type: "confirm" }, { type: "confirm", seat: 1 });
  });

  it("形のおかしい操作は受け付けない", () => {
    const bad: unknown[] = [
      null,
      "discard",
      [],
      {},
      { type: "nextRound", seed: "00" },
      { type: "discard" },
      { type: "discard", tile: "5" },
      { type: "discard", tile: 112 },
      { type: "discard", tile: -1 },
      { type: "discard", tile: 1.5 },
      { type: "riichi", tile: 5 },
      { type: "riichi", tile: 5, doubleStake: "yes" },
      { type: "riichi", tile: 5, doubleStake: false, open: "yes" },
      { type: "ankan", kind: "2m" },
      { type: "pon", tiles: [8] },
      { type: "pon", tiles: [8, 9, 10] },
      { type: "pon", tiles: [8, "9"] },
      { type: "dice", faces: [1] },
      { type: "dice", faces: [0, 7] },
      { type: "dice", faces: [1, 2.5] },
    ];
    for (const input of bad) expect(parseAction(input, 0)).toBeNull();
  });
});
