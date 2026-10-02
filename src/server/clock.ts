import { IllegalActionError, SEATS } from "@/engine";
import type { PerSeat, Seat } from "@/engine";
import {
  BANK_MS,
  DICE_CHOICE_MS,
  DICE_STEP_MS,
  FIRST_TURN_GRACE_MS,
  RESPONSE_MS,
  RESULT_MS,
  TURN_BASE_MS,
} from "@/lib/timing";
import { actionsFor, applyTableAction } from "./table";
import type {
  Clock,
  PlayAction,
  TableAction,
  TableEvent,
  TableState,
} from "./table";

/*
 * 持ち時間のルール。エンジンは時刻を知らないので、ここで期限と自動処理を決める。
 * UI、DB、通信には依存しない。現在時刻と乱数は呼び出す側が渡す。
 */

export interface ClockContext {
  /** サーバーの現在時刻（エポックms） */
  now: number;
  /** 次の局を始めるときにだけ呼ぶ。新しい乱数の種を返す。 */
  nextSeed: () => string;
  /** 0 以上 count 未満の整数を返す乱数。サイコロの出目の自動指定に使う。 */
  pick: (count: number) => number;
}

export type TimedTable = TableState & { clock: Clock };

export interface TimedStep {
  table: TimedTable;
  events: TableEvent[];
}

const fullBank = (): PerSeat<number> => [BANK_MS, BANK_MS, BANK_MS];

/** 持ち時間が満ちていて、誰も自動でなく、まだ何も待っていない時計。 */
const newClock = (now: number): Clock => ({
  savedAt: now,
  deadline: null,
  bank: fullBank(),
  auto: [false, false, false],
});

/** 書き換えてよい写しを作る。clock のない状態（フェーズ8より前に始まった対局）には初期値を補う。 */
function timed(table: TableState, now: number): TimedTable {
  const clock = table.clock;
  return {
    ...table,
    clock: clock
      ? { ...clock, bank: [...clock.bank], auto: [...clock.auto] }
      : newClock(now),
  };
}

function waitedSeats(table: TableState): Seat[] {
  return SEATS.filter((seat) => actionsFor(table, seat).length > 0);
}

/**
 * いまの待ちの長さ。
 * @param diceThrows この保存で振ったサイコロの回数。画面の演出が終わるまでの分を足す。
 */
function waitMs(table: TimedTable, diceThrows: number): number {
  const round = table.game.round;
  switch (round.phase) {
    case "awaitTurnAction":
      return TURN_BASE_MS + table.clock.bank[round.turn];
    case "awaitResponses":
      return RESPONSE_MS;
    case "diceChance":
      return DICE_CHOICE_MS + diceThrows * DICE_STEP_MS;
    case "ended":
      return RESULT_MS + diceThrows * DICE_STEP_MS;
  }
}

/** 操作の前後で、同じ待ちが続いているか。続いていれば期限を変えない。 */
function sameWait(before: TableState, after: TableState): boolean {
  // 局の結果を1人が確認しただけ、または復帰しただけ
  if (before.game === after.game) return true;
  // 応答できる2人のうち1人だけが応答した
  const a = before.game.round;
  const b = after.game.round;
  return (
    a.phase === "awaitResponses" &&
    b.phase === "awaitResponses" &&
    a.pending?.tile === b.pending?.tile
  );
}

/** 時間切れや即ツモ切りで、本人の代わりに行う操作。和了できる形でも和了しない。 */
function autoAction(
  table: TimedTable,
  seat: Seat,
  ctx: ClockContext,
): PlayAction {
  const actions = actionsFor(table, seat);
  const confirm = actions.find((a) => a.type === "confirm");
  if (confirm) return confirm;
  const dice = actions.filter((a) => a.type === "dice");
  if (dice.length > 0) return dice[ctx.pick(dice.length)]!;
  const pass = actions.find((a) => a.type === "pass");
  if (pass) return pass;
  const discards = actions.filter(
    (a): a is Extract<PlayAction, { type: "discard" }> => a.type === "discard",
  );
  // ツモ牌がない（ポン直後）ときは、切れる牌の右端を切る
  const drawn = table.game.round.drawn;
  return (
    discards.find((a) => a.tile === drawn) ?? discards[discards.length - 1]!
  );
}

/** 操作を1つ適用する。局が変わったら持ち時間を戻す。 */
function applyOne(
  table: TimedTable,
  action: PlayAction,
  ctx: ClockContext,
  events: TableEvent[],
): TimedTable {
  const step = applyTableAction(table, action, ctx.nextSeed);
  events.push(...step.events);
  const newRound = step.events.some((event) => event.type === "roundStart");
  return {
    ...step.table,
    clock: { ...table.clock, ...(newRound && { bank: fullBank() }) },
  };
}

/**
 * 自動の人が待たれている間、その人の番を続けて進め、止まったところで期限を決める。
 * 3人とも自動なら進めずに止める（1回の保存で半荘が最後まで進まないようにする）。
 * @param fresh 新しい待ちが始まった。false なら、いまの期限を変えない。
 */
function settle(
  start: TimedTable,
  events: TableEvent[],
  ctx: ClockContext,
  fresh: boolean,
): TimedStep {
  let table = start;
  let isFresh = fresh;
  const stopped = () =>
    table.game.phase !== "playing" || table.clock.auto.every(Boolean);

  while (!stopped()) {
    const seat = waitedSeats(table).find((s) => table.clock.auto[s]);
    if (seat === undefined) break;
    const before = table;
    table = applyOne(table, autoAction(table, seat, ctx), ctx, events);
    isFresh ||= !sameWait(before, table);
  }

  const clock: Clock = { ...table.clock, savedAt: ctx.now };
  if (stopped()) {
    clock.deadline = null;
  } else if (isFresh || clock.deadline === null) {
    const diceThrows = events.reduce(
      (total, event) =>
        event.type === "dice" ? total + event.rolls.length : total,
      0,
    );
    clock.deadline = ctx.now + waitMs({ ...table, clock }, diceThrows);
  }
  return { table: { ...table, clock }, events };
}

/** 対局の開始。持ち時間を満たし、最初の手番の期限を決める。 */
export function startClock(table: TableState, now: number): TimedTable {
  const start: TimedTable = { ...table, clock: newClock(now) };
  return {
    ...start,
    clock: {
      ...start.clock,
      deadline: now + waitMs(start, 0) + FIRST_TURN_GRACE_MS,
    },
  };
}

/**
 * プレイヤーの操作を適用する。不正な操作は IllegalActionError。
 * 期限を過ぎていても、時間切れが処理される前に届いた操作は受け付ける。
 */
export function applyTimed(
  input: TableState,
  action: TableAction,
  ctx: ClockContext,
): TimedStep {
  const table = timed(input, ctx.now);
  const { seat } = action;

  if (action.type === "resume") {
    if (!table.clock.auto[seat]) throw new IllegalActionError("notAllowed");
    table.clock.auto[seat] = false;
    return settle(table, [], ctx, false);
  }

  // 手番の操作なら、基本の時間を超えた分を持ち時間から引く。
  // 期限は「基本の時間＋持ち時間」なので、期限までの残りが持ち時間より短ければ、それが新しい持ち時間になる
  const round = table.game.round;
  const { deadline } = table.clock;
  if (
    round.phase === "awaitTurnAction" &&
    round.turn === seat &&
    deadline !== null
  ) {
    table.clock.bank[seat] = Math.min(
      table.clock.bank[seat],
      Math.max(0, deadline - ctx.now),
    );
  }

  const events: TableEvent[] = [];
  const next = applyOne(table, action, ctx, events);
  // 本人が操作したので、即ツモ切りを解除する
  next.clock.auto[seat] = false;
  return settle(next, events, ctx, !sameWait(table, next));
}

/**
 * 時間切れを処理する。期限前、または期限のない状態なら IllegalActionError。
 * 待たれていた人を自動にして、その人の番を進める。局の結果の時間切れでは自動にしない。
 */
export function applyTimeout(input: TableState, ctx: ClockContext): TimedStep {
  let table = timed(input, ctx.now);
  const { deadline } = table.clock;
  if (
    table.game.phase !== "playing" ||
    deadline === null ||
    ctx.now < deadline
  ) {
    throw new IllegalActionError("notAllowed");
  }

  const events: TableEvent[] = [];
  const round = table.game.round;
  if (round.phase === "ended") {
    for (const seat of waitedSeats(table)) {
      table = applyOne(table, { type: "confirm", seat }, ctx, events);
    }
  } else {
    for (const seat of waitedSeats(table)) table.clock.auto[seat] = true;
    if (round.phase === "awaitTurnAction") table.clock.bank[round.turn] = 0;
  }
  return settle(table, events, ctx, true);
}
