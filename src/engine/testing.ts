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
