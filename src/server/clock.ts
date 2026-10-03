import { IllegalActionError, SEATS } from "@/engine";
import type { PerSeat, Seat } from "@/engine";
import {
  BANK_MS,
  BASE_MS,
  DICE_CHOICE_MS,
  DICE_STEP_MS,
  FIRST_TURN_GRACE_MS,
  RESULT_MS,
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
 *
 * 手番の操作と他家の打牌への応答は、判断のたびに「基本5秒＋その人の残り持ち時間」。
 * 基本の5秒を超えた分だけ持ち時間（長考）が減り、局が変わると3人とも20秒に戻る。
 * 応答できる人が2人いれば、それぞれに期限を付け、2人の判断がそろうか時間切れになってから解決する。
 */

export interface ClockContext {
  /** サーバーの現在時刻（エポックms） */
  now: number;
  /** 次の局を始めるときにだけ呼ぶ。新しい乱数の種を返す。 */
  nextSeed: () => string;
  /** 0 以上 count 未満の整数を返す乱数。サイコロの出目の自動指定に使う。 */
  pick: (count: number) => number;
  /** 打牌が通ってから次の人のツモを見せるまでの間（ms）。ときどきだけ入れるので、ふだんは 0。 */
  drawHold: () => number;
}

export type TimedTable = TableState & { clock: Clock };

export interface TimedStep {
  table: TimedTable;
  events: TableEvent[];
}

const fullBank = (): PerSeat<number> => [BANK_MS, BANK_MS, BANK_MS];

const noSeats = (): PerSeat<number | null> => [null, null, null];

/** 持ち時間が満ちていて、誰も自動でなく、まだ何も待っていない時計。 */
const newClock = (now: number): Clock => ({
  savedAt: now,
  startedAt: null,
  deadlines: noSeats(),
  deadline: null,
  bank: fullBank(),
  auto: [false, false, false],
});

function waitedSeats(table: TableState): Seat[] {
  return SEATS.filter((seat) => actionsFor(table, seat).length > 0);
}

/** 最も早い期限。誰も待っていなければ null。 */
function earliest(deadlines: PerSeat<number | null>): number | null {
  const set = deadlines.filter((d): d is number => d !== null);
  return set.length > 0 ? Math.min(...set) : null;
}

/**
 * 書き換えてよい写しを作る。clock のない状態（フェーズ8より前に始まった対局）には初期値を補う。
 * 席ごとの期限がない状態（応答にも持ち時間を使うより前に保存された対局）は、待たれている人全員に共通の期限を付けて補う。
 */
function timed(table: TableState, now: number): TimedTable {
  const clock = table.clock;
  if (!clock) return { ...table, clock: newClock(now) };
  const legacy: Partial<Clock> = clock;
  const waited = waitedSeats(table);
  const deadlines: PerSeat<number | null> = legacy.deadlines
    ? [...legacy.deadlines]
    : ([0, 1, 2].map((s) =>
        clock.deadline !== null && waited.includes(s as Seat)
          ? clock.deadline
          : null,
      ) as PerSeat<number | null>);
  return {
    ...table,
    clock: {
      ...clock,
      startedAt:
        legacy.startedAt !== undefined
          ? legacy.startedAt
          : clock.deadline === null
            ? null
            : clock.savedAt,
      deadlines,
      bank: [...clock.bank],
      auto: [...clock.auto],
    },
  };
}

/** 持ち時間（長考）を使う判断か。サイコロの指定と局の結果は決まった長さで、持ち時間を使わない。 */
function usesBank(table: TableState): boolean {
  const { phase } = table.game.round;
  return phase === "awaitTurnAction" || phase === "awaitResponses";
}

/**
 * その席のいまの待ちの長さ。
 * @param diceThrows この保存で振ったサイコロの回数。画面の演出が終わるまでの分を足す。
 */
function waitMs(table: TimedTable, seat: Seat, diceThrows: number): number {
  switch (table.game.round.phase) {
    case "awaitTurnAction":
    case "awaitResponses":
      return BASE_MS + table.clock.bank[seat];
    case "diceChance":
      return DICE_CHOICE_MS + diceThrows * DICE_STEP_MS;
    case "ended":
      return RESULT_MS + diceThrows * DICE_STEP_MS;
  }
}

/** 新しい待ちの期限を、待たれている人ごとに決める。 */
function freshDeadlines(
  table: TimedTable,
  now: number,
  diceThrows: number,
): PerSeat<number | null> {
  const deadlines = noSeats();
  for (const seat of waitedSeats(table)) {
    deadlines[seat] = now + waitMs(table, seat, diceThrows);
  }
  return deadlines;
}

/**
 * 打牌が通って次の人がツモったところで止まったか。応答待ちを経たかどうかにかかわらず、
 * 画面はツモを見せるのを少し遅らせ、そのぶん期限を延ばす。
 * @param resolved 応答待ちが解決された（スルーや時間切れで打牌が通った）
 */
function drawAfterDiscard(
  table: TableState,
  events: TableEvent[],
  resolved: boolean,
): boolean {
  const round = table.game.round;
  return (
    round.phase === "awaitTurnAction" &&
    round.drawn !== null &&
    (resolved || events.some((event) => event.type === "discard"))
  );
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
  resolved: boolean,
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
    clock.startedAt = null;
    clock.deadlines = noSeats();
  } else if (isFresh || clock.deadline === null) {
    const diceThrows = events.reduce(
      (total, event) =>
        event.type === "dice" ? total + event.rolls.length : total,
      0,
    );
    // ツモを見せるのを遅らせる分だけ、待ちの開始を後ろにずらす
    const startedAt =
      ctx.now +
      (drawAfterDiscard(table, events, resolved) ? ctx.drawHold() : 0);
    clock.startedAt = startedAt;
    clock.deadlines = freshDeadlines(
      { ...table, clock },
      startedAt,
      diceThrows,
    );
  } else {
    // 同じ待ちが続いている。もう判断した人の期限だけを外し、残りの人の期限は変えない
    const waited = waitedSeats(table);
    clock.deadlines = clock.deadlines.map((d, s) =>
      waited.includes(s as Seat) ? d : null,
    ) as PerSeat<number | null>;
  }
  clock.deadline = earliest(clock.deadlines);
  return { table: { ...table, clock }, events };
}

/** 対局の開始。持ち時間を満たし、最初の手番の期限を決める。 */
export function startClock(table: TableState, now: number): TimedTable {
  const start: TimedTable = { ...table, clock: newClock(now) };
  const deadlines = freshDeadlines(start, now, 0).map((d) =>
    d === null ? null : d + FIRST_TURN_GRACE_MS,
  ) as PerSeat<number | null>;
  return {
    ...start,
    clock: {
      ...start.clock,
      startedAt: now,
      deadlines,
      deadline: earliest(deadlines),
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
    return settle(table, [], ctx, false, false);
  }

  // 手番の操作や応答なら、基本の時間を超えた分を持ち時間から引く。
  // 期限は「待ちの開始＋基本の時間＋持ち時間」なので、期限までの残りが持ち時間より短ければ、それが新しい持ち時間になる。
  // （経過 − 基本の時間 を引くのと同じ。最初の手番の+10秒も基本の時間の側に入る）
  const deadline = table.clock.deadlines[seat];
  if (usesBank(table) && deadline !== null) {
    table.clock.bank[seat] = Math.min(
      table.clock.bank[seat],
      Math.max(0, deadline - ctx.now),
    );
  }

  const events: TableEvent[] = [];
  const next = applyOne(table, action, ctx, events);
  // 本人が操作したので、即ツモ切りを解除する
  next.clock.auto[seat] = false;
  return settle(
    next,
    events,
    ctx,
    !sameWait(table, next),
    table.game.round.phase === "awaitResponses",
  );
}

/**
 * 時間切れを処理する。期限を過ぎた人がいなければ IllegalActionError。
 * 期限を過ぎた人だけを自動にして、その人の番を進める（手番はツモ切り、応答はスルー）。
 * まだ期限の来ていない人の待ちはそのまま続く。局の結果の時間切れでは自動にしない。
 */
export function applyTimeout(input: TableState, ctx: ClockContext): TimedStep {
  const before = timed(input, ctx.now);
  let table = before;
  const { deadlines } = table.clock;
  const expired = waitedSeats(table).filter((seat) => {
    const deadline = deadlines[seat];
    return deadline !== null && deadline <= ctx.now;
  });
  if (table.game.phase !== "playing" || expired.length === 0) {
    throw new IllegalActionError("notAllowed");
  }

  const events: TableEvent[] = [];
  if (table.game.round.phase === "ended") {
    for (const seat of expired) {
      table = applyOne(table, { type: "confirm", seat }, ctx, events);
    }
  } else {
    for (const seat of expired) {
      table.clock.auto[seat] = true;
      if (usesBank(table)) table.clock.bank[seat] = 0;
    }
  }
  return settle(
    table,
    events,
    ctx,
    !sameWait(before, table),
    before.game.round.phase === "awaitResponses",
  );
}
