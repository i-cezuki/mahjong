import { tileLabel } from "@/components/labels";
import { RINSHAN_SIZE, TILE_COUNT, roundWindOf, sortTiles } from "@/engine";
import type {
  Discard,
  GameResult,
  MeldState,
  PerSeat,
  RoundOutcome,
  Seat,
  TileId,
} from "@/engine";
import type { DiceResult, PlayerView, TableEvent } from "@/server/table";

/*
 * 牌譜の再生。牌譜のイベントをたどって、1手ごとの卓の様子（コマ）を作る。
 * UI、DB、通信には依存しない。
 */

const START_POINTS = 30000;
/** 配牌直後のツモ山の枚数。配牌、嶺上牌、ドラ表示の1山を除いた残り */
const LIVE_TILES = TILE_COUNT - 13 * 3 - RINSHAN_SIZE - 2;
// リーチの供託（docs/SPEC.md の「基本ルール」「2倍リーチ」「オープンリーチ」）
const RIICHI_STAKE = 1000;
const DOUBLE_STAKE = 5000;
const OPEN_STAKE = 2000;

/** 再生の1コマ。3人の手牌をすべて持つ */
export interface ReplayFrame {
  /** 何局目か（rounds の添字） */
  round: number;
  roundIndex: number;
  honba: number;
  kyotaku: number;
  dealer: Seat;
  turn: Seat;
  points: PerSeat<number>;
  /** 祝儀の累計。局の結果とサイコロの分は、その場で足す */
  chips: PerSeat<number>;
  doraIndicators: TileId[];
  wallCount: number;
  hands: PerSeat<TileId[]>;
  /** 手番の人のツモ牌 */
  drawn: TileId | null;
  melds: PerSeat<MeldState[]>;
  flowers: PerSeat<TileId[]>;
  rivers: PerSeat<Discard[]>;
  riichi: PerSeat<{ doubleStake: boolean; open?: true } | null>;
  /** このコマで切られた牌 */
  lastDiscard: { seat: Seat; tile: TileId } | null;
  outcome: RoundOutcome | null;
  dice: DiceResult[];
  result: GameResult | null;
  /** このコマで起きたこと。名前は席番号で持ち、表示するときに置き換える */
  caption: Caption;
}

export type Caption =
  | { type: "deal" }
  | { type: "draw"; seat: Seat; tile: TileId }
  | { type: "flower"; seat: Seat }
  | {
      type: "discard";
      seat: Seat;
      tile: TileId;
      tsumogiri: boolean;
      riichi: boolean;
    }
  | { type: "pon"; seat: Seat; from: Seat }
  | { type: "kan"; seat: Seat; kanType: "ankan" | "minkan" | "kakan" }
  | { type: "roundEnd" };

export interface ReplayRound {
  roundIndex: number;
  honba: number;
  /** この局の最初のコマ（frames の添字） */
  start: number;
}

export interface Replay {
  frames: ReplayFrame[];
  rounds: ReplayRound[];
}

function perSeat<T>(fn: (seat: Seat) => T): PerSeat<T> {
  return [fn(0), fn(1), fn(2)];
}

const without = (tiles: readonly TileId[], removed: readonly TileId[]) =>
  tiles.filter((tile) => !removed.includes(tile));

/** 牌譜1対局分から、再生のコマを作る。 */
export function buildReplay(events: readonly TableEvent[]): Replay {
  const frames: ReplayFrame[] = [];
  const rounds: ReplayRound[] = [];
  // いまの卓。コマにするときに写しを取る
  let current: ReplayFrame | null = null;
  let points: PerSeat<number> = [START_POINTS, START_POINTS, START_POINTS];
  let chips: PerSeat<number> = [0, 0, 0];
  let kyotaku = 0;
  let header = { roundIndex: 0, honba: 0, dealer: 0 as Seat };

  const snapshot = (caption: Caption) => {
    frames.push(structuredClone({ ...current!, caption }));
  };

  for (const event of events) {
    if (event.type === "seed") continue;
    if (event.type === "roundStart") {
      header = {
        roundIndex: event.roundIndex,
        honba: event.honba,
        dealer: event.dealer,
      };
      continue;
    }
    if (event.type === "gameEnd") {
      const last = frames.at(-1);
      if (last) last.result = event.result;
      continue;
    }
    if (event.type === "deal") {
      rounds.push({ ...header, start: frames.length });
      current = {
        round: rounds.length - 1,
        ...header,
        dealer: event.dealer,
        kyotaku,
        turn: event.dealer,
        points: [...points],
        chips: [...chips],
        doraIndicators: [event.doraIndicator],
        wallCount: LIVE_TILES,
        hands: perSeat((seat) => sortTiles(event.hands[seat])),
        drawn: null,
        melds: [[], [], []],
        flowers: [[], [], []],
        rivers: [[], [], []],
        riichi: [null, null, null],
        lastDiscard: null,
        outcome: null,
        dice: [],
        result: null,
        caption: { type: "deal" },
      };
      snapshot({ type: "deal" });
      continue;
    }

    const state = current;
    if (!state) continue;
    state.lastDiscard = null;
    switch (event.type) {
      case "draw":
        state.hands[event.seat] = sortTiles([
          ...state.hands[event.seat],
          event.tile,
        ]);
        state.drawn = event.tile;
        state.turn = event.seat;
        if (event.source === "wall") state.wallCount--;
        snapshot({ type: "draw", seat: event.seat, tile: event.tile });
        break;
      case "flower":
        state.hands[event.seat] = without(state.hands[event.seat], [
          event.tile,
        ]);
        state.flowers[event.seat].push(event.tile);
        state.drawn = null;
        snapshot({ type: "flower", seat: event.seat });
        break;
      case "discard": {
        state.hands[event.seat] = without(state.hands[event.seat], [
          event.tile,
        ]);
        state.rivers[event.seat].push({
          tile: event.tile,
          tsumogiri: event.tsumogiri,
          ...(event.riichi && { riichi: true }),
        });
        state.drawn = null;
        state.lastDiscard = { seat: event.seat, tile: event.tile };
        snapshot({
          type: "discard",
          seat: event.seat,
          tile: event.tile,
          tsumogiri: event.tsumogiri,
          riichi: event.riichi === true,
        });
        break;
      }
      case "riichi": {
        // 宣言牌が通ってリーチが成立した。供託はここで出す
        const stake = event.doubleStake
          ? DOUBLE_STAKE
          : event.open
            ? OPEN_STAKE
            : RIICHI_STAKE;
        state.points[event.seat] -= stake;
        state.kyotaku += stake;
        state.riichi[event.seat] = {
          doubleStake: event.doubleStake,
          ...(event.open && { open: true }),
        };
        break;
      }
      case "pon":
      case "kan": {
        const river = event.from === null ? null : state.rivers[event.from];
        const called = river?.at(-1);
        if (called && event.type === "pon") called.called = true;
        if (called && event.type === "kan" && event.kanType === "minkan") {
          called.called = true;
        }
        const melds = state.melds[event.seat];
        if (event.type === "kan" && event.kanType === "kakan") {
          const index = melds.findIndex((meld) =>
            meld.tiles.every((tile) => event.tiles.includes(tile)),
          );
          const pon = melds[index]!;
          state.hands[event.seat] = without(
            state.hands[event.seat],
            without(event.tiles, pon.tiles),
          );
          melds[index] = { ...pon, type: "kakan", tiles: [...event.tiles] };
        } else {
          const fromHand =
            event.type === "kan" && event.kanType === "ankan"
              ? event.tiles
              : without(event.tiles, called ? [called.tile] : []);
          state.hands[event.seat] = without(state.hands[event.seat], fromHand);
          melds.push({
            type: event.type === "pon" ? "pon" : event.kanType,
            tiles: [...event.tiles],
            from: event.from,
          });
        }
        state.turn = event.seat;
        state.drawn = null;
        snapshot(
          event.type === "pon"
            ? { type: "pon", seat: event.seat, from: event.from }
            : { type: "kan", seat: event.seat, kanType: event.kanType },
        );
        break;
      }
      case "dora":
        // 槓ドラの1山はツモ山の端から取る
        state.doraIndicators.push(event.indicator);
        state.wallCount -= 2;
        break;
      case "roundEnd": {
        const { outcome } = event;
        state.outcome = outcome;
        state.drawn = null;
        for (const seat of [0, 1, 2] as const) {
          state.points[seat] += outcome.pointDeltas[seat];
          state.chips[seat] += outcome.chipDeltas[seat];
        }
        // 和了があれば供託は和了した人が取っている
        if (outcome.type === "win") state.kyotaku = 0;
        points = [...state.points];
        chips = [...state.chips];
        kyotaku = state.kyotaku;
        snapshot({ type: "roundEnd" });
        break;
      }
      case "dice": {
        // サイコロは局の結果のコマにまとめる
        const { seat, faces, rolls, hits, chipDeltas } = event;
        const result = { seat, faces, rolls, hits, chipDeltas };
        for (const seat of [0, 1, 2] as const) {
          chips[seat] += event.chipDeltas[seat];
        }
        state.dice.push(result);
        state.chips = [...chips];
        const last = frames.at(-1)!;
        last.dice = [...state.dice];
        last.chips = [...chips];
        break;
      }
    }
  }
  return { frames, rounds };
}

/** コマを、卓の部品が読む画面データの形にする。seat の人を手前に置く。 */
export function frameView(frame: ReplayFrame, seat: Seat): PlayerView {
  const ended = frame.outcome !== null;
  return {
    seat,
    // 確認ボタンなど、対局中の操作は出さない
    phase: "ended",
    roundPhase: ended ? "ended" : "awaitTurnAction",
    roundIndex: frame.roundIndex,
    honba: frame.honba,
    kyotaku: frame.kyotaku,
    dealer: frame.dealer,
    roundWind: roundWindOf(frame.roundIndex),
    turn: frame.turn,
    points: frame.points,
    chips: frame.chips,
    doraIndicators: frame.doraIndicators,
    wallCount: frame.wallCount,
    hand: frame.hands[seat],
    drawn: frame.turn === seat ? frame.drawn : null,
    handCounts: perSeat((s) => frame.hands[s].length),
    melds: frame.melds,
    flowers: frame.flowers,
    rivers: frame.rivers,
    riichi: frame.riichi,
    // 牌譜では全員の手牌を見せる
    openHands: frame.hands,
    lastDiscard: frame.lastDiscard,
    actions: [],
    diceChance: null,
    dice: frame.dice,
    outcome: frame.outcome,
    revealed: perSeat((s) =>
      frame.outcome &&
      (frame.outcome.tenpai.includes(s) ||
        frame.outcome.wins.some((win) => win.seat === s && win.result))
        ? frame.hands[s]
        : null,
    ),
    confirmed: [true, true, true],
    result: frame.result,
    deadline: null,
    myDeadline: null,
    startedAt: null,
    serverNow: 0,
    bank: 0,
    auto: [false, false, false],
  };
}

/** このコマで起きたことの説明 */
export function captionText(caption: Caption, names: readonly string[]) {
  const name = (seat: Seat) => names[seat] ?? "";
  switch (caption.type) {
    case "deal":
      return "配牌";
    case "draw":
      return `${name(caption.seat)}がツモ（${tileLabel(caption.tile)}）`;
    case "flower":
      return `${name(caption.seat)}が花牌を抜いた`;
    case "discard":
      return `${name(caption.seat)}が${tileLabel(caption.tile)}を切った${
        caption.riichi ? "（リーチ）" : caption.tsumogiri ? "（ツモ切り）" : ""
      }`;
    case "pon":
      return `${name(caption.seat)}が${name(caption.from)}からポン`;
    case "kan":
      return `${name(caption.seat)}が${
        caption.kanType === "ankan"
          ? "暗槓"
          : caption.kanType === "kakan"
            ? "加槓"
            : "明槓"
      }`;
    case "roundEnd":
      return "局の結果";
  }
}
