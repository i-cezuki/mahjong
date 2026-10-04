import {
  IllegalActionError,
  TILE_COUNT,
  TILE_KINDS,
  applyGameAction,
  legalActions,
  nextSeat,
  startGame,
} from "@/engine";
import type {
  Action,
  Discard,
  GameEvent,
  GameResult,
  GameState,
  MeldState,
  PerSeat,
  RoundEvent,
  RoundOutcome,
  RoundState,
  Seat,
  TileId,
  TileKind,
} from "@/engine";

/** 持ち時間の状態。ルールは clock.ts にある。 */
export interface Clock {
  /** この状態を保存したサーバーの時刻（エポックms） */
  savedAt: number;
  /** いまの待ちが始まった時刻（エポックms）。待っていなければ null */
  startedAt: number | null;
  /** 待たれている人ごとの期限（エポックms）。待たれていない人は null */
  deadlines: PerSeat<number | null>;
  /** deadlines のうち最も早いもの。時間切れの申告はこの時刻を過ぎてから送る */
  deadline: number | null;
  /** 残り持ち時間（長考、ms）。手番と応答で共有し、局が変わると戻る */
  bank: PerSeat<number>;
  /** 即ツモ切り中。時間切れでなり、本人の操作で解除する */
  auto: PerSeat<boolean>;
  /** この局で長考ボタンを押した。局が変わると戻る */
  thinkUsed: PerSeat<boolean>;
  /** いまの判断で長考ボタンの30秒を使っている。判断が終わると戻る */
  thinking: PerSeat<boolean>;
}

/**
 * サーバーが保存する対局の全状態。エンジンの状態に、エンジンの外で決まることを足したもの。
 * UI、DB、通信には依存しない。
 */
export interface TableState {
  game: GameState;
  /** 局の結果を確認した人。3人そろったら次の局へ進む。 */
  confirmed: PerSeat<boolean>;
  /** この局で振ったサイコロの結果 */
  dice: DiceResult[];
  /** フェーズ8より前に始まった対局にはない。次の操作のときに clock.ts が補う。 */
  clock?: Clock;
}

export type DiceResult = Omit<Extract<RoundEvent, { type: "dice" }>, "type">;

/** 対局を進める操作。confirm は局の結果の確認。 */
export type PlayAction = Action | { type: "confirm"; seat: Seat };

/**
 * クライアントが送れる操作。resume は即ツモ切りの解除、think は長考ボタン（どちらも clock.ts が扱う）。
 */
export type TableAction =
  PlayAction | { type: "resume"; seat: Seat } | { type: "think"; seat: Seat };

/** 牌譜に残すイベント。seed は直後に始まる局の乱数の種。 */
export type TableEvent = GameEvent | { type: "seed"; seed: string };

export interface TableStep {
  table: TableState;
  events: TableEvent[];
}

/** プレイヤー1人に送る画面データ。自分の手牌と公開情報だけを含む。 */
export interface PlayerView {
  seat: Seat;
  phase: GameState["phase"];
  roundPhase: RoundState["phase"];
  roundIndex: number;
  honba: number;
  kyotaku: number;
  dealer: Seat;
  roundWind: "1z" | "2z";
  turn: Seat;
  points: PerSeat<number>;
  /** 終わった局までの祝儀の累計 */
  chips: PerSeat<number>;
  doraIndicators: TileId[];
  /** ツモ山の残り枚数 */
  wallCount: number;

  hand: TileId[];
  /** 自分の手番のツモ牌 */
  drawn: TileId | null;
  handCounts: PerSeat<number>;
  melds: PerSeat<MeldState[]>;
  flowers: PerSeat<TileId[]>;
  rivers: PerSeat<Discard[]>;
  riichi: PerSeat<{ doubleStake: boolean; open?: true } | null>;
  /** 成立したオープンリーチの手牌。手番のツモ牌は切るまで入れない */
  openHands: PerSeat<TileId[] | null>;
  /** 応答待ちになっている打牌。応答できる人にだけ出す */
  lastDiscard: { seat: Seat; tile: TileId } | null;

  /** いま自分にできる操作。クライアントは合法手を自分で判定しない。 */
  actions: PlayAction[];

  /** 出目の指定を待っているサイコロチャンス */
  diceChance: { seat: Seat; remaining: number } | null;
  dice: DiceResult[];
  outcome: RoundOutcome | null;
  /** 局が終わったあとに公開する手牌（和了した人と、流局時にテンパイの人） */
  revealed: PerSeat<TileId[] | null>;
  confirmed: PerSeat<boolean>;
  result: GameResult | null;

  /** 3人のうち最も早い期限（サーバーの時刻、エポックms）。時間切れの申告に使う。待っていなければ null */
  deadline: number | null;
  /** 自分の期限。自分が待たれていなければ null */
  myDeadline: number | null;
  /** いまの待ちが始まった時刻 */
  startedAt: number | null;
  /** この画面データを保存したサーバーの時刻。画面はこれとの差で残り時間を計算する */
  serverNow: number;
  /** 自分の残り持ち時間（ms） */
  bank: number;
  /** 即ツモ切り中の人 */
  auto: PerSeat<boolean>;
  /** いま長考ボタンを押せる */
  canThink: boolean;
  /** いまの判断で長考ボタンの30秒を使っている */
  thinking: boolean;
}

/**
 * 長考ボタンを押せるか。手番か応答で待たれていて、自動でなく、この局でまだ押していない。
 * clock のない状態（フェーズ8より前に始まった対局）では押せない。
 */
export function canThink(table: TableState, seat: Seat): boolean {
  const { phase } = table.game.round;
  const clock = table.clock;
  return (
    (phase === "awaitTurnAction" || phase === "awaitResponses") &&
    clock !== undefined &&
    clock.deadlines?.[seat] != null &&
    !clock.auto[seat] &&
    !clock.thinkUsed?.[seat]
  );
}

/** 席0を起家として対局を始める。席順は呼び出す側が決める。 */
export function startTable(params: { seed: string }): TableStep {
  const step = startGame({ seed: params.seed, firstDealer: 0 });
  return {
    table: { game: step.state, confirmed: [false, false, false], dice: [] },
    events: [{ type: "seed", seed: params.seed }, ...step.events],
  };
}

function isRoundResult(table: TableState): boolean {
  return table.game.phase === "playing" && table.game.round.phase === "ended";
}

/**
 * 操作を適用した新しい状態とイベントを返す。不正な操作は IllegalActionError。
 * @param nextSeed 次の局を始めるときにだけ呼ぶ。新しい乱数の種を返す。
 */
export function applyTableAction(
  table: TableState,
  action: PlayAction,
  nextSeed: () => string,
): TableStep {
  if (action.type !== "confirm") {
    const step = applyGameAction(table.game, action);
    const rolled = step.events.flatMap((event): DiceResult[] =>
      event.type === "dice"
        ? [
            {
              seat: event.seat,
              faces: event.faces,
              rolls: event.rolls,
              hits: event.hits,
              chipDeltas: event.chipDeltas,
            },
          ]
        : [],
    );
    return {
      table: { ...table, game: step.state, dice: [...table.dice, ...rolled] },
      events: step.events,
    };
  }

  if (table.game.phase === "ended") throw new IllegalActionError("gameEnded");
  if (!isRoundResult(table) || table.confirmed[action.seat]) {
    throw new IllegalActionError("notAllowed");
  }
  const confirmed: PerSeat<boolean> = [...table.confirmed];
  confirmed[action.seat] = true;
  if (!confirmed.every(Boolean)) {
    return { table: { ...table, confirmed }, events: [] };
  }

  const seed = nextSeed();
  const step = applyGameAction(table.game, { type: "nextRound", seed });
  return {
    table: {
      ...table,
      game: step.state,
      confirmed: [false, false, false],
      dice: [],
    },
    events: [{ type: "seed", seed }, ...step.events],
  };
}

/** その席がいまできる操作。局の結果では確認、それ以外はエンジンの合法手。 */
export function actionsFor(table: TableState, seat: Seat): PlayAction[] {
  if (table.game.phase === "ended") return [];
  if (isRoundResult(table)) {
    return table.confirmed[seat] ? [] : [{ type: "confirm", seat }];
  }
  return legalActions(table.game.round, seat);
}

function perSeat<T>(fn: (seat: Seat) => T): PerSeat<T> {
  return [fn(0), fn(1), fn(2)];
}

/**
 * 1人分の画面データを作る。クライアントに送る内容はすべてここを通す。
 * 他家の手牌、山、裏ドラ、乱数の種は入れない。
 */
export function buildView(table: TableState, seat: Seat): PlayerView {
  const { game } = table;
  const round = game.round;
  const outcome = round.outcome;
  const pending = round.phase === "awaitResponses" ? round.pending : null;
  // 応答できる人がいることは、その人にしか見せない。ほかの人（スルーした人を含む）には、
  // 全員がスルーして打牌が通ったあとのように見せる（次の人の手番、リーチ棒の供託）
  const responding =
    pending !== null &&
    pending.options[seat] !== null &&
    pending.responses[seat] === null;
  const hidden = pending !== null && !responding ? pending : null;
  const riichiStake = hidden?.riichiStake ?? null;
  const points: PerSeat<number> = [...round.points];
  if (hidden && riichiStake !== null) points[hidden.seat] -= riichiStake;
  const chance = round.phase === "diceChance" ? round.dice[0] : undefined;

  const view: PlayerView = {
    seat,
    phase: game.phase,
    roundPhase: hidden ? "awaitTurnAction" : round.phase,
    roundIndex: game.roundIndex,
    honba: round.honba,
    kyotaku: round.kyotaku + (riichiStake ?? 0),
    dealer: round.dealer,
    roundWind: round.roundWind,
    turn: hidden ? nextSeat(hidden.seat) : round.turn,
    points,
    chips: game.chips,
    doraIndicators: round.wall.doraIndicators,
    wallCount: round.wall.live.length,

    hand: round.hands[seat],
    drawn: round.turn === seat ? round.drawn : null,
    handCounts: perSeat((s) => round.hands[s].length),
    melds: round.melds,
    flowers: round.flowers,
    rivers: round.rivers,
    riichi: perSeat((s) => {
      const riichi = round.riichi[s];
      if (!riichi) return null;
      return {
        doubleStake: riichi.doubleStake,
        ...(riichi.open && { open: true }),
      };
    }),
    openHands: perSeat((s) => {
      // 宣言牌への応答を待っている間は、まだ成立していない。応答できない人には成立したように見せる
      const declaring =
        responding && pending.seat === s && pending.riichiStake !== null;
      if (!round.riichi[s]?.open || declaring) return null;
      const drawn = round.turn === s ? round.drawn : null;
      return round.hands[s].filter((id) => id !== drawn);
    }),
    lastDiscard: responding ? { seat: pending.seat, tile: pending.tile } : null,

    actions: actionsFor(table, seat),

    diceChance: chance
      ? { seat: chance.seat, remaining: round.dice.length }
      : null,
    dice: table.dice,
    outcome,
    revealed: perSeat((s) => {
      if (!outcome) return null;
      const shown =
        outcome.tenpai.includes(s) ||
        outcome.wins.some((win) => win.seat === s && win.result !== null);
      return shown ? round.hands[s] : null;
    }),
    confirmed: table.confirmed,
    result: game.result,

    deadline: table.clock?.deadline ?? null,
    myDeadline: table.clock?.deadlines[seat] ?? null,
    startedAt: table.clock?.startedAt ?? null,
    serverNow: table.clock?.savedAt ?? 0,
    bank: table.clock?.bank[seat] ?? 0,
    auto: table.clock?.auto ?? [false, false, false],
    canThink: canThink(table, seat),
    thinking: table.clock?.thinking?.[seat] ?? false,
  };
  return structuredClone(view);
}

// ---- クライアントから届いた操作の検証 ----

function isTileId(value: unknown): value is TileId {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < TILE_COUNT
  );
}

function isPair<T>(
  value: unknown,
  check: (item: unknown) => item is T,
): value is [T, T] {
  return Array.isArray(value) && value.length === 2 && value.every(check);
}

function isDiceFace(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 6
  );
}

/**
 * クライアントが送ってきた操作の形を確かめる。席はログイン中のユーザーから決める。
 * 合法かどうかはここでは見ない（エンジンが判定する）。形がおかしければ null。
 */
export function parseAction(input: unknown, seat: Seat): TableAction | null {
  if (typeof input !== "object" || input === null) return null;
  const raw = input as Record<string, unknown>;

  switch (raw.type) {
    case "tsumo":
    case "ron":
    case "minkan":
    case "pass":
    case "confirm":
    case "resume":
    case "think":
      return { type: raw.type, seat };
    case "discard":
    case "kakan":
      return isTileId(raw.tile)
        ? { type: raw.type, seat, tile: raw.tile }
        : null;
    case "riichi":
      if (!isTileId(raw.tile) || typeof raw.doubleStake !== "boolean") {
        return null;
      }
      if (raw.open !== undefined && raw.open !== true) return null;
      return {
        type: "riichi",
        seat,
        tile: raw.tile,
        doubleStake: raw.doubleStake,
        ...(raw.open === true && { open: true }),
      };
    case "ankan":
      return TILE_KINDS.includes(raw.kind as TileKind)
        ? { type: "ankan", seat, kind: raw.kind as TileKind }
        : null;
    case "pon":
      return isPair(raw.tiles, isTileId)
        ? { type: "pon", seat, tiles: raw.tiles }
        : null;
    case "dice":
      return isPair(raw.faces, isDiceFace)
        ? { type: "dice", seat, faces: raw.faces }
        : null;
    default:
      return null;
  }
}
