import { describe, expect, it } from "vitest";
import { SEATS, createRng, sortTiles } from "@/engine";
import { seedOf } from "@/engine/testing";
import { applyTableAction, buildView, startTable } from "@/server/table";
import type { TableEvent, TableState } from "@/server/table";
import { buildReplay, captionText, frameView } from "./replay";
import type { ReplayFrame } from "./replay";

/** 最後のコマが、エンジンの状態と同じ卓を表している */
function expectSameTable(frame: ReplayFrame, table: TableState) {
  const round = table.game.round;
  expect(frame.roundIndex).toBe(table.game.roundIndex);
  expect(frame.honba).toBe(round.honba);
  expect(frame.dealer).toBe(round.dealer);
  expect(frame.points).toEqual(round.points);
  expect(frame.doraIndicators).toEqual(round.wall.doraIndicators);
  expect(frame.wallCount).toBe(round.wall.live.length);
  expect(frame.flowers).toEqual(round.flowers);
  expect(frame.rivers).toEqual(round.rivers);
  expect(frame.melds.map((melds) => melds.map((m) => m.type))).toEqual(
    round.melds.map((melds) => melds.map((m) => m.type)),
  );
  expect(
    frame.melds.map((melds) => melds.map((m) => sortTiles(m.tiles))),
  ).toEqual(round.melds.map((melds) => melds.map((m) => sortTiles(m.tiles))));
  expect(frame.melds.map((melds) => melds.map((m) => m.from))).toEqual(
    round.melds.map((melds) => melds.map((m) => m.from)),
  );
  for (const seat of SEATS) {
    expect(sortTiles(frame.hands[seat])).toEqual(sortTiles(round.hands[seat]));
    expect(frame.riichi[seat] !== null).toBe(round.riichi[seat] !== null);
  }
  if (round.phase !== "ended") {
    expect(frame.kyotaku).toBe(round.kyotaku);
    expect(frame.turn).toBe(round.turn);
    expect(frame.drawn).toBe(round.drawn);
  }
}

/** コマになるイベント */
const FRAME_EVENTS = new Set([
  "deal",
  "draw",
  "flower",
  "discard",
  "pon",
  "kan",
  "roundEnd",
]);

/** 乱数で1半荘を打ち、操作のたびの状態を、牌譜の再生のその時点のコマと比べる。 */
function autoPlay(seedNumber: number): TableEvent[] {
  const rng = createRng(seedOf(seedNumber), 7);
  let seedCount = 0;
  const nextSeed = () => seedOf(seedNumber * 1000 + ++seedCount);
  const start = startTable({ seed: nextSeed() });
  let table = start.table;
  const events: TableEvent[] = [...start.events];
  /** 操作ごとの、その時点までのコマの数とエンジンの状態 */
  const checkpoints: {
    frames: number;
    table: TableState;
    newRound: boolean;
  }[] = [];
  let frameCount = start.events.filter((e) => FRAME_EVENTS.has(e.type)).length;
  for (let steps = 0; table.game.phase === "playing"; steps++) {
    if (steps > 20000) throw new Error("対局が終わりません");
    const actions = SEATS.flatMap((seat) => buildView(table, seat).actions);
    // 和了できれば和了する。リーチと暗槓も、牌譜に出てくるよう優先する
    const win = actions.find((a) => a.type === "tsumo" || a.type === "ron");
    const bold = actions.filter(
      (a) => a.type === "riichi" || a.type === "ankan",
    );
    const pool = bold.length > 0 ? bold : actions;
    const action = win ?? pool[rng.nextInt(pool.length)]!;
    const step = applyTableAction(table, action, nextSeed);
    table = step.table;
    if (step.events.length === 0) continue;
    events.push(...step.events);
    frameCount += step.events.filter((e) => FRAME_EVENTS.has(e.type)).length;
    checkpoints.push({
      frames: frameCount,
      table,
      newRound: step.events.some((e) => e.type === "roundStart"),
    });
  }

  const { frames, rounds } = buildReplay(events);
  expect(frames).toHaveLength(frameCount);
  for (const checkpoint of checkpoints) {
    expectSameTable(frames[checkpoint.frames - 1]!, checkpoint.table);
  }
  // 局が始まった時点の祝儀の累計は、前の局までのサイコロを含めて合う
  const starts = checkpoints.filter((c) => c.newRound);
  expect(starts).toHaveLength(rounds.length - 1);
  for (const [i, checkpoint] of starts.entries()) {
    expect(frames[rounds[i + 1]!.start]!.chips).toEqual(
      checkpoint.table.game.chips,
    );
  }
  expect(frames.at(-1)!.result).toEqual(table.game.result);
  expect(frames.at(-1)!.chips).toEqual(table.game.chips);
  return events;
}

describe("buildReplay", () => {
  it("どのコマでも、エンジンと同じ卓になる", () => {
    const seen = new Set<string>();
    for (let n = 1; n <= 3; n++) {
      for (const event of autoPlay(n)) {
        seen.add(event.type === "kan" ? event.kanType : event.type);
      }
    }
    // 確かめたい場面が牌譜に出てきている
    for (const type of ["riichi", "pon", "ankan", "flower", "dora"]) {
      expect(seen).toContain(type);
    }
  }, 30_000);

  it("サイコロは局の結果のコマに入り、祝儀の累計に足す", () => {
    const events = autoPlay(9);
    const end = events.findIndex((e) => e.type === "roundEnd");
    const dice: TableEvent = {
      type: "dice",
      seat: 0,
      faces: [1, 2],
      rolls: [[1, 2]],
      hits: 1,
      chipDeltas: [140, -70, -70],
    };
    const plain = buildReplay(events);
    const withDice = buildReplay([
      ...events.slice(0, end + 1),
      dice,
      ...events.slice(end + 1),
    ]);
    expect(withDice.frames).toHaveLength(plain.frames.length);
    const result = withDice.frames.findIndex((f) => f.outcome !== null);
    expect(withDice.frames[result]!.dice).toHaveLength(1);
    expect(withDice.frames[result]!.chips).toEqual(
      plain.frames[result]!.chips.map((n, seat) => n + dice.chipDeltas[seat]!),
    );
    const next = withDice.rounds[1]!.start;
    expect(withDice.frames[next]!.chips).toEqual(
      plain.frames[next]!.chips.map((n, seat) => n + dice.chipDeltas[seat]!),
    );
    expect(withDice.frames[next]!.dice).toEqual([]);
  });

  it("局ごとの最初のコマは配牌", () => {
    const { frames, rounds } = buildReplay(autoPlay(7));
    expect(rounds.length).toBeGreaterThan(1);
    for (const [i, round] of rounds.entries()) {
      const frame = frames[round.start]!;
      expect(frame.caption).toEqual({ type: "deal" });
      expect(frame.round).toBe(i);
      expect(frame.roundIndex).toBe(round.roundIndex);
      expect(frame.honba).toBe(round.honba);
    }
  });

  it("画面データにすると、選んだ席を手前にして全員の手牌を見せる", () => {
    const { frames } = buildReplay(autoPlay(8));
    const frame = frames.find((f) => f.caption.type === "draw")!;
    const view = frameView(frame, 1);
    expect(view.seat).toBe(1);
    expect(view.hand).toEqual(frame.hands[1]);
    expect(view.openHands).toEqual(frame.hands);
    expect(view.actions).toEqual([]);
    expect(view.drawn).toBe(frame.turn === 1 ? frame.drawn : null);
  });
});

describe("captionText", () => {
  const names = ["A", "B", "C"];
  it("起きたことを名前で書く", () => {
    expect(
      captionText(
        { type: "discard", seat: 1, tile: 0, tsumogiri: false, riichi: true },
        names,
      ),
    ).toBe("Bが1萬を切った（リーチ）");
    expect(captionText({ type: "pon", seat: 2, from: 0 }, names)).toBe(
      "CがAからポン",
    );
  });
});
