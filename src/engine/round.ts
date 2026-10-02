import { decompose, waitingKinds } from "./agari";
import { diceFaceChoices, rollDiceChance } from "./dice";
import {
  buildWinInput,
  orderFrom,
  settleExhaustiveDraw,
  settlePocchi,
  settleRon,
  settleTsumo,
} from "./settlement";
import { IllegalActionError } from "./state";
import type {
  Action,
  DrawSource,
  MeldState,
  PendingDiscard,
  ResponseOptions,
  RoundEvent,
  RoundState,
  Step,
} from "./state";
import { isFlower, kindsOf, sortTiles, tileOf } from "./tiles";
import type { TileId, TileKind } from "./tiles";
import { SEATS, dealFromDeck, nextSeat, shuffledDeck } from "./wall";
import type { PerSeat, Seat } from "./wall";
import { evaluateWin } from "./yaku";

export * from "./state";

const START_POINTS = 30000;
const RIICHI_STAKE = 1000;
const DOUBLE_STAKE = 5000;
const MAX_KANS = 4;

export interface RoundSetup {
  dealer: Seat;
  /** 起家。省略時は dealer。 */
  firstDealer?: Seat;
  roundWind?: "1z" | "2z";
  honba?: number;
  kyotaku?: number;
  points?: PerSeat<number>;
  /** サイコロに使う種 */
  seed?: string;
}

/** 種から山を作って局を始める。 */
export function startRound(setup: RoundSetup & { seed: string }): Step {
  return startRoundFromDeck(shuffledDeck(setup.seed), setup);
}

/** 並び順の決まった山で局を始める。 */
export function startRoundFromDeck(
  deck: readonly TileId[],
  setup: RoundSetup,
): Step {
  const { dealer } = setup;
  const { hands, wall } = dealFromDeck(deck, dealer);
  const sorted: PerSeat<TileId[]> = [
    sortTiles(hands[0]),
    sortTiles(hands[1]),
    sortTiles(hands[2]),
  ];
  const state: RoundState = {
    phase: "awaitTurnAction",
    seed: setup.seed ?? "0".repeat(64),
    dealer,
    firstDealer: setup.firstDealer ?? dealer,
    roundWind: setup.roundWind ?? "1z",
    honba: setup.honba ?? 0,
    kyotaku: setup.kyotaku ?? 0,
    points: setup.points
      ? [...setup.points]
      : [START_POINTS, START_POINTS, START_POINTS],
    turn: dealer,
    hands: sorted,
    drawn: null,
    rinshanDraw: false,
    melds: [[], [], []],
    flowers: [[], [], []],
    rivers: [[], [], []],
    wall,
    riichi: [null, null, null],
    tempFuriten: [false, false, false],
    anyCall: false,
    kanCount: 0,
    kuikae: null,
    pending: null,
    dice: [],
    diceRolled: 0,
    chipDeltas: [0, 0, 0],
    outcome: null,
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

// ---- 合法手 ----

function countOf(state: RoundState, seat: Seat, kind: TileKind): number {
  return state.hands[seat].filter((id) => tileOf(id).kind === kind).length;
}

function isMenzen(state: RoundState, seat: Seat): boolean {
  return state.melds[seat].every((meld) => meld.type === "ankan");
}

function canKan(state: RoundState): boolean {
  // 槓ドラ表示牌と槓裏の2枚をツモ山の末尾から取る
  return state.kanCount < MAX_KANS && state.wall.live.length >= 2;
}

function discardableTiles(state: RoundState, seat: Seat): TileId[] {
  if (state.riichi[seat]) return state.drawn === null ? [] : [state.drawn];
  // 最初のツモ番より前にポンした人は配牌の花牌を持ったままなので、花牌は切れない
  return state.hands[seat].filter(
    (id) => !isFlower(id) && tileOf(id).kind !== state.kuikae,
  );
}

function canTsumo(state: RoundState, seat: Seat): boolean {
  if (state.drawn === null) return false;
  return evaluateWin(buildWinInput(state, seat, state.drawn, true)) !== null;
}

/** その牌を切ってリーチできるか（切ったあとが聴牌）。 */
function canRiichiWith(state: RoundState, seat: Seat, tile: TileId): boolean {
  if (state.drawn === null || state.riichi[seat] || !isMenzen(state, seat)) {
    return false;
  }
  if (state.wall.live.length === 0) return false;
  const rest = state.hands[seat].filter((id) => id !== tile);
  return waitingKinds(rest, state.melds[seat]).length > 0;
}

/** リーチ後の暗槓は、待ちと面子構成が変わらない場合だけ。 */
function riichiAnkanAllowed(
  state: RoundState,
  seat: Seat,
  kind: TileKind,
): boolean {
  if (state.drawn === null || tileOf(state.drawn).kind !== kind) return false;
  const melds = state.melds[seat];
  const before = state.hands[seat].filter((id) => id !== state.drawn);
  const quad = state.hands[seat].filter((id) => tileOf(id).kind === kind);
  const after = before.filter((id) => tileOf(id).kind !== kind);
  const waitsBefore = waitingKinds(before, melds);
  const waitsAfter = waitingKinds(after, [
    ...melds,
    { type: "ankan", tiles: quad },
  ]);
  if (waitsBefore.join() !== waitsAfter.join()) return false;

  // どの待ちで和了しても、その牌が刻子としてしか使われないこと
  return waitsBefore.every((wait) => {
    const shapes = decompose([...kindsOf(before), wait], 4 - melds.length);
    return (
      shapes.length > 0 &&
      shapes.every(
        (shape) =>
          shape.pair !== kind &&
          shape.groups.some((g) => g.type === "koutsu" && g.kind === kind),
      )
    );
  });
}

function ankanKinds(state: RoundState, seat: Seat): TileKind[] {
  if (state.drawn === null || !canKan(state)) return [];
  const kinds = [...new Set(kindsOf(state.hands[seat]))].filter(
    (kind) => countOf(state, seat, kind) === 4,
  );
  if (!state.riichi[seat]) return kinds;
  return kinds.filter((kind) => riichiAnkanAllowed(state, seat, kind));
}

function kakanTiles(state: RoundState, seat: Seat): TileId[] {
  if (state.drawn === null || !canKan(state)) return [];
  const ponKinds = state.melds[seat]
    .filter((meld) => meld.type === "pon")
    .map((meld) => tileOf(meld.tiles[0]!).kind);
  return state.hands[seat].filter((id) => ponKinds.includes(tileOf(id).kind));
}

/** ポンに出す2枚の選び方。赤や金の組み合わせが同じものは1つにまとめる。 */
function ponChoices(
  state: RoundState,
  seat: Seat,
  kind: TileKind,
): [TileId, TileId][] {
  const candidates = state.hands[seat].filter((id) => tileOf(id).kind === kind);
  const seen = new Set<string>();
  const result: [TileId, TileId][] = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const pair: [TileId, TileId] = [candidates[i]!, candidates[j]!];
      const key = pair
        .map((id) => tileOf(id).variant)
        .sort()
        .join();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(pair);
    }
  }
  return result;
}

/** その席がいまできる操作の一覧。 */
export function legalActions(state: RoundState, seat: Seat): Action[] {
  switch (state.phase) {
    case "awaitTurnAction": {
      if (seat !== state.turn) return [];
      const actions: Action[] = [];
      if (canTsumo(state, seat)) actions.push({ type: "tsumo", seat });
      const discards = discardableTiles(state, seat);
      for (const tile of discards)
        actions.push({ type: "discard", seat, tile });
      for (const tile of discards) {
        if (!canRiichiWith(state, seat, tile)) continue;
        actions.push({ type: "riichi", seat, tile, doubleStake: false });
        actions.push({ type: "riichi", seat, tile, doubleStake: true });
      }
      for (const kind of ankanKinds(state, seat)) {
        actions.push({ type: "ankan", seat, kind });
      }
      for (const tile of kakanTiles(state, seat)) {
        actions.push({ type: "kakan", seat, tile });
      }
      return actions;
    }
    case "awaitResponses": {
      const pending = state.pending!;
      const options = pending.options[seat];
      if (!options || pending.responses[seat]) return [];
      const actions: Action[] = [];
      if (options.ron) actions.push({ type: "ron", seat });
      if (options.pon) {
        const kind = tileOf(pending.tile).kind;
        for (const tiles of ponChoices(state, seat, kind)) {
          actions.push({ type: "pon", seat, tiles });
        }
      }
      if (options.minkan) actions.push({ type: "minkan", seat });
      actions.push({ type: "pass", seat });
      return actions;
    }
    case "diceChance": {
      if (state.dice[0]?.seat !== seat) return [];
      return diceFaceChoices().map((faces) => ({ type: "dice", seat, faces }));
    }
    case "ended":
      return [];
  }
}

function isAllowed(state: RoundState, action: Action): boolean {
  const { seat } = action;
  switch (action.type) {
    case "discard":
      return discardableTiles(state, seat).includes(action.tile);
    case "riichi":
      return (
        discardableTiles(state, seat).includes(action.tile) &&
        canRiichiWith(state, seat, action.tile)
      );
    case "tsumo":
      return canTsumo(state, seat);
    case "ankan":
      return ankanKinds(state, seat).includes(action.kind);
    case "kakan":
      return kakanTiles(state, seat).includes(action.tile);
    case "ron":
    case "pon":
    case "minkan":
    case "pass": {
      const pending = state.pending;
      if (state.phase !== "awaitResponses" || !pending) return false;
      const options = pending.options[seat];
      if (!options || pending.responses[seat]) return false;
      if (action.type === "pass") return true;
      if (action.type !== "pon") return options[action.type];
      const [a, b] = action.tiles;
      const kind = tileOf(pending.tile).kind;
      return (
        options.pon &&
        a !== b &&
        [a, b].every(
          (id) => state.hands[seat].includes(id) && tileOf(id).kind === kind,
        )
      );
    }
    case "dice": {
      const [a, b] = action.faces;
      return (
        state.phase === "diceChance" &&
        state.dice[0]?.seat === seat &&
        diceFaceChoices().some(
          ([x, y]) => (x === a && y === b) || (x === b && y === a),
        )
      );
    }
  }
}

const TURN_ACTIONS: ReadonlySet<Action["type"]> = new Set([
  "discard",
  "riichi",
  "tsumo",
  "ankan",
  "kakan",
]);

/** 操作を適用した新しい状態とイベントを返す。不正な操作は IllegalActionError。 */
export function applyAction(current: RoundState, action: Action): Step {
  if (current.phase === "ended") throw new IllegalActionError("roundEnded");
  if (TURN_ACTIONS.has(action.type)) {
    if (current.phase !== "awaitTurnAction" || action.seat !== current.turn) {
      throw new IllegalActionError("notYourTurn");
    }
    if (
      (action.type === "discard" || action.type === "riichi") &&
      !current.hands[action.seat].includes(action.tile)
    ) {
      throw new IllegalActionError("tileNotInHand");
    }
  }
  if (!isAllowed(current, action)) throw new IllegalActionError("notAllowed");

  const state = structuredClone(current);
  const events: RoundEvent[] = [];
  const { seat } = action;

  switch (action.type) {
    case "discard":
      discard(state, seat, action.tile, null, events);
      break;
    case "riichi":
      discard(state, seat, action.tile, action.doubleStake, events);
      break;
    case "tsumo":
      settleTsumo(state, seat, events);
      break;
    case "ankan": {
      const tiles = state.hands[seat].filter(
        (id) => tileOf(id).kind === action.kind,
      );
      removeFromHand(state, seat, tiles);
      state.melds[seat].push({ type: "ankan", tiles, from: null });
      afterKan(state, seat, state.melds[seat].at(-1)!, events);
      break;
    }
    case "kakan": {
      const kind = tileOf(action.tile).kind;
      const meld = state.melds[seat].find(
        (m) => m.type === "pon" && tileOf(m.tiles[0]!).kind === kind,
      )!;
      removeFromHand(state, seat, [action.tile]);
      meld.type = "kakan";
      meld.tiles.push(action.tile);
      afterKan(state, seat, meld, events);
      break;
    }
    case "ron":
    case "minkan":
    case "pass":
      respond(state, seat, { type: action.type }, events);
      break;
    case "pon":
      respond(state, seat, { type: "pon", tiles: action.tiles }, events);
      break;
    case "dice":
      rollDice(state, action.faces, events);
      break;
  }
  return { state, events };
}

// ---- ツモ ----

function removeFromHand(
  state: RoundState,
  seat: Seat,
  tiles: readonly TileId[],
): void {
  state.hands[seat] = state.hands[seat].filter((id) => !tiles.includes(id));
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

function startTurn(state: RoundState, seat: Seat, events: RoundEvent[]): void {
  state.phase = "awaitTurnAction";
  state.turn = seat;
  state.kuikae = null;
  state.rinshanDraw = false;
  draw(state, seat, "wall", events);
  afterDraw(state, seat, events);
}

/** 手牌にある花牌をすべて抜いて、嶺上牌から補充する。 */
function extractFlowers(
  state: RoundState,
  seat: Seat,
  events: RoundEvent[],
): void {
  for (;;) {
    const flower = state.hands[seat].find(isFlower);
    if (flower === undefined) break;
    removeFromHand(state, seat, [flower]);
    state.flowers[seat].push(flower);
    events.push({ type: "flower", seat, tile: flower });
    draw(state, seat, "flower", events);
  }
}

/** 花牌を抜き、リーチ中ならポッチを判定する。 */
function afterDraw(state: RoundState, seat: Seat, events: RoundEvent[]): void {
  extractFlowers(state, seat, events);

  const variant = tileOf(state.drawn!).variant;
  if (
    state.riichi[seat] &&
    (variant === "pocchi" || variant === "reversePocchi")
  ) {
    settlePocchi(state, seat, events);
  }
}

// ---- 打牌と応答 ----

function isFuriten(
  state: RoundState,
  seat: Seat,
  waits: readonly TileKind[],
): boolean {
  if (state.tempFuriten[seat] || state.riichi[seat]?.furiten) return true;
  return state.rivers[seat].some((d) => waits.includes(tileOf(d.tile).kind));
}

function discard(
  state: RoundState,
  seat: Seat,
  tile: TileId,
  /** リーチ宣言なら2倍リーチかどうか。宣言でなければ null。 */
  riichiDoubleStake: boolean | null,
  events: RoundEvent[],
): void {
  const tsumogiri = tile === state.drawn;
  const declaring = riichiDoubleStake !== null;
  const firstDiscard = state.rivers[seat].length === 0;

  removeFromHand(state, seat, [tile]);
  state.rivers[seat].push({
    tile,
    tsumogiri,
    ...(declaring && { riichi: true }),
  });
  state.drawn = null;
  state.rinshanDraw = false;
  state.kuikae = null;
  state.tempFuriten[seat] = false;
  const current = state.riichi[seat];
  if (current) current.ippatsu = false;
  if (declaring) {
    state.riichi[seat] = {
      doubleRiichi: firstDiscard && !state.anyCall,
      doubleStake: riichiDoubleStake,
      ippatsu: true,
      furiten: false,
    };
  }
  events.push({
    type: "discard",
    seat,
    tile,
    tsumogiri,
    ...(declaring && { riichi: true }),
  });

  const kind = tileOf(tile).kind;
  const pending: PendingDiscard = {
    seat,
    tile,
    options: [null, null, null],
    responses: [null, null, null],
    waiting: [],
    riichiStake: declaring
      ? riichiDoubleStake
        ? DOUBLE_STAKE
        : RIICHI_STAKE
      : null,
  };
  // 最後の打牌は鳴けない
  const callable = state.wall.live.length > 0;
  for (const other of SEATS) {
    if (other === seat) continue;
    const waits = waitingKinds(state.hands[other], state.melds[other]);
    let ron = false;
    if (waits.includes(kind)) {
      pending.waiting.push(other);
      ron =
        !isFuriten(state, other, waits) &&
        evaluateWin(buildWinInput(state, other, tile, false)) !== null;
    }
    const held = countOf(state, other, kind);
    const canCall = callable && !state.riichi[other];
    const options: ResponseOptions = {
      ron,
      pon: canCall && held >= 2,
      minkan: canCall && held >= 3 && canKan(state),
    };
    if (options.ron || options.pon || options.minkan) {
      pending.options[other] = options;
    }
  }

  state.pending = pending;
  if (pending.options.some((options) => options !== null)) {
    state.phase = "awaitResponses";
  } else {
    resolveDiscard(state, events);
  }
}

function respond(
  state: RoundState,
  seat: Seat,
  response: NonNullable<PendingDiscard["responses"][Seat]>,
  events: RoundEvent[],
): void {
  const pending = state.pending!;
  pending.responses[seat] = response;
  const done = SEATS.every(
    (s) => pending.options[s] === null || pending.responses[s] !== null,
  );
  if (done) resolveDiscard(state, events);
}

/** 応答が出そろったあとの処理。ロンが最優先、次にポンと槓、なければ次の人のツモ。 */
function resolveDiscard(state: RoundState, events: RoundEvent[]): void {
  const pending = state.pending!;
  const { seat: discarder, tile } = pending;

  const ronSeats = SEATS.filter((s) => pending.responses[s]?.type === "ron");
  if (ronSeats.length > 0) {
    const winners = orderFrom(nextSeat(discarder), ronSeats);
    settleRon(state, winners, discarder, tile, events);
    return;
  }

  // 和了牌を見逃した人はフリテン。リーチ中なら以後ツモ和了のみ
  for (const seat of pending.waiting) {
    const riichi = state.riichi[seat];
    if (riichi) riichi.furiten = true;
    else state.tempFuriten[seat] = true;
  }

  // ロンされなかったのでリーチ成立
  if (pending.riichiStake !== null) {
    const riichi = state.riichi[discarder]!;
    state.points[discarder] -= pending.riichiStake;
    state.kyotaku += pending.riichiStake;
    events.push({
      type: "riichi",
      seat: discarder,
      doubleRiichi: riichi.doubleRiichi,
      doubleStake: riichi.doubleStake,
    });
  }

  state.pending = null;
  for (const seat of SEATS) {
    const response = pending.responses[seat];
    if (response?.type !== "pon" && response?.type !== "minkan") continue;

    const kind = tileOf(tile).kind;
    const fromHand =
      response.type === "pon"
        ? [...response.tiles]
        : state.hands[seat].filter((id) => tileOf(id).kind === kind);
    removeFromHand(state, seat, fromHand);
    const meld: MeldState = {
      type: response.type,
      tiles: [...fromHand, tile],
      from: discarder,
    };
    state.melds[seat].push(meld);
    state.rivers[discarder].at(-1)!.called = true;

    if (response.type === "minkan") {
      afterKan(state, seat, meld, events);
      return;
    }
    breakFirstTurn(state);
    state.phase = "awaitTurnAction";
    state.turn = seat;
    state.kuikae = kind;
    events.push({ type: "pon", seat, from: discarder, tiles: [...meld.tiles] });
    return;
  }

  if (state.wall.live.length === 0) settleExhaustiveDraw(state, events);
  else startTurn(state, nextSeat(discarder), events);
}

/** ポンと槓で、一発とダブルリーチ・天和・地和の権利が消える。 */
function breakFirstTurn(state: RoundState): void {
  state.anyCall = true;
  for (const riichi of state.riichi) {
    if (riichi) riichi.ippatsu = false;
  }
}

/** 槓ドラをめくり、嶺上牌をツモる。 */
function afterKan(
  state: RoundState,
  seat: Seat,
  meld: MeldState,
  events: RoundEvent[],
): void {
  breakFirstTurn(state);
  state.kanCount++;
  events.push({
    type: "kan",
    seat,
    kanType: meld.type === "pon" ? "kakan" : meld.type,
    from: meld.from,
    tiles: [...meld.tiles],
  });

  const indicator = state.wall.live.pop()!;
  const ura = state.wall.live.pop()!;
  state.wall.doraIndicators.push(indicator);
  state.wall.uraIndicators.push(ura);
  events.push({ type: "dora", indicator });

  state.phase = "awaitTurnAction";
  state.turn = seat;
  state.kuikae = null;
  state.rinshanDraw = true;
  draw(state, seat, "kan", events);
  afterDraw(state, seat, events);
}

// ---- サイコロチャンス ----

function rollDice(
  state: RoundState,
  faces: [number, number],
  events: RoundEvent[],
): void {
  const chance = state.dice.shift()!;
  const sorted: [number, number] =
    faces[0] < faces[1] ? faces : [faces[1], faces[0]];
  const { rolls, hits } = rollDiceChance(state.seed, state.diceRolled, sorted);
  state.diceRolled++;

  const chipDeltas: PerSeat<number> = [0, 0, 0];
  for (const [payer, receiver] of chance.transfers) {
    chipDeltas[payer] -= chance.chipsPerHit * hits;
    chipDeltas[receiver] += chance.chipsPerHit * hits;
  }
  for (const seat of SEATS) state.chipDeltas[seat] += chipDeltas[seat];
  events.push({
    type: "dice",
    seat: chance.seat,
    faces: sorted,
    rolls,
    hits,
    chipDeltas,
  });

  if (state.dice.length === 0) state.phase = "ended";
}
