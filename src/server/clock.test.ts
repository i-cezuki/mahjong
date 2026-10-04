import { describe, expect, it } from "vitest";
import {
  IllegalActionError,
  SEATS,
  diceFaceChoices,
  startRoundFromDeck,
  tileOf,
} from "@/engine";
import type { Seat } from "@/engine";
import { buildDeck, seedOf } from "@/engine/testing";
import { applyTimed, applyTimeout, startClock } from "./clock";
import type { ClockContext, TimedTable } from "./clock";
import { actionsFor, buildView, startTable } from "./table";
import type { PlayAction, TableState } from "./table";

const T0 = 1_000_000;

function ctx(
  now: number,
  pick: (count: number) => number = () => 0,
  drawHold = 0,
) {
  let n = 0;
  const context: ClockContext = {
    now,
    nextSeed: () => seedOf(900 + ++n),
    pick,
    drawHold: () => drawHold,
  };
  return context;
}

function start(seed = 1): TimedTable {
  return startClock(startTable({ seed: seedOf(seed) }).table, T0);
}

function withRound(deck: Parameters<typeof buildDeck>[0]): TimedTable {
  const round = startRoundFromDeck(buildDeck(deck), { dealer: 0 }).state;
  const base = startTable({ seed: seedOf(1) }).table;
  return startClock({ ...base, game: { ...base.game, round } }, T0);
}

/** 親（席0）が天和できる局。和了するとサイコロチャンスになる。 */
const tenhou = () =>
  withRound({
    hands: ["123p456p789s111s4z", "19m258p36s4s23z567z", "19m369p25s7s23z567z"],
    live: "4z",
  });

/** 席0が東を切ると、席1がポンできる局。 */
const ponnable = () =>
  withRound({
    hands: [
      "123456789p 234s 1z",
      "11z 19m 147p 268s 234z",
      "19m 258p 147s 23467z",
    ],
    live: "7z",
  });

const discardsOf = (table: TableState, seat: Seat) =>
  actionsFor(table, seat).filter(
    (a): a is Extract<PlayAction, { type: "discard" }> => a.type === "discard",
  );

/** 待たれている人のうち自動でない1人が、和了も鳴きもせずに進める。 */
function advance(table: TimedTable, now: number): TimedTable {
  const seat = SEATS.find(
    (s) => actionsFor(table, s).length > 0 && !table.clock.auto[s],
  );
  if (seat === undefined) throw new Error("待たれている人がいません");
  const actions = actionsFor(table, seat);
  const discards = discardsOf(table, seat);
  const action =
    actions.find((a) => a.type === "confirm") ??
    actions.find((a) => a.type === "pass") ??
    discards[discards.length - 1] ??
    actions[0]!;
  return applyTimed(table, action, ctx(now)).table;
}

describe("startClock（対局の開始）", () => {
  it("持ち時間は20秒ずつ、最初の手番は5秒＋20秒＋10秒", () => {
    const table = start();
    expect(table.clock).toEqual({
      savedAt: T0,
      startedAt: T0,
      deadlines: [T0 + 35_000, null, null],
      deadline: T0 + 35_000,
      bank: [20_000, 20_000, 20_000],
      auto: [false, false, false],
      thinkUsed: [false, false, false],
      thinking: [false, false, false],
    });
  });
});

describe("applyTimed（操作）", () => {
  it("基本の時間のうちに切れば、持ち時間は減らない", () => {
    const table = start();
    const next = applyTimed(
      table,
      discardsOf(table, 0)[0]!,
      ctx(T0 + 14_000),
    ).table;
    expect(next.clock.bank).toEqual([20_000, 20_000, 20_000]);
    expect(next.clock.savedAt).toBe(T0 + 14_000);
  });

  it("基本の時間を超えた分だけ持ち時間が減る", () => {
    const table = start();
    // 最初の手番は15秒までが基本。22秒で切ると7秒減る
    const next = applyTimed(
      table,
      discardsOf(table, 0)[0]!,
      ctx(T0 + 22_000),
    ).table;
    expect(next.clock.bank).toEqual([13_000, 20_000, 20_000]);
  });

  it("期限を過ぎていても、時間切れが処理される前の操作は受け付ける", () => {
    const table = start();
    const next = applyTimed(
      table,
      discardsOf(table, 0)[0]!,
      ctx(T0 + 40_000),
    ).table;
    expect(next.game.round.rivers[0]).toHaveLength(1);
    expect(next.clock.bank[0]).toBe(0);
    expect(next.clock.auto).toEqual([false, false, false]);
  });

  it("次の待ちの期限は、手番も応答も5秒＋その人の持ち時間", () => {
    const table = ponnable();
    const east = discardsOf(table, 0).find(
      (a) => tileOf(a.tile).kind === "1z",
    )!;
    const waiting = applyTimed(table, east, ctx(T0 + 1_000)).table;
    expect(waiting.game.round.phase).toBe("awaitResponses");
    expect(waiting.clock.startedAt).toBe(T0 + 1_000);
    expect(waiting.clock.deadlines).toEqual([null, T0 + 26_000, null]);
    expect(waiting.clock.deadline).toBe(T0 + 1_000 + 25_000);

    const passed = applyTimed(
      waiting,
      { type: "pass", seat: 1 },
      ctx(T0 + 2_000),
    ).table;
    expect(passed.game.round.phase).toBe("awaitTurnAction");
    expect(passed.game.round.turn).toBe(1);
    expect(passed.clock.deadline).toBe(T0 + 2_000 + 5_000 + 20_000);
  });

  it("不正な操作は IllegalActionError で、元の状態を書き換えない", () => {
    const table = start();
    const before = structuredClone(table);
    const tile = table.game.round.hands[1][0]!;
    expect(() =>
      applyTimed(table, { type: "discard", seat: 1, tile }, ctx(T0 + 30_000)),
    ).toThrow(IllegalActionError);
    applyTimed(table, discardsOf(table, 0)[0]!, ctx(T0 + 30_000));
    expect(table).toEqual(before);
  });

  it("clock のない状態には、操作のときに初期値を補う", () => {
    const legacy = startTable({ seed: seedOf(1) }).table;
    expect(() => applyTimeout(legacy, ctx(T0))).toThrow(IllegalActionError);
    const next = applyTimed(legacy, discardsOf(legacy, 0)[0]!, ctx(T0)).table;
    expect(next.clock.bank).toEqual([20_000, 20_000, 20_000]);
    expect(next.clock.deadline).not.toBeNull();
  });
});

describe("打牌のあとのツモの間", () => {
  const HOLD = 900;
  const east = (table: TimedTable) =>
    discardsOf(table, 0).find((a) => tileOf(a.tile).kind === "1z")!;

  it("打牌が通って次の人がツモったら、その間だけ待ちの開始と期限を遅らせる", () => {
    const table = start();
    const next = applyTimed(
      table,
      discardsOf(table, 0)[0]!,
      ctx(T0 + 1_000, () => 0, HOLD),
    ).table;
    expect(next.game.round.turn).toBe(1);
    expect(next.clock.savedAt).toBe(T0 + 1_000);
    expect(next.clock.startedAt).toBe(T0 + 1_000 + HOLD);
    expect(next.clock.deadlines).toEqual([null, T0 + 26_000 + HOLD, null]);
  });

  it("応答待ちは遅らせず、スルーで打牌が通ったら次の人のツモを遅らせる", () => {
    const table = ponnable();
    const waiting = applyTimed(
      table,
      east(table),
      ctx(T0 + 1_000, () => 0, HOLD),
    ).table;
    expect(waiting.clock.startedAt).toBe(T0 + 1_000);
    const passed = applyTimed(
      waiting,
      { type: "pass", seat: 1 },
      ctx(T0 + 2_000, () => 0, HOLD),
    ).table;
    expect(passed.game.round.turn).toBe(1);
    expect(passed.clock.startedAt).toBe(T0 + 2_000 + HOLD);
    expect(passed.clock.deadlines[1]).toBe(T0 + 27_000 + HOLD);
  });

  it("ポンのあとは遅らせない", () => {
    const table = ponnable();
    const waiting = applyTimed(table, east(table), ctx(T0 + 1_000)).table;
    const pon = actionsFor(waiting, 1).find((a) => a.type === "pon")!;
    const called = applyTimed(
      waiting,
      pon,
      ctx(T0 + 2_000, () => 0, HOLD),
    ).table;
    expect(called.game.round.drawn).toBeNull();
    expect(called.clock.startedAt).toBe(T0 + 2_000);
  });
});

describe("applyTimeout（時間切れ）", () => {
  it("期限前の申告は拒否する", () => {
    const table = start();
    expect(() => applyTimeout(table, ctx(T0 + 34_999))).toThrow(
      IllegalActionError,
    );
  });

  it("手番の時間切れはツモ切りで、その人は自動になり持ち時間がなくなる", () => {
    const table = start();
    const drawn = table.game.round.drawn;
    const before = structuredClone(table);
    const next = applyTimeout(table, ctx(T0 + 35_000)).table;
    expect(next.game.round.rivers[0]).toEqual([
      expect.objectContaining({ tile: drawn, tsumogiri: true }),
    ]);
    expect(next.clock.auto).toEqual([true, false, false]);
    expect(next.clock.bank[0]).toBe(0);
    expect(table).toEqual(before);
  });

  it("応答の時間切れはスルーで、自動になった人の手番も同じ処理の中で進む", () => {
    const table = ponnable();
    const east = discardsOf(table, 0).find(
      (a) => tileOf(a.tile).kind === "1z",
    )!;
    const waiting = applyTimed(table, east, ctx(T0 + 1_000)).table;
    expect(() => applyTimeout(waiting, ctx(T0 + 25_999))).toThrow(
      IllegalActionError,
    );
    const next = applyTimeout(waiting, ctx(T0 + 26_000)).table;
    expect(next.clock.auto).toEqual([false, true, false]);
    expect(next.clock.bank[1]).toBe(0);
    expect(next.game.round.melds[1]).toEqual([]);
    // スルーのあとの席1の手番は、待たずにツモ切りになる
    expect(next.game.round.rivers[1]).toEqual([
      expect.objectContaining({ tsumogiri: true }),
    ]);
    expect(actionsFor(next, 1)).toEqual([]);
  });

  it("ポン直後の時間切れは、切れる牌の右端を切る", () => {
    const table = ponnable();
    const east = discardsOf(table, 0).find(
      (a) => tileOf(a.tile).kind === "1z",
    )!;
    const waiting = applyTimed(table, east, ctx(T0 + 1_000)).table;
    const pon = actionsFor(waiting, 1).find((a) => a.type === "pon")!;
    const called = applyTimed(waiting, pon, ctx(T0 + 2_000)).table;
    expect(called.game.round.drawn).toBeNull();
    expect(called.clock.deadline).toBe(T0 + 2_000 + 25_000);

    const choices = discardsOf(called, 1);
    const next = applyTimeout(called, ctx(T0 + 27_000)).table;
    expect(next.game.round.rivers[1][0]!.tile).toBe(
      choices[choices.length - 1]!.tile,
    );
    expect(next.clock.auto[1]).toBe(true);
  });

  it("自動の人がいても、残りの2人の操作だけで次の局まで進む", () => {
    let table = applyTimeout(start(), ctx(T0 + 35_000)).table;
    let now = T0 + 36_000;
    let steps = 0;
    const sameRound = () =>
      table.game.phase === "playing" &&
      table.game.roundIndex === 0 &&
      table.game.honba === 0;
    while (sameRound()) {
      // 自動の席0が待たれることはない
      expect(actionsFor(table, 0)).toEqual([]);
      table = advance(table, (now += 1_000));
      if (++steps > 1_000) throw new Error("局が終わりません");
    }
    expect(table.clock.auto).toEqual([true, false, false]);
    if (table.game.phase === "playing") {
      expect(table.clock.bank).toEqual([20_000, 20_000, 20_000]);
    }
  });

  it("サイコロの指定は20秒。時間切れなら乱数で選び、その人は自動になる", () => {
    const table = tenhou();
    const chance = applyTimed(
      table,
      { type: "tsumo", seat: 0 },
      ctx(T0 + 1_000),
    ).table;
    expect(chance.game.round.phase).toBe("diceChance");
    expect(chance.clock.deadline).toBe(T0 + 1_000 + 20_000);

    const now = T0 + 21_000;
    const next = applyTimeout(
      chance,
      ctx(now, () => 3),
    ).table;
    expect(next.dice).toHaveLength(1);
    expect(next.dice[0]!.faces).toEqual(diceFaceChoices()[3]);
    expect(next.clock.auto).toEqual([true, false, false]);
    // 自動の人は局の結果を確認済みになる。残りの2人には、演出の長さを足した期限が付く
    expect(next.confirmed).toEqual([true, false, false]);
    expect(next.clock.deadline).toBe(
      now + 15_000 + next.dice[0]!.rolls.length * 2_200,
    );
  });

  it("局の結果は15秒で次の局へ進み、誰も自動にならず、持ち時間が戻る", () => {
    const chance = applyTimed(
      tenhou(),
      { type: "tsumo", seat: 0 },
      ctx(T0 + 1_000),
    ).table;
    const result = applyTimed(
      chance,
      { type: "dice", seat: 0, faces: [1, 2] },
      ctx(T0 + 2_000),
    ).table;
    const deadline = T0 + 2_000 + 15_000 + result.dice[0]!.rolls.length * 2_200;
    expect(result.clock.deadline).toBe(deadline);

    // 1人が確認しても期限は変わらない
    const one = applyTimed(
      result,
      { type: "confirm", seat: 1 },
      ctx(T0 + 3_000),
    ).table;
    expect(one.clock.deadline).toBe(deadline);
    expect(one.clock.savedAt).toBe(T0 + 3_000);

    const spent: TimedTable = {
      ...one,
      clock: { ...one.clock, bank: [1, 2, 3] },
    };
    const step = applyTimeout(spent, ctx(deadline));
    expect(step.events.some((event) => event.type === "roundStart")).toBe(true);
    expect(step.table.game.round.phase).toBe("awaitTurnAction");
    expect(step.table.confirmed).toEqual([false, false, false]);
    expect(step.table.clock.auto).toEqual([false, false, false]);
    expect(step.table.clock.bank).toEqual([20_000, 20_000, 20_000]);
    expect(step.table.clock.deadline).toBe(deadline + 25_000);
  });
});

describe("3人とも自動", () => {
  function frozen(): TimedTable {
    const base = start();
    const table: TimedTable = {
      ...base,
      clock: { ...base.clock, auto: [false, true, true] },
    };
    return applyTimeout(table, ctx(T0 + 35_000)).table;
  }

  it("進行を止めて、期限をなくす", () => {
    const table = frozen();
    expect(table.clock.auto).toEqual([true, true, true]);
    expect(table.clock.deadline).toBeNull();
    expect(table.game.round.rivers[0]).toEqual([]);
    expect(() => applyTimeout(table, ctx(T0 + 999_000))).toThrow(
      IllegalActionError,
    );
  });

  it("待たれている本人が復帰すると、5秒の期限で再開する", () => {
    const next = applyTimed(
      frozen(),
      { type: "resume", seat: 0 },
      ctx(T0 + 100_000),
    ).table;
    expect(next.clock.auto).toEqual([false, true, true]);
    expect(next.clock.deadline).toBe(T0 + 100_000 + 5_000);
    expect(actionsFor(next, 0).length).toBeGreaterThan(0);
  });

  it("ほかの人が復帰すると、自動の人の番を進めてから期限を付ける", () => {
    const next = applyTimed(
      frozen(),
      { type: "resume", seat: 1 },
      ctx(T0 + 100_000),
    ).table;
    expect(next.clock.auto).toEqual([true, false, true]);
    expect(next.game.round.rivers[0]).toHaveLength(1);
    expect(next.clock.deadline).not.toBeNull();
  });

  it("自動の人が自分で操作しても解除される", () => {
    const table = frozen();
    const next = applyTimed(
      table,
      discardsOf(table, 0)[0]!,
      ctx(T0 + 100_000),
    ).table;
    expect(next.clock.auto[0]).toBe(false);
    expect(next.game.round.rivers[0]).toHaveLength(1);
  });
});

describe("復帰（resume）", () => {
  it("自動でない人の復帰は拒否する", () => {
    expect(() =>
      applyTimed(start(), { type: "resume", seat: 1 }, ctx(T0 + 1_000)),
    ).toThrow(IllegalActionError);
  });

  it("待ちの途中で復帰しても、その待ちの期限は変えない", () => {
    const base = start();
    const table: TimedTable = {
      ...base,
      clock: { ...base.clock, auto: [false, true, false] },
    };
    const next = applyTimed(
      table,
      { type: "resume", seat: 1 },
      ctx(T0 + 1_000),
    ).table;
    expect(next.clock.auto).toEqual([false, false, false]);
    expect(next.clock.deadline).toBe(T0 + 35_000);
    expect(next.clock.savedAt).toBe(T0 + 1_000);
  });
});

describe("持ち時間（長考）の消費", () => {
  /** 席1の最初の手番まで、ほかの人を1秒ずつで進める。 */
  function firstTurnOf1(): { table: TimedTable; at: number } {
    let table = start();
    let now = T0;
    while (!(
      table.game.round.phase === "awaitTurnAction" &&
      table.game.round.turn === 1
    )) {
      table = advance(table, (now += 1_000));
    }
    return { table, at: table.clock.startedAt! };
  }

  /** 席1の次の手番まで、ほかの人の判断を1秒ずつで進める。 */
  function nextTurnOf1(table: TimedTable, now: number) {
    const turns = table.game.round.rivers[1].length;
    while (!(
      table.game.round.phase === "awaitTurnAction" &&
      table.game.round.turn === 1 &&
      table.game.round.rivers[1].length > turns
    )) {
      table = advance(table, (now += 1_000));
    }
    return { table, at: table.clock.startedAt! };
  }

  const discardAfter = (table: TimedTable, at: number, ms: number) =>
    applyTimed(table, discardsOf(table, 1)[0]!, ctx(at + ms)).table;

  it("待ちが始まった時刻と、5秒＋持ち時間の期限を保存する", () => {
    const { table, at } = firstTurnOf1();
    expect(table.clock.deadlines).toEqual([null, at + 25_000, null]);
    expect(table.clock.deadline).toBe(at + 25_000);
  });

  it("3秒で切れば持ち時間は20秒のまま", () => {
    const { table, at } = firstTurnOf1();
    expect(discardAfter(table, at, 3_000).clock.bank[1]).toBe(20_000);
  });

  it("8秒で切れば持ち時間は17秒。次の手番を2秒で切れば17秒のまま", () => {
    const first = firstTurnOf1();
    const after8 = discardAfter(first.table, first.at, 8_000);
    expect(after8.clock.bank[1]).toBe(17_000);

    const second = nextTurnOf1(after8, first.at + 8_000);
    // 基本の5秒は毎回戻る
    expect(second.table.clock.deadlines[1]).toBe(second.at + 5_000 + 17_000);
    const after2 = discardAfter(second.table, second.at, 2_000);
    expect(after2.clock.bank[1]).toBe(17_000);
  });

  it("持ち時間が3秒しかなければ8秒で時間切れになり、ツモ切りされる", () => {
    const first = firstTurnOf1();
    const spent = discardAfter(first.table, first.at, 22_000);
    expect(spent.clock.bank[1]).toBe(3_000);

    const { table, at } = nextTurnOf1(spent, first.at + 22_000);
    expect(table.clock.deadlines[1]).toBe(at + 8_000);
    expect(() => applyTimeout(table, ctx(at + 7_999))).toThrow(
      IllegalActionError,
    );
    const drawn = table.game.round.drawn;
    const next = applyTimeout(table, ctx(at + 8_000)).table;
    expect(next.game.round.rivers[1].at(-1)).toEqual(
      expect.objectContaining({ tile: drawn, tsumogiri: true }),
    );
    expect(next.clock.auto[1]).toBe(true);
  });

  it("応答（ポン、スルー）も5秒を超えた分だけ持ち時間を使う", () => {
    const table = ponnable();
    const east = discardsOf(table, 0).find(
      (a) => tileOf(a.tile).kind === "1z",
    )!;
    const waiting = applyTimed(table, east, ctx(T0 + 1_000)).table;
    const passed = applyTimed(
      waiting,
      { type: "pass", seat: 1 },
      ctx(T0 + 1_000 + 8_000),
    ).table;
    expect(passed.clock.bank).toEqual([20_000, 17_000, 20_000]);
    // スルーした席1の手番は、また基本の5秒＋残りの17秒
    expect(passed.clock.deadlines[1]).toBe(T0 + 9_000 + 5_000 + 17_000);
  });

  it("持ち時間は局の中で手番と応答をまたいで引き継ぎ、局が変わると20秒に戻る", () => {
    const first = firstTurnOf1();
    let table = discardAfter(first.table, first.at, 12_000);
    expect(table.clock.bank[1]).toBe(13_000);
    let now = first.at + 12_000;
    const round = table.game.roundIndex;
    const honba = table.game.honba;
    while (
      table.game.phase === "playing" &&
      table.game.roundIndex === round &&
      table.game.honba === honba
    ) {
      // 同じ局の間は、使った分が戻らない
      expect(table.clock.bank[1]).toBeLessThanOrEqual(13_000);
      table = advance(table, (now += 1_000));
    }
    if (table.game.phase === "playing") {
      expect(table.clock.bank).toEqual([20_000, 20_000, 20_000]);
    }
  });
});

describe("長考ボタン（think）", () => {
  const think = (seat: Seat) => ({ type: "think" as const, seat });

  /** 席1の最初の手番。席0は1秒で切る。 */
  function turnOf1(): { table: TimedTable; at: number } {
    const table = advance(start(), T0 + 1_000);
    return { table, at: table.clock.startedAt! };
  }

  it("押すと、期限が今＋30秒＋持ち時間になる（残りの基本の時間は消える）", () => {
    const { table, at } = turnOf1();
    const next = applyTimed(table, think(1), ctx(at + 2_000)).table;
    expect(next.clock.deadlines[1]).toBe(at + 2_000 + 30_000 + 20_000);
    expect(next.clock.deadline).toBe(at + 52_000);
    expect(next.clock.thinkUsed).toEqual([false, true, false]);
    expect(next.clock.thinking).toEqual([false, true, false]);
    expect(next.game).toBe(table.game);
  });

  it("持ち時間を使っている途中で押すと、その時点の残りに30秒を足す", () => {
    const { table, at } = turnOf1();
    // 12秒経過で持ち時間は残り13秒
    const next = applyTimed(table, think(1), ctx(at + 12_000)).table;
    expect(next.clock.bank[1]).toBe(13_000);
    expect(next.clock.deadlines[1]).toBe(at + 12_000 + 30_000 + 13_000);
  });

  it("30秒のうちに切れば持ち時間は減らず、余りは消える", () => {
    const { table, at } = turnOf1();
    const thought = applyTimed(table, think(1), ctx(at + 1_000)).table;
    const next = applyTimed(
      thought,
      discardsOf(thought, 1)[0]!,
      ctx(at + 1_000 + 29_000),
    ).table;
    expect(next.clock.bank[1]).toBe(20_000);
    expect(next.clock.thinking).toEqual([false, false, false]);
    expect(next.clock.thinkUsed).toEqual([false, true, false]);
  });

  it("30秒を超えた分は持ち時間から減る", () => {
    const { table, at } = turnOf1();
    const thought = applyTimed(table, think(1), ctx(at + 1_000)).table;
    const next = applyTimed(
      thought,
      discardsOf(thought, 1)[0]!,
      ctx(at + 1_000 + 37_000),
    ).table;
    expect(next.clock.bank[1]).toBe(13_000);
  });

  it("1局に1回だけ。局が変わると、また押せる", () => {
    const { table, at } = turnOf1();
    let next = applyTimed(table, think(1), ctx(at + 1_000)).table;
    expect(() => applyTimed(next, think(1), ctx(at + 2_000))).toThrow(
      IllegalActionError,
    );
    let now = at + 2_000;
    const round = next.game.roundIndex;
    const honba = next.game.honba;
    while (
      next.game.phase === "playing" &&
      next.game.roundIndex === round &&
      next.game.honba === honba
    ) {
      next = advance(next, (now += 1_000));
    }
    if (next.game.phase === "playing") {
      expect(next.clock.thinkUsed).toEqual([false, false, false]);
    }
  });

  it("応答待ちでも押せて、もう1人の期限は変わらない", () => {
    const doubleRon = withRound({
      hands: [
        "123456789p 234s 8s",
        "123s 567s 111z 666z 8s",
        "456p 789p 777z 222z 8s",
      ],
      live: "3z",
    });
    const action = discardsOf(doubleRon, 0).find(
      (a) => tileOf(a.tile).kind === "8s",
    )!;
    const waiting = applyTimed(doubleRon, action, ctx(T0 + 1_000)).table;
    const next = applyTimed(waiting, think(2), ctx(T0 + 2_000)).table;
    expect(next.clock.deadlines).toEqual([
      null,
      T0 + 26_000,
      T0 + 2_000 + 50_000,
    ]);
    expect(next.clock.deadline).toBe(T0 + 26_000);
  });

  it("待たれていない人、自動の人、サイコロの指定では押せない", () => {
    const { table, at } = turnOf1();
    expect(() => applyTimed(table, think(0), ctx(at + 1_000))).toThrow(
      IllegalActionError,
    );
    const auto: TimedTable = {
      ...table,
      clock: { ...table.clock, auto: [false, true, true] },
    };
    expect(() => applyTimed(auto, think(1), ctx(at + 1_000))).toThrow(
      IllegalActionError,
    );
    const dice = applyTimed(
      tenhou(),
      { type: "tsumo", seat: 0 },
      ctx(T0 + 1_000),
    ).table;
    expect(dice.game.round.phase).toBe("diceChance");
    const chooser = SEATS.find((s) => dice.clock.deadlines[s] !== null)!;
    expect(() => applyTimed(dice, think(chooser), ctx(T0 + 2_000))).toThrow(
      IllegalActionError,
    );
  });

  it("画面データに、押せるかと30秒を使っているかを出す", () => {
    const { table, at } = turnOf1();
    expect(buildView(table, 1)).toMatchObject({
      canThink: true,
      thinking: false,
    });
    expect(buildView(table, 0)).toMatchObject({ canThink: false });
    const next = applyTimed(table, think(1), ctx(at + 1_000)).table;
    expect(buildView(next, 1)).toMatchObject({
      canThink: false,
      thinking: true,
    });
  });
});

describe("二重の確定を防ぐ", () => {
  it("期限直前の打牌が先に確定したら、古い期限での時間切れは通らない", () => {
    const table = start();
    const deadline = table.clock.deadline!;
    const discarded = applyTimed(
      table,
      discardsOf(table, 0)[0]!,
      ctx(deadline - 1),
    ).table;
    expect(() => applyTimeout(discarded, ctx(deadline))).toThrow(
      IllegalActionError,
    );
    expect(discarded.game.round.rivers[0]).toHaveLength(1);
  });

  it("時間切れのツモ切りが先に確定したら、遅れて届いた打牌は通らない", () => {
    const table = start();
    const late = discardsOf(table, 0)[0]!;
    const timedOut = applyTimeout(table, ctx(table.clock.deadline!)).table;
    expect(() =>
      applyTimed(timedOut, late, ctx(table.clock.deadline! + 1)),
    ).toThrow(IllegalActionError);
    expect(timedOut.game.round.rivers[0]).toHaveLength(1);
  });
});

describe("複数の人が応答できる打牌", () => {
  /** 席0が8索を切ると、席1と席2がどちらもロンできる局。 */
  const doubleRon = () =>
    withRound({
      hands: [
        "123456789p 234s 8s",
        "123s 567s 111z 666z 8s",
        "456p 789p 777z 222z 8s",
      ],
      live: "3z",
    });

  /** 席0が8索を切ると、席1がロン、席2がポンできる局。 */
  const ronAndPon = () =>
    withRound({
      hands: [
        "123456789p 234s 8s",
        "123s 567s 111z 666z 8s",
        "456p 789p 777z 88s 2z 3z",
      ],
      live: "4z",
    });

  function discard8s(table: TimedTable, now: number): TimedTable {
    const action = discardsOf(table, 0).find(
      (a) => tileOf(a.tile).kind === "8s",
    )!;
    return applyTimed(table, action, ctx(now)).table;
  }

  it("2人にそれぞれの持ち時間で期限を付ける", () => {
    const base = doubleRon();
    const table: TimedTable = {
      ...base,
      clock: { ...base.clock, bank: [20_000, 20_000, 3_000] },
    };
    const waiting = discard8s(table, T0 + 1_000);
    expect(waiting.game.round.phase).toBe("awaitResponses");
    expect(actionsFor(waiting, 1)).toContainEqual({ type: "ron", seat: 1 });
    expect(actionsFor(waiting, 2)).toContainEqual({ type: "ron", seat: 2 });
    expect(waiting.clock.deadlines).toEqual([null, T0 + 26_000, T0 + 9_000]);
    expect(waiting.clock.deadline).toBe(T0 + 9_000);

    // 席2だけが時間切れ。席1の待ちと期限はそのまま続く
    const next = applyTimeout(waiting, ctx(T0 + 9_000)).table;
    expect(next.game.round.phase).toBe("awaitResponses");
    expect(next.clock.auto).toEqual([false, false, true]);
    expect(next.clock.deadlines).toEqual([null, T0 + 26_000, null]);
    expect(next.clock.deadline).toBe(T0 + 26_000);
    expect(actionsFor(next, 1)).toContainEqual({ type: "ron", seat: 1 });
  });

  it("1人がロンしても、もう1人の判断か時間切れまで待ってから解決する", () => {
    const waiting = discard8s(doubleRon(), T0 + 1_000);
    const one = applyTimed(
      waiting,
      { type: "ron", seat: 1 },
      ctx(T0 + 2_000),
    ).table;
    expect(one.game.round.phase).toBe("awaitResponses");
    expect(one.clock.deadlines).toEqual([null, null, T0 + 26_000]);

    const done = applyTimeout(one, ctx(T0 + 26_000)).table;
    expect(done.game.round.phase).not.toBe("awaitResponses");
    const wins = done.game.round.outcome!.wins.map((win) => win.seat);
    expect(wins).toEqual([1]);
  });

  it("2人ともロンすれば、そろった時点で解決する", () => {
    const waiting = discard8s(doubleRon(), T0 + 1_000);
    const one = applyTimed(
      waiting,
      { type: "ron", seat: 2 },
      ctx(T0 + 2_000),
    ).table;
    const done = applyTimed(
      one,
      { type: "ron", seat: 1 },
      ctx(T0 + 3_000),
    ).table;
    const wins = done.game.round.outcome!.wins.map((win) => win.seat);
    expect(wins.sort()).toEqual([1, 2]);
  });

  it("ポンが先に答えても、ロンできる人の判断を待ち、ロンを優先する", () => {
    const waiting = discard8s(ronAndPon(), T0 + 1_000);
    const pon = actionsFor(waiting, 2).find((a) => a.type === "pon")!;
    const ponned = applyTimed(waiting, pon, ctx(T0 + 2_000)).table;
    expect(ponned.game.round.phase).toBe("awaitResponses");
    expect(ponned.game.round.melds[2]).toEqual([]);

    const ron = applyTimed(
      ponned,
      { type: "ron", seat: 1 },
      ctx(T0 + 3_000),
    ).table;
    expect(ron.game.round.melds[2]).toEqual([]);
    expect(ron.game.round.outcome!.wins.map((win) => win.seat)).toEqual([1]);
  });

  it("ロンできる人が時間切れならスルーになり、ポンが通る", () => {
    const waiting = discard8s(ronAndPon(), T0 + 1_000);
    const pon = actionsFor(waiting, 2).find((a) => a.type === "pon")!;
    const ponned = applyTimed(waiting, pon, ctx(T0 + 2_000)).table;
    const next = applyTimeout(ponned, ctx(T0 + 26_000)).table;
    expect(next.clock.auto).toEqual([false, true, false]);
    expect(next.game.round.melds[2]).toHaveLength(1);
    expect(next.game.round.phase).toBe("awaitTurnAction");
    expect(next.game.round.turn).toBe(2);
    // ポンした人の手番は、改めて5秒＋持ち時間
    expect(next.clock.deadlines[2]).toBe(T0 + 26_000 + 25_000);
  });
});

describe("再接続と別のタブ", () => {
  it("画面データの期限はサーバーの絶対時刻で、何度作り直しても延びない", () => {
    const table = start();
    const views = [buildView(table, 0), buildView(table, 0)];
    for (const view of views) {
      expect(view.myDeadline).toBe(T0 + 35_000);
      expect(view.startedAt).toBe(T0);
      expect(view.bank).toBe(20_000);
    }
  });

  it("復帰の操作で待ちの期限や持ち時間を延ばすことはできない", () => {
    const table = start();
    expect(() =>
      applyTimed(table, { type: "resume", seat: 0 }, ctx(T0 + 30_000)),
    ).toThrow(IllegalActionError);
  });

  it("持ち時間を使った人が復帰しても、その局の持ち時間は戻らない", () => {
    const timedOut = applyTimeout(start(), ctx(T0 + 35_000)).table;
    const resumed = applyTimed(
      timedOut,
      { type: "resume", seat: 0 },
      ctx(T0 + 36_000),
    ).table;
    expect(resumed.clock.bank[0]).toBe(0);
  });
});

describe("席ごとの期限がない状態（以前に保存された対局）", () => {
  it("待たれている人全員に、保存されていた期限を補う", () => {
    const table = ponnable();
    const east = discardsOf(table, 0).find(
      (a) => tileOf(a.tile).kind === "1z",
    )!;
    const waiting = applyTimed(table, east, ctx(T0 + 1_000)).table;
    const legacy = {
      ...waiting,
      clock: {
        savedAt: T0 + 1_000,
        deadline: T0 + 16_000,
        bank: waiting.clock.bank,
        auto: waiting.clock.auto,
      },
    } as unknown as TableState;
    expect(() => applyTimeout(legacy, ctx(T0 + 15_999))).toThrow(
      IllegalActionError,
    );
    const next = applyTimeout(legacy, ctx(T0 + 16_000)).table;
    expect(next.clock.auto).toEqual([false, true, false]);
    expect(next.clock.deadlines.every((d) => d === null || d > T0)).toBe(true);
  });
});
