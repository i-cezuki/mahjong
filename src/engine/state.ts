import type { Meld } from "./agari";
import type { TileId, TileKind } from "./tiles";
import type { PerSeat, Seat, Wall } from "./wall";
import type { WinResult } from "./yaku";

export type { PerSeat, Seat } from "./wall";

/** wall=ツモ山、flower=花牌を抜いた補充、kan=槓の補充 */
export type DrawSource = "wall" | "flower" | "kan";

export interface Discard {
  tile: TileId;
  tsumogiri: boolean;
  /** リーチの宣言牌 */
  riichi?: true;
  /** 他家に鳴かれた */
  called?: true;
}

export interface MeldState extends Meld {
  /** 鳴いた相手。暗槓は null。 */
  from: Seat | null;
}

export interface RiichiState {
  /** ダブルリーチ（2翻） */
  doubleRiichi: boolean;
  /** 2倍リーチ（供託5000点） */
  doubleStake: boolean;
  ippatsu: boolean;
  /** リーチ後に和了牌を見逃した。以後はツモ和了のみ。 */
  furiten: boolean;
}

export interface ResponseOptions {
  ron: boolean;
  pon: boolean;
  minkan: boolean;
}

export type Response =
  | { type: "ron" }
  | { type: "pon"; tiles: [TileId, TileId] }
  | { type: "minkan" }
  | { type: "pass" };

/** 打牌への応答待ち */
export interface PendingDiscard {
  seat: Seat;
  tile: TileId;
  /** 応答できる人とその選択肢。null は応答なし。 */
  options: PerSeat<ResponseOptions | null>;
  responses: PerSeat<Response | null>;
  /** この牌が待ちに含まれる人（見逃せばフリテンになる） */
  waiting: Seat[];
  /** リーチ宣言牌なら供託する点数。ロンされなければ成立する。 */
  riichiStake: number | null;
}

export interface DiceChance {
  /** 出目を指定する人 */
  seat: Seat;
  chipsPerHit: number;
  /** 当たり1回ごとの祝儀の移動 [払う人, 受け取る人] */
  transfers: [Seat, Seat][];
}

export type WinKind = "tsumo" | "ron" | "pocchi" | "reversePocchi" | "nagashi";

export interface WinRecord {
  seat: Seat;
  /** 放銃者。ロン以外は null。 */
  from: Seat | null;
  kind: WinKind;
  /** 和了牌。ポッチと逆ポッチは高め取りした牌、流し役満は null。 */
  winTile: TileId | null;
  /** 流し役満は null */
  result: WinResult | null;
  pointDeltas: PerSeat<number>;
  /** 飛び賞とサイコロを含まない祝儀 */
  chipDeltas: PerSeat<number>;
}

export interface RoundOutcome {
  /** 流し役満は win として扱う */
  type: "win" | "exhaustiveDraw";
  wins: WinRecord[];
  /** 流局時にテンパイしていた人 */
  tenpai: Seat[];
  dealerWon: boolean;
  dealerTenpai: boolean;
  /** 供託の受け取りを含む点棒の移動 */
  pointDeltas: PerSeat<number>;
  /** 飛び賞を含む祝儀の移動。サイコロは含まない。 */
  chipDeltas: PerSeat<number>;
  tobi: { seat: Seat; to: Seat }[];
  /** リーチした人が和了したときだけ公開する */
  uraIndicators: TileId[];
}

export interface RoundState {
  phase: "awaitTurnAction" | "awaitResponses" | "diceChance" | "ended";
  /** この局の乱数の種。サイコロにも使う。 */
  seed: string;
  dealer: Seat;
  /** 起家。同点の順位付けに使う。 */
  firstDealer: Seat;
  roundWind: "1z" | "2z";
  honba: number;
  /** 卓上の供託（点） */
  kyotaku: number;
  points: PerSeat<number>;

  /** 手番の席 */
  turn: Seat;
  /** 並べ替え済みの手牌。手番の人はツモ牌を含む。 */
  hands: PerSeat<TileId[]>;
  /** 手番の人が最後にツモった牌。花牌を抜いたときは補充牌。ポンの直後は null。 */
  drawn: TileId | null;
  /** いまのツモが槓の補充（嶺上開花の対象） */
  rinshanDraw: boolean;
  melds: PerSeat<MeldState[]>;
  /** 抜いた花牌 */
  flowers: PerSeat<TileId[]>;
  rivers: PerSeat<Discard[]>;
  wall: Wall;

  riichi: PerSeat<RiichiState | null>;
  /** 同巡フリテン */
  tempFuriten: PerSeat<boolean>;
  /** この局でポンか槓があった（ダブルリーチ、天和、地和が消える） */
  anyCall: boolean;
  kanCount: number;
  /** ポンの直後に切れない牌（喰い替え） */
  kuikae: TileKind | null;
  pending: PendingDiscard | null;

  /** 残っているサイコロチャンス */
  dice: DiceChance[];
  diceRolled: number;
  /** この局の祝儀の移動（飛び賞とサイコロを含む） */
  chipDeltas: PerSeat<number>;
  outcome: RoundOutcome | null;
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
  | {
      type: "discard";
      seat: Seat;
      tile: TileId;
      tsumogiri: boolean;
      riichi?: true;
    }
  | { type: "riichi"; seat: Seat; doubleRiichi: boolean; doubleStake: boolean }
  | { type: "pon"; seat: Seat; from: Seat; tiles: TileId[] }
  | {
      type: "kan";
      seat: Seat;
      kanType: "ankan" | "minkan" | "kakan";
      from: Seat | null;
      tiles: TileId[];
    }
  | { type: "dora"; indicator: TileId }
  | { type: "roundEnd"; outcome: RoundOutcome }
  | {
      type: "dice";
      seat: Seat;
      faces: [number, number];
      /** ゾロ目を含む全部の出目 */
      rolls: [number, number][];
      hits: number;
      chipDeltas: PerSeat<number>;
    };

export type Action =
  | { type: "discard"; seat: Seat; tile: TileId }
  | { type: "riichi"; seat: Seat; tile: TileId; doubleStake: boolean }
  | { type: "tsumo"; seat: Seat }
  | { type: "ankan"; seat: Seat; kind: TileKind }
  | { type: "kakan"; seat: Seat; tile: TileId }
  | { type: "ron"; seat: Seat }
  | { type: "pon"; seat: Seat; tiles: [TileId, TileId] }
  | { type: "minkan"; seat: Seat }
  | { type: "pass"; seat: Seat }
  | { type: "dice"; seat: Seat; faces: [number, number] };

export interface Step {
  state: RoundState;
  events: RoundEvent[];
}

export type IllegalActionCode =
  "roundEnded" | "notYourTurn" | "tileNotInHand" | "notAllowed" | "gameEnded";

export class IllegalActionError extends Error {
  constructor(readonly code: IllegalActionCode) {
    super(`不正な操作です: ${code}`);
    this.name = "IllegalActionError";
  }
}
