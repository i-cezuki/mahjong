import { createRng, shuffle } from "./rng";
import { ALL_TILES, TILE_COUNT } from "./tiles";
import type { TileId } from "./tiles";

export type Seat = 0 | 1 | 2;
export type PerSeat<T> = [T, T, T];

export const SEATS: readonly Seat[] = [0, 1, 2];
export const HAND_SIZE = 13;
export const RINSHAN_SIZE = 8;

export interface Wall {
  /** ツモ山。先頭から順にツモる。 */
  live: TileId[];
  /** 嶺上牌。花牌と槓の補充に先頭から使う。 */
  rinshan: TileId[];
  /** めくられているドラ表示牌 */
  doraIndicators: TileId[];
  /** ドラ表示牌の下にある裏ドラ表示牌（doraIndicators と同じ順） */
  uraIndicators: TileId[];
}

export function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % 3) as Seat;
}

/** 種から112枚を混ぜた山を作る。 */
export function shuffledDeck(seed: string): TileId[] {
  return shuffle(
    ALL_TILES.map((tile) => tile.id),
    createRng(seed),
  );
}

/**
 * 並び順の決まった山から配牌する。
 * 先頭から親、下家、上家の順に13枚ずつ、続く63枚がツモ山、8枚が嶺上牌、
 * 最後の2枚がドラ表示牌と裏ドラ表示牌。
 */
export function dealFromDeck(
  deck: readonly TileId[],
  dealer: Seat,
): { hands: PerSeat<TileId[]>; wall: Wall } {
  if (deck.length !== TILE_COUNT || new Set(deck).size !== TILE_COUNT) {
    throw new Error("山は112枚すべてを1枚ずつ含む必要があります");
  }

  const hands: PerSeat<TileId[]> = [[], [], []];
  let seat = dealer;
  for (let i = 0; i < 3; i++) {
    hands[seat] = deck.slice(i * HAND_SIZE, (i + 1) * HAND_SIZE);
    seat = nextSeat(seat);
  }

  const liveStart = 3 * HAND_SIZE;
  const rinshanStart = TILE_COUNT - RINSHAN_SIZE - 2;
  return {
    hands,
    wall: {
      live: deck.slice(liveStart, rinshanStart),
      rinshan: deck.slice(rinshanStart, rinshanStart + RINSHAN_SIZE),
      doraIndicators: [deck[TILE_COUNT - 2]!],
      uraIndicators: [deck[TILE_COUNT - 1]!],
    },
  };
}
