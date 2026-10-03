import type { DoraCount, WinResult, YakuName } from "@/engine";

/** 和了の内訳の1行。役、ドラ類、裏ドラ */
export type RevealItem =
  | { kind: "yaku"; name: YakuName; han: number }
  | { kind: "bonus"; key: Exclude<keyof DoraCount, "ura">; han: number }
  | { kind: "ura"; han: number };

/** 裏ドラ以外のドラ類を出す順 */
const BONUS_KEYS = ["dora", "red", "gold", "flower"] as const;

/**
 * 内訳を見せる順に並べる。役、ドラ類（表ドラ、赤、金、花）、最後に裏ドラ。
 * 乗っていないドラ類は入れない。
 */
export function revealItems(result: WinResult): RevealItem[] {
  return [
    ...result.yaku.map((yaku) => ({
      kind: "yaku" as const,
      name: yaku.name,
      han: yaku.han,
    })),
    ...BONUS_KEYS.filter((key) => result.dora[key] > 0).map((key) => ({
      kind: "bonus" as const,
      key,
      han: result.dora[key],
    })),
    ...(result.dora.ura > 0
      ? [{ kind: "ura" as const, han: result.dora.ura }]
      : []),
  ];
}

/** 内訳を1行ずつ出す間隔 */
export const REVEAL_STEP_MS = 600;
/** 最後の行を出してから裏ドラをめくるまで */
export const URA_FLIP_MS = 600;
/** 裏ドラをめくってから裏ドラの行を出すまで（牌が光っている間） */
export const URA_SETTLE_MS = 900;
/** 内訳を出し切ってから点棒の移動を出すまで */
export const SETTLE_PAUSE_MS = 400;

/** 内訳の演出の時刻（ms、結果を出した時点から） */
export interface RevealSchedule {
  /** i 番目の行（裏ドラを除く）を出す時刻 */
  steps: number[];
  /** 裏ドラをめくる時刻。裏ドラ表示牌がなければ null */
  flip: number | null;
  /** 内訳がすべて出て、点棒の移動を出す時刻 */
  settle: number;
}

/**
 * @param count 裏ドラを除いた行数。ダブロンなら多い方
 * @param ura 裏ドラ表示牌をめくるか（リーチの和了がある）
 */
export function revealSchedule(count: number, ura: boolean): RevealSchedule {
  const steps = Array.from(
    { length: count },
    (_, i) => (i + 1) * REVEAL_STEP_MS,
  );
  const last = count * REVEAL_STEP_MS;
  if (!ura) return { steps, flip: null, settle: last + SETTLE_PAUSE_MS };
  const flip = last + URA_FLIP_MS;
  return { steps, flip, settle: flip + URA_SETTLE_MS };
}
