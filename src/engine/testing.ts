import type { RoundState } from "./state";
import { ALL_TILES, TILE_COUNT } from "./tiles";
import type { TileId, TileVariant } from "./tiles";

/**
 * テスト用。id順に並んだ山（deck[i] === i）の指定位置を入れ替えて返す。
 *
 * 親が席0のとき、位置0〜12が親、13〜25が南家、26〜38が西家の配牌、
 * 39〜101がツモ山、102〜109が嶺上牌、110がドラ表示牌、111が裏ドラ表示牌。
 * id順のままだと花牌（108〜111）は嶺上牌の末尾と表示牌にあり、対局には出てこない。
 */
export function deckWithSwaps(...swaps: [number, number][]): TileId[] {
  const deck = Array.from({ length: TILE_COUNT }, (_, i) => i);
  for (const [a, b] of swaps) {
    [deck[a], deck[b]] = [deck[b]!, deck[a]!];
  }
  return deck;
}

export function range(start: number, end: number): number[] {
  return Array.from({ length: end - start }, (_, i) => start + i);
}

export function seedOf(n: number): string {
  return n.toString(16).padStart(64, "0");
}

/**
 * テスト用。"123p r5p g5s 11z" のような表記から牌idを割り当てる。
 * r は赤、g は金、o はポッチ、x は逆ポッチ（直後の1枚に付く）。指定がなければ通常の牌を使う。
 * 白だけは、通常の牌が足りなければポッチと逆ポッチも使う。
 * 同じ割り当て器から取った牌は重複しない。
 */
export function tileAllocator(): (notation: string) => TileId[] {
  const used = new Set<TileId>();
  const modifiers: Record<string, TileVariant> = {
    r: "red",
    g: "gold",
    o: "pocchi",
    x: "reversePocchi",
  };

  function take(kind: string, variant: TileVariant): TileId {
    const free = ALL_TILES.filter((t) => t.kind === kind && !used.has(t.id));
    // 白は通常の2枚を使い切ったらポッチも使う（役の判定では同じ白）
    const tile =
      free.find((t) => t.variant === variant) ??
      (kind === "5z" && variant === "normal" ? free[0] : undefined);
    if (tile === undefined)
      throw new Error(`牌が足りません: ${variant} ${kind}`);
    used.add(tile.id);
    return tile.id;
  }

  return (notation) => {
    const result: TileId[] = [];
    let pending: { rank: string; variant: TileVariant }[] = [];
    let variant: TileVariant = "normal";
    for (const char of notation.replace(/\s/g, "")) {
      if (char in modifiers) {
        variant = modifiers[char]!;
      } else if (/[0-9]/.test(char)) {
        pending.push({ rank: char, variant });
        variant = "normal";
      } else {
        for (const p of pending)
          result.push(take(`${p.rank}${char}`, p.variant));
        pending = [];
      }
    }
    if (pending.length > 0)
      throw new Error(`色の指定がありません: ${notation}`);
    return result;
  };
}

/** 重複を気にしない場面用。 */
export function tiles(notation: string): TileId[] {
  return tileAllocator()(notation);
}

export interface DeckSpec {
  /** 親（席0）、席1、席2の配牌。13枚ずつ。 */
  hands: [string, string, string];
  /** ツモ山の先頭から順に */
  live?: string;
  /** ツモ山の末尾（最後の牌が最初の槓ドラ表示牌、その手前が槓裏） */
  liveTail?: string;
  /** 嶺上牌の先頭から順に */
  rinshan?: string;
  dora?: string;
  ura?: string;
}

/**
 * テスト用。親が席0の山を組む。指定のない場所は残りの牌をid順に詰める。
 * 花牌は指定しない限り嶺上牌の末尾に集まり、対局には出てこない。
 * 指定がなければドラ表示牌は1萬（ドラは9萬）、裏ドラ表示牌は9萬（裏ドラは1萬）。
 */
export function buildDeck(spec: DeckSpec): TileId[] {
  const t = tileAllocator();
  const deck = new Array<TileId | undefined>(TILE_COUNT).fill(undefined);
  const place = (start: number, ids: TileId[]) =>
    ids.forEach((id, i) => (deck[start + i] = id));

  spec.hands.forEach((hand, seat) => {
    const ids = t(hand);
    if (ids.length !== 13) throw new Error(`配牌は13枚です: ${hand}`);
    place(seat * 13, ids);
  });
  place(39, t(spec.live ?? ""));
  const tail = t(spec.liveTail ?? "");
  place(102 - tail.length, tail);
  place(102, t(spec.rinshan ?? ""));
  place(110, t(spec.dora ?? "1m"));
  place(111, t(spec.ura ?? "9m"));

  const used = new Set(deck.filter((id) => id !== undefined));
  const rest = range(0, TILE_COUNT).filter((id) => !used.has(id));
  const order = [...range(0, 102), 110, 111, ...range(102, 110)];
  for (const position of order) {
    if (deck[position] === undefined) deck[position] = rest.shift();
  }
  return deck as TileId[];
}

/** 局の中にある全部の牌をid順に返す。112枚そろっていれば 0〜111 になる。 */
export function tilesInRound(state: RoundState): TileId[] {
  return [
    ...state.hands.flat(),
    ...state.flowers.flat(),
    ...state.melds.flat().flatMap((meld) => meld.tiles),
    // 鳴かれた牌は副露の側で数える
    ...state.rivers
      .flat()
      .filter((discard) => !discard.called)
      .map((discard) => discard.tile),
    ...state.wall.live,
    ...state.wall.rinshan,
    ...state.wall.doraIndicators,
    ...state.wall.uraIndicators,
  ].sort((a, b) => a - b);
}
