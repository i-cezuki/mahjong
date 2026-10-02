import { isFlower, sortTiles } from "./tiles";
import type { TileId } from "./tiles";
import { dealFromDeck, nextSeat, shuffledDeck } from "./wall";
import type { PerSeat, Seat, Wall } from "./wall";

export type { PerSeat, Seat } from "./wall";

/** wall=ツモ山、flower=花牌を抜いた補充 */
export type DrawSource = "wall" | "flower";

export interface Discard {
  tile: TileId;
  tsumogiri: boolean;
}

export type RoundResult = { type: "exhaustiveDraw" };

export interface RoundState {
  phase: "awaitTurnAction" | "ended";
  dealer: Seat;
  /** 手番の席 */
  turn: Seat;
  /** 並べ替え済みの手牌。手番の人はツモ牌を含む。 */
  hands: PerSeat<TileId[]>;
  /** 手番の人が最後にツモった牌。花牌を抜いたときは補充牌。 */
  drawn: TileId | null;
  /** 抜いた花牌 */
  flowers: PerSeat<TileId[]>;
  rivers: PerSeat<Discard[]>;
  wall: Wall;
  result: RoundResult | null;
}

export type RoundEvent =
  | {
      type: "deal";
      dealer: Seat;
      hands: PerSeat<TileId[]>;
      doraIndicator: TileId;
    }
  | { type: "draw"; seat: Seat; tile: TileId; source: DrawSource }
  | { type: "flower"; seat: Seat; tile: TileId }
  | { type: "discard"; seat: Seat; tile: TileId; tsumogiri: boolean }
  | { type: "exhaustiveDraw" };

export type Action = { type: "discard"; seat: Seat; tile: TileId };

export interface Step {
  state: RoundState;
  events: RoundEvent[];
}

export type IllegalActionCode = "roundEnded" | "notYourTurn" | "tileNotInHand";

export class IllegalActionError extends Error {
  constructor(readonly code: IllegalActionCode) {
    super(`不正な操作です: ${code}`);
    this.name = "IllegalActionError";
  }
}

/** 種から山を作って局を始める。 */
export function startRound(params: { seed: string; dealer: Seat }): Step {
  return startRoundFromDeck(shuffledDeck(params.seed), params.dealer);
}

/** 並び順の決まった山で局を始める。 */
export function startRoundFromDeck(
  deck: readonly TileId[],
  dealer: Seat,
): Step {
  const { hands, wall } = dealFromDeck(deck, dealer);
  const sorted: PerSeat<TileId[]> = [
    sortTiles(hands[0]),
    sortTiles(hands[1]),
    sortTiles(hands[2]),
  ];
  const state: RoundState = {
    phase: "awaitTurnAction",
    dealer,
    turn: dealer,
    hands: sorted,
    drawn: null,
    flowers: [[], [], []],
    rivers: [[], [], []],
    wall,
    result: null,
  };
  const events: RoundEvent[] = [
    {
      type: "deal",
      dealer,
      hands: structuredClone(sorted),
      doraIndicator: wall.doraIndicators[0]!,
    },
  ];
  startTurn(state, dealer, events);
  return { state, events };
}

/** 操作を適用した新しい状態とイベントを返す。不正な操作は IllegalActionError。 */
export function applyAction(current: RoundState, action: Action): Step {
  if (current.phase === "ended") throw new IllegalActionError("roundEnded");
  if (action.seat !== current.turn) throw new IllegalActionError("notYourTurn");
  if (!current.hands[action.seat].includes(action.tile)) {
    throw new IllegalActionError("tileNotInHand");
  }

  const state = structuredClone(current);
  const events: RoundEvent[] = [];
  const { seat, tile } = action;

  const tsumogiri = tile === state.drawn;
  state.hands[seat] = state.hands[seat].filter((id) => id !== tile);
  state.rivers[seat].push({ tile, tsumogiri });
  state.drawn = null;
  events.push({ type: "discard", seat, tile, tsumogiri });

  if (state.wall.live.length === 0) {
    state.phase = "ended";
    state.result = { type: "exhaustiveDraw" };
    events.push({ type: "exhaustiveDraw" });
  } else {
    startTurn(state, nextSeat(seat), events);
  }
  return { state, events };
}

/** その席がいまできる操作の一覧。 */
export function legalActions(state: RoundState, seat: Seat): Action[] {
  if (state.phase !== "awaitTurnAction" || seat !== state.turn) return [];
  return state.hands[seat].map((tile) => ({ type: "discard", seat, tile }));
}

/** ツモって、手牌にある花牌をすべて抜いて補充する。state を書き換える。 */
function startTurn(state: RoundState, seat: Seat, events: RoundEvent[]): void {
  state.turn = seat;
  draw(state, seat, "wall", events);

  for (;;) {
    const flower = state.hands[seat].find(isFlower);
    if (flower === undefined) break;
    state.hands[seat] = state.hands[seat].filter((id) => id !== flower);
    state.flowers[seat].push(flower);
    events.push({ type: "flower", seat, tile: flower });
    draw(state, seat, "flower", events);
  }
}

function draw(
  state: RoundState,
  seat: Seat,
  source: DrawSource,
  events: RoundEvent[],
): void {
  const pile = source === "wall" ? state.wall.live : state.wall.rinshan;
  const tile = pile.shift();
  if (tile === undefined) throw new Error(`ツモる牌がありません: ${source}`);
  state.hands[seat] = sortTiles([...state.hands[seat], tile]);
  state.drawn = tile;
  events.push({ type: "draw", seat, tile, source });
}
