import {
  SEATS,
  isCompleteHand,
  isFlower,
  isGoodWait,
  kindsOf,
  shanten,
  tileOf,
  waitingKinds,
} from "@/engine";
import type {
  GameEvent,
  Meld,
  PerSeat,
  RoundEvent,
  RoundOutcome,
  Seat,
  TileId,
  WinRecord,
} from "@/engine";
import { emptyStats } from "./types";
import type { GameStats } from "./types";

/*
 * 牌譜1対局分から、3人それぞれの集計値を出す。UI、DB、通信には依存しない。
 * 手牌は牌譜の配牌、ツモ、打牌、鳴きをたどって復元する。
 */

/** 牌譜のイベント。seed は直後に始まる局の乱数の種。 */
export type StatsEvent = GameEvent | { type: "seed"; seed: string };

type EventOf<T extends RoundEvent["type"]> = Extract<RoundEvent, { type: T }>;

/** 1局の間だけ持つ状態 */
interface Track {
  /** 門前部分。抜く前の花牌を含むことがある */
  hands: PerSeat<TileId[]>;
  melds: PerSeat<Meld[]>;
  /** 自分が切った牌の枚数 */
  discards: PerSeat<number>;
  /** 成立したリーチ */
  riichi: PerSeat<{ doubleStake: boolean } | null>;
  /** ポンか大明槓をした */
  open: PerSeat<boolean>;
}

const newTrack = (): Track => ({
  hands: [[], [], []],
  melds: [[], [], []],
  discards: [0, 0, 0],
  riichi: [null, null, null],
  open: [false, false, false],
});

const MISMATCH = "牌譜と手牌が合いません";

// 祝儀の枚数（docs/SPEC.md の「祝儀」）。内訳を出すために、エンジンの計算と同じ値を持つ
const GOLD_CHIPS = 2;
const YAKUMAN_TSUMO_CHIPS = 10;
const YAKUMAN_RON_CHIPS = 20;

function remove(track: Track, seat: Seat, tiles: readonly TileId[]): void {
  track.hands[seat] = track.hands[seat].filter((id) => !tiles.includes(id));
}

/** 花牌を除いた門前部分。 */
function concealedOf(track: Track, seat: Seat): TileId[] {
  return track.hands[seat].filter((id) => !isFlower(id));
}

function onKan(track: Track, event: EventOf<"kan">): void {
  const { seat } = event;
  remove(track, seat, event.tiles);
  const melds = track.melds[seat];
  if (event.kanType !== "kakan") {
    melds.push({ type: event.kanType, tiles: [...event.tiles] });
    if (event.kanType === "minkan") track.open[seat] = true;
    return;
  }
  // 加槓は、ポンした面子を槓子に変える
  const kind = tileOf(event.tiles[0]!).kind;
  const index = melds.findIndex(
    (meld) => meld.type === "pon" && tileOf(meld.tiles[0]!).kind === kind,
  );
  if (index < 0) throw new Error(MISMATCH);
  melds[index] = { type: "kakan", tiles: [...event.tiles] };
}

function onRiichi(
  stats: PerSeat<GameStats>,
  track: Track,
  event: EventOf<"riichi">,
): void {
  const { seat } = event;
  const mine = stats[seat];
  const hand = concealedOf(track, seat);
  // リーチは聴牌していないと宣言できない。ここで待ちがなければ、手牌の復元がずれている
  if (waitingKinds(hand, track.melds[seat]).length === 0) {
    throw new Error(MISMATCH);
  }
  mine.riichi++;
  if (isGoodWait(hand, track.melds[seat])) mine.riichiGood++;
  mine.riichiTurns += track.discards[seat];
  if (SEATS.some((other) => other !== seat && track.riichi[other])) {
    mine.riichiChase++;
  }
  if (event.doubleStake) mine.doubleStake++;
  track.riichi[seat] = { doubleStake: event.doubleStake };
}

/** 和了で受け取った祝儀を内訳に分ける。逆ポッチ（払う側）は数えない。 */
function addWinChips(mine: GameStats, win: WinRecord, doubleStake: boolean) {
  const received = win.chipDeltas[win.seat];
  if (received <= 0) return;
  const { result } = win;
  // 流し役満は役満祝儀だけ
  if (!result) {
    mine.chipsYakuman += received;
    return;
  }
  // ツモは2人から、ロンは1人から。2倍リーチは2倍
  const tsumo = win.from === null;
  const unit = (tsumo ? 2 : 1) * (doubleStake ? 2 : 1);
  mine.chipsRed += result.dora.red * unit;
  mine.chipsGold += result.dora.gold * GOLD_CHIPS * unit;
  mine.chipsUra += result.dora.ura * unit;
  if (result.yaku.some((yaku) => yaku.name === "ippatsu")) {
    mine.chipsIppatsu += unit;
  }
  mine.chipsYakuman +=
    result.yakuman * (tsumo ? YAKUMAN_TSUMO_CHIPS : YAKUMAN_RON_CHIPS) * unit;
}

function onWin(stats: PerSeat<GameStats>, track: Track, win: WinRecord): void {
  const { seat } = win;
  const mine = stats[seat];
  const riichi = track.riichi[seat];

  // 手牌の復元が合っているかを、和了形になることで確かめる
  if (win.kind === "tsumo" || win.kind === "ron") {
    const kinds = kindsOf(concealedOf(track, seat));
    if (win.kind === "ron") kinds.push(tileOf(win.winTile!).kind);
    if (!isCompleteHand(kinds, track.melds[seat].length)) {
      throw new Error(MISMATCH);
    }
  }

  mine.wins++;
  mine.winPoints += win.pointDeltas[seat];
  mine.winTurns += track.discards[seat] + 1;
  if (win.kind === "tsumo") mine.tsumoWins++;
  if (win.kind === "pocchi" || win.kind === "reversePocchi") mine.pocchiWins++;
  // 流し役満は result がなく、役満1つとして扱う
  if ((win.result?.yakuman ?? 1) > 0) mine.yakuman++;

  if (riichi) {
    mine.riichiWins++;
    if (win.result?.yaku.some((yaku) => yaku.name === "ippatsu")) {
      mine.riichiIppatsu++;
    }
    if ((win.result?.dora.ura ?? 0) > 0) mine.riichiUra++;
    if (riichi.doubleStake) mine.doubleStakeWins++;
  }
  addWinChips(mine, win, riichi?.doubleStake ?? false);
}

/** ロンされた人の集計。ダブロンは放銃1回で、放銃点は2人分の合計。 */
function onDealIn(
  stats: PerSeat<GameStats>,
  track: Track,
  from: Seat,
  rons: readonly WinRecord[],
): void {
  const mine = stats[from];
  mine.dealIns++;
  for (const win of rons) mine.dealInPoints -= win.pointDeltas[from];

  // 放銃した牌を切ったあとの手牌で数える
  const value = shanten(concealedOf(track, from), track.melds[from]);
  mine.dealInShanten += value;
  if (value <= 0) mine.dealInTenpai++;
  else if (value === 1) mine.dealInOneAway++;
  else mine.dealInFar++;

  if (rons.some((win) => track.riichi[win.seat])) mine.dealInToRiichi++;
  if (track.riichi[from]) mine.dealInWhileRiichi++;
  if (track.open[from]) mine.dealInWhileOpen++;
}

function onRoundEnd(
  stats: PerSeat<GameStats>,
  track: Track,
  outcome: RoundOutcome,
): void {
  for (const seat of SEATS) {
    const mine = stats[seat];
    mine.rounds++;
    if (track.open[seat]) mine.callRounds++;
    if (outcome.type === "exhaustiveDraw") {
      mine.draws++;
      if (outcome.tenpai.includes(seat)) mine.drawTenpai++;
    }
  }

  for (const win of outcome.wins) onWin(stats, track, win);
  for (const from of SEATS) {
    const rons = outcome.wins.filter(
      (win) => win.kind === "ron" && win.from === from,
    );
    if (rons.length > 0) onDealIn(stats, track, from, rons);
  }

  for (const { seat, to } of outcome.tobi) {
    stats[seat].tobiSuffered++;
    stats[to].tobiMade++;
  }
}

/** 牌譜1対局分から、席ごとの集計値を出す。牌譜と手牌が合わなければ例外を投げる。 */
export function analyzeGame(events: readonly StatsEvent[]): PerSeat<GameStats> {
  const stats: PerSeat<GameStats> = [emptyStats(), emptyStats(), emptyStats()];
  let track = newTrack();

  for (const event of events) {
    switch (event.type) {
      case "roundStart":
        track = newTrack();
        break;
      case "deal":
        track.hands = [
          [...event.hands[0]],
          [...event.hands[1]],
          [...event.hands[2]],
        ];
        break;
      case "draw":
        track.hands[event.seat].push(event.tile);
        break;
      case "flower":
        remove(track, event.seat, [event.tile]);
        break;
      case "discard":
        remove(track, event.seat, [event.tile]);
        track.discards[event.seat]++;
        break;
      case "riichi":
        onRiichi(stats, track, event);
        break;
      case "pon":
        remove(track, event.seat, event.tiles);
        track.melds[event.seat].push({ type: "pon", tiles: [...event.tiles] });
        track.open[event.seat] = true;
        break;
      case "kan":
        onKan(track, event);
        break;
      case "roundEnd":
        onRoundEnd(stats, track, event.outcome);
        break;
      case "dice":
        stats[event.seat].diceChances++;
        stats[event.seat].diceHits += event.hits;
        for (const seat of SEATS) {
          stats[seat].diceChips += event.chipDeltas[seat];
        }
        break;
      // seed、dora、gameEnd は集計に使わない
      default:
        break;
    }
  }
  return stats;
}
