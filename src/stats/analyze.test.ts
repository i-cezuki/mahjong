import { describe, expect, it } from "vitest";
import {
  SEATS,
  applyAction,
  createRng,
  startRoundFromDeck,
  tileOf,
} from "@/engine";
import type { Action, RoundOutcome, Seat } from "@/engine";
import { buildDeck, seedOf } from "@/engine/testing";
import type { DeckSpec } from "@/engine/testing";
import { applyTableAction, buildView, startTable } from "@/server/table";
import { analyzeGame } from "./analyze";
import type { StatsEvent } from "./analyze";
import { STAT_KEYS } from "./types";

/** 親が席0の局を、牌の並びを決めて始める。操作を送ると牌譜がたまる。 */
function scenario(deck: DeckSpec) {
  const first = startRoundFromDeck(buildDeck(deck), { dealer: 0 });
  let state = first.state;
  const events: StatsEvent[] = [
    { type: "roundStart", roundIndex: 0, honba: 0, dealer: 0 },
    ...first.events,
  ];
  const act = (action: Action) => {
    const step = applyAction(state, action);
    state = step.state;
    events.push(...step.events);
  };
  /** その種類の牌を切る。riichi ならリーチを宣言して切る。 */
  const cut = (seat: Seat, kind: string, riichi = false) => {
    const tile = state.hands[seat].find((id) => tileOf(id).kind === kind);
    if (tile === undefined) throw new Error(`${kind} が手牌にありません`);
    act(
      riichi
        ? { type: "riichi", seat, tile, doubleStake: false }
        : { type: "discard", seat, tile },
    );
  };
  const outcome = (): RoundOutcome => {
    if (!state.outcome) throw new Error("局が終わっていません");
    return state.outcome;
  };
  return { act, cut, events, outcome };
}

/** 席1は筒子の刻子3つと66z。席2はばらばら。どちらも席0の邪魔をしない。 */
const OTHERS = ["111222333p 3s 9s 66z", "19m 456789s 12345z"] as const;

describe("analyzeGame（リーチと和了）", () => {
  it("良形のリーチ、一発ツモ、裏ドラ", () => {
    // 席0は 23索の両面待ち。裏ドラ表示牌が3索なので、4索が裏ドラ
    const s = scenario({
      hands: ["123456789p 23s 11z", ...OTHERS],
      live: "7z 1m 9m 4s",
      ura: "3s",
    });
    s.cut(0, "7z", true);
    s.cut(1, "1m");
    s.cut(2, "9m");
    s.act({ type: "tsumo", seat: 0 });

    const [a, b, c] = analyzeGame(s.events);
    expect(a).toMatchObject({
      rounds: 1,
      riichi: 1,
      riichiGood: 1,
      riichiTurns: 1,
      riichiChase: 0,
      wins: 1,
      tsumoWins: 1,
      winTurns: 2,
      riichiWins: 1,
      riichiIppatsu: 1,
      riichiUra: 1,
      dealIns: 0,
      callRounds: 0,
      // ツモなので2人から。裏ドラ1枚と一発1枚ずつ
      chipsRed: 0,
      chipsGold: 0,
      chipsUra: 2,
      chipsIppatsu: 2,
      chipsYakuman: 0,
    });
    expect(a.winPoints).toBe(s.outcome().wins[0]!.pointDeltas[0]);
    expect(a.winPoints).toBeGreaterThan(0);
    expect(a.chipsUra + a.chipsIppatsu).toBe(
      s.outcome().wins[0]!.chipDeltas[0],
    );
    for (const other of [b, c]) {
      expect(other).toMatchObject({
        rounds: 1,
        wins: 0,
        dealIns: 0,
        riichi: 0,
      });
    }
  });

  it("愚形のリーチにロン。放銃した人のシャンテン数を数える", () => {
    // 席0は 24索のカンチャン待ち。席1は1萬を引いて3索を切る
    const s = scenario({
      hands: ["123456789p 24s 11z", ...OTHERS],
      live: "7z 1m",
    });
    s.cut(0, "7z", true);
    s.cut(1, "3s");
    s.act({ type: "ron", seat: 0 });

    const [a, b] = analyzeGame(s.events);
    expect(a).toMatchObject({
      riichi: 1,
      riichiGood: 0,
      wins: 1,
      tsumoWins: 0,
      riichiWins: 1,
      riichiIppatsu: 1,
      winTurns: 2,
    });
    // 切ったあとの席1は 111222333p 9s 66z 1m。3面子と雀頭で1向聴
    expect(b).toMatchObject({
      dealIns: 1,
      dealInShanten: 1,
      dealInTenpai: 0,
      dealInOneAway: 1,
      dealInFar: 0,
      dealInToRiichi: 1,
      dealInWhileRiichi: 0,
      dealInWhileOpen: 0,
      riichi: 0,
    });
    // 和了点には自分のリーチ棒（供託1000点）が含まれる
    expect(a.winPoints - b.dealInPoints).toBe(1000);
  });

  it("宣言牌でロンされたリーチは、リーチに数えない", () => {
    // 席1は9索を引いて聴牌し、3索を切ってリーチを宣言する
    const s = scenario({
      hands: ["123456789p 24s 11z", ...OTHERS],
      live: "7z 9s",
    });
    s.cut(0, "7z", true);
    s.cut(1, "3s", true);
    s.act({ type: "ron", seat: 0 });

    const [, b] = analyzeGame(s.events);
    expect(b).toMatchObject({
      riichi: 0,
      riichiTurns: 0,
      dealIns: 1,
      dealInShanten: 0,
      dealInTenpai: 1,
      dealInWhileRiichi: 0,
    });
  });

  it("先にリーチした人がいれば、追いかけリーチ", () => {
    // 席0は両面待ち（1、4索）。席1の3索は通る
    const s = scenario({
      hands: ["123456789p 23s 11z", ...OTHERS],
      live: "7z 9s",
    });
    s.cut(0, "7z", true);
    s.cut(1, "3s", true);

    const [a, b] = analyzeGame(s.events);
    expect(a).toMatchObject({ riichi: 1, riichiGood: 1, riichiChase: 0 });
    // 席1は 9索と發のシャンポン待ち
    expect(b).toMatchObject({
      riichi: 1,
      riichiGood: 0,
      riichiChase: 1,
      riichiTurns: 1,
    });
    // 局が終わっていないので、局数はまだ数えない
    expect(a.rounds).toBe(0);
  });
});

/** 乱数で1半荘を打ち、牌譜を返す。和了できるときは和了する。 */
function autoPlay(seedNumber: number): StatsEvent[] {
  const rng = createRng(seedOf(seedNumber), 11);
  let seedCount = 0;
  const nextSeed = () => seedOf(seedNumber * 1000 + ++seedCount);
  const start = startTable({ seed: nextSeed() });
  let table = start.table;
  const events: StatsEvent[] = [...start.events];
  for (let steps = 0; table.game.phase === "playing"; steps++) {
    if (steps > 20000) throw new Error("対局が終わりません");
    const actions = SEATS.flatMap((seat) => buildView(table, seat).actions);
    const win = actions.find((a) => a.type === "tsumo" || a.type === "ron");
    const action = win ?? actions[rng.nextInt(actions.length)]!;
    const step = applyTableAction(table, action, nextSeed);
    table = step.table;
    events.push(...step.events);
  }
  return events;
}

describe("analyzeGame（自動対局）", () => {
  it("牌譜から手牌を復元でき、合計が牌譜と合う", () => {
    const total = Object.fromEntries(STAT_KEYS.map((key) => [key, 0]));
    for (let n = 1; n <= 8; n++) {
      const events = autoPlay(n);
      // 手牌の復元がずれていれば、リーチや和了のところで例外になる
      const stats = analyzeGame(events);

      const outcomes = events.flatMap((event) =>
        event.type === "roundEnd" ? [event.outcome] : [],
      );
      const wins = outcomes.flatMap((outcome) => outcome.wins);
      const sum = (key: (typeof STAT_KEYS)[number]) =>
        stats.reduce((value, seat) => value + seat[key], 0);

      for (const seat of SEATS) {
        const mine = stats[seat];
        expect(mine.rounds).toBe(outcomes.length);
        expect(mine.wins).toBe(wins.filter((w) => w.seat === seat).length);
        expect(mine.winPoints).toBe(
          wins
            .filter((w) => w.seat === seat)
            .reduce((value, w) => value + w.pointDeltas[seat], 0),
        );
        // 和了で受け取った祝儀の内訳は、牌譜の祝儀の移動と合う
        expect(
          mine.chipsRed +
            mine.chipsGold +
            mine.chipsUra +
            mine.chipsIppatsu +
            mine.chipsYakuman,
        ).toBe(
          wins
            .filter((w) => w.seat === seat && w.chipDeltas[seat] > 0)
            .reduce((value, w) => value + w.chipDeltas[seat], 0),
        );
        expect(mine.dealInTenpai + mine.dealInOneAway + mine.dealInFar).toBe(
          mine.dealIns,
        );
        expect(mine.riichiGood).toBeLessThanOrEqual(mine.riichi);
        expect(mine.riichiWins).toBeLessThanOrEqual(mine.riichi);
        expect(mine.drawTenpai).toBeLessThanOrEqual(mine.draws);
        expect(mine.callRounds).toBeLessThanOrEqual(mine.rounds);
      }
      // ロンされた局の数（ダブロンは1回）
      expect(sum("dealIns")).toBe(
        outcomes.filter((o) => o.wins.some((w) => w.kind === "ron")).length,
      );
      expect(sum("tobiMade")).toBe(sum("tobiSuffered"));
      expect(sum("diceChips")).toBe(0);
      expect(sum("diceChances")).toBe(
        events.filter((event) => event.type === "dice").length,
      );
      for (const key of STAT_KEYS) total[key]! += sum(key);
    }
    // 乱数の対局でも、主な出来事は一通り起きている
    expect(total.riichi).toBeGreaterThan(0);
    expect(total.dealIns).toBeGreaterThan(0);
    expect(total.callRounds).toBeGreaterThan(0);
    expect(total.draws).toBeGreaterThan(0);
  }, 60_000);
});
