import { completesRyanmen, decompose, isChiitoitsu, isKokushi } from "./agari";
import type { Meld } from "./agari";
import {
  doraKind,
  isHonor,
  isTerminal,
  isYaochu,
  kindsOf,
  rankOf,
  suitOf,
  tileOf,
} from "./tiles";
import type { TileId, TileKind } from "./tiles";

/** 東、南、西 */
export type Wind = "1z" | "2z" | "3z";

export interface WinInput {
  /** 門前の手牌（和了牌を含まない） */
  concealed: readonly TileId[];
  winTile: TileId;
  melds?: readonly Meld[];
  /** 抜いた花牌 */
  flowers?: readonly TileId[];
  tsumo: boolean;
  /** 自風。親は東。 */
  seatWind: Wind;
  roundWind: "1z" | "2z";
  riichi?: "riichi" | "doubleRiichi" | undefined;
  /** オープンリーチ。リーチしていなければ無視する */
  openRiichi?: boolean;
  ippatsu?: boolean;
  /** ツモり切りの最後の牌での和了（ツモなら海底、ロンなら河底） */
  lastTile?: boolean;
  /** 槓の補充牌での和了（花牌の補充では付かない） */
  rinshan?: boolean;
  /** 誰も鳴いていない1巡目の、自分の最初のツモ（天和、地和） */
  firstTurn?: boolean;
  doraIndicators?: readonly TileId[];
  /** リーチしていなければ無視する */
  uraIndicators?: readonly TileId[];
}

export type YakuName =
  | "riichi"
  | "openRiichi"
  | "doubleRiichi"
  | "ippatsu"
  | "menzenTsumo"
  | "tanyao"
  | "pinfu"
  | "iipeikou"
  | "haku"
  | "hatsu"
  | "chun"
  | "seatWind"
  | "roundWind"
  | "rinshan"
  | "haitei"
  | "houtei"
  | "chiitoitsu"
  | "toitoi"
  | "sanankou"
  | "sankantsu"
  | "sanshokuDoukou"
  | "honroutou"
  | "shousangen"
  | "chanta"
  | "ittsu"
  | "honitsu"
  | "junchan"
  | "ryanpeikou"
  | "chinitsu"
  // 役満
  | "tenhou"
  | "chiihou"
  | "kokushi"
  | "suuankou"
  | "daisangen"
  | "shousuushii"
  | "daisuushii"
  | "tsuuiisou"
  | "chinroutou"
  | "ryuuiisou"
  | "chuuren"
  | "suukantsu"
  // 追加役満
  | "manzuHonitsu"
  | "chinitsuChiitoitsu"
  | "riichiOnly";

export interface Yaku {
  name: YakuName;
  /** 役満は13 */
  han: number;
}

export interface DoraCount {
  /** 表ドラ（槓ドラを含む） */
  dora: number;
  /** 裏ドラ（槓裏を含む） */
  ura: number;
  red: number;
  gold: number;
  /** 抜いた花牌の枚数 */
  flower: number;
}

export interface WinResult {
  yaku: Yaku[];
  /** 役満の数。数え役満は0。 */
  yakuman: number;
  /** 役とドラの合計。役満のときは13×役満の数。 */
  han: number;
  dora: DoraCount;
}

const YAKUMAN_HAN = 13;
const DRAGONS: Record<string, YakuName> = {
  "5z": "haku",
  "6z": "hatsu",
  "7z": "chun",
};
const GREEN: ReadonlySet<TileKind> = new Set([
  "2s",
  "3s",
  "4s",
  "6s",
  "8s",
  "6z",
]);

/** 面子。暗槓は concealed、ロンで完成した刻子は concealed でない。 */
interface HandSet {
  type: "shuntsu" | "koutsu" | "kantsu";
  kind: TileKind;
  concealed: boolean;
}

type Shape =
  | { form: "kokushi" }
  | { form: "chiitoitsu" }
  | {
      form: "standard";
      pair: TileKind;
      sets: HandSet[];
      /** 和了牌が順子の両面待ちを埋めたか */
      ryanmen: boolean;
    };

interface Context {
  input: WinInput;
  melds: readonly Meld[];
  /** 副露を含む全部の牌の種類 */
  kinds: TileKind[];
  /** 暗槓以外の副露がない */
  menzen: boolean;
  isDealer: boolean;
}

const isTriplet = (set: HandSet) => set.type !== "shuntsu";
const isWind = (kind: TileKind) => isHonor(kind) && rankOf(kind) <= 4;
const isDragon = (kind: TileKind) => isHonor(kind) && rankOf(kind) >= 5;

function meldToSet(meld: Meld): HandSet {
  return {
    type: meld.type === "pon" ? "koutsu" : "kantsu",
    kind: tileOf(meld.tiles[0]!).kind,
    concealed: meld.type === "ankan",
  };
}

/** 和了形としての読み方をすべて挙げる。 */
function shapesOf(ctx: Context): Shape[] {
  const { input, melds } = ctx;
  const concealedKinds = kindsOf([...input.concealed, input.winTile]);
  const winKind = tileOf(input.winTile).kind;
  const shapes: Shape[] = [];

  if (melds.length === 0) {
    if (isKokushi(concealedKinds)) shapes.push({ form: "kokushi" });
    if (isChiitoitsu(concealedKinds)) shapes.push({ form: "chiitoitsu" });
  }

  const meldSets = melds.map(meldToSet);
  for (const { pair, groups } of decompose(concealedKinds, 4 - melds.length)) {
    const build = (ronKoutsu: number | null, ryanmen: boolean): Shape => ({
      form: "standard",
      pair,
      sets: [
        ...groups.map((group, index) => ({
          ...group,
          concealed: index !== ronKoutsu,
        })),
        ...meldSets,
      ],
      ryanmen,
    });

    // 和了牌をどこで使ったとみなすかで役が変わるので、すべて試す
    if (pair === winKind) shapes.push(build(null, false));
    groups.forEach((group, index) => {
      if (group.type === "koutsu") {
        if (group.kind !== winKind) return;
        shapes.push(build(input.tsumo ? null : index, false));
        return;
      }
      if (suitOf(group.kind) !== suitOf(winKind)) return;
      const position = rankOf(winKind) - rankOf(group.kind);
      if (position < 0 || position > 2) return;
      shapes.push(build(null, completesRyanmen(group, winKind)));
    });
  }
  return shapes;
}

function yakumanOf(shape: Shape, ctx: Context): YakuName[] {
  const { input, kinds, melds } = ctx;
  const result: YakuName[] = [];

  if (input.firstTurn && input.tsumo) {
    result.push(ctx.isDealer ? "tenhou" : "chiihou");
  }
  if (kinds.every(isHonor)) result.push("tsuuiisou");
  if (kinds.every(isTerminal)) result.push("chinroutou");
  if (kinds.every((kind) => GREEN.has(kind))) result.push("ryuuiisou");

  const suits = new Set(kinds.map(suitOf));
  if (suits.has("m") && !suits.has("p") && !suits.has("s")) {
    result.push("manzuHonitsu");
  }

  if (shape.form === "kokushi") result.push("kokushi");
  if (shape.form === "chiitoitsu" && suits.size === 1 && !suits.has("z")) {
    result.push("chinitsuChiitoitsu");
  }
  if (shape.form !== "standard") return result;

  const triplets = shape.sets.filter(isTriplet);
  if (triplets.filter((set) => set.concealed).length === 4) {
    result.push("suuankou");
  }
  if (triplets.filter((set) => isDragon(set.kind)).length === 3) {
    result.push("daisangen");
  }
  const windTriplets = triplets.filter((set) => isWind(set.kind)).length;
  if (windTriplets === 4) result.push("daisuushii");
  if (windTriplets === 3 && isWind(shape.pair)) result.push("shousuushii");
  if (shape.sets.filter((set) => set.type === "kantsu").length === 4) {
    result.push("suukantsu");
  }

  if (melds.length === 0 && suits.size === 1 && !suits.has("z")) {
    const counts = new Array<number>(10).fill(0);
    for (const kind of kinds) counts[rankOf(kind)]!++;
    const chuuren = counts.every((count, rank) => {
      if (rank === 0) return true;
      return count >= (rank === 1 || rank === 9 ? 3 : 1);
    });
    if (chuuren) result.push("chuuren");
  }
  return result;
}

function normalYakuOf(shape: Shape, ctx: Context): Yaku[] {
  const { input, kinds, menzen } = ctx;
  const result: Yaku[] = [];
  const add = (name: YakuName, han: number) => result.push({ name, han });

  if (input.riichi === "doubleRiichi") add("doubleRiichi", 2);
  else if (input.riichi === "riichi") add("riichi", 1);
  if (input.riichi && input.openRiichi) add("openRiichi", 1);
  if (input.riichi && input.ippatsu) add("ippatsu", 1);
  if (menzen && input.tsumo) add("menzenTsumo", 1);
  if (input.rinshan && input.tsumo) add("rinshan", 1);
  if (input.lastTile) add(input.tsumo ? "haitei" : "houtei", 1);

  if (!kinds.some(isYaochu)) add("tanyao", 1);

  const hasHonor = kinds.some(isHonor);
  const numberSuits = new Set(kinds.filter((k) => !isHonor(k)).map(suitOf));
  if (numberSuits.size === 1 && !numberSuits.has("m")) {
    if (hasHonor) add("honitsu", menzen ? 3 : 2);
    else add("chinitsu", menzen ? 6 : 5);
  }
  if (kinds.every(isYaochu)) add("honroutou", 2);

  if (shape.form === "kokushi") return result;
  if (shape.form === "chiitoitsu") {
    add("chiitoitsu", 2);
    return result;
  }

  const { pair, sets } = shape;
  const shuntsu = sets.filter((set) => set.type === "shuntsu");
  const triplets = sets.filter(isTriplet);

  const yakuhaiHan = (kind: TileKind): Yaku[] => {
    const list: Yaku[] = [];
    const dragon = DRAGONS[kind];
    if (dragon) list.push({ name: dragon, han: 1 });
    if (kind === input.roundWind) list.push({ name: "roundWind", han: 1 });
    if (kind === input.seatWind) list.push({ name: "seatWind", han: 1 });
    return list;
  };
  for (const set of triplets) result.push(...yakuhaiHan(set.kind));

  if (
    ctx.melds.length === 0 &&
    shuntsu.length === 4 &&
    shape.ryanmen &&
    yakuhaiHan(pair).length === 0
  ) {
    add("pinfu", 1);
  }

  if (menzen) {
    const perKind = new Map<TileKind, number>();
    for (const set of shuntsu) {
      perKind.set(set.kind, (perKind.get(set.kind) ?? 0) + 1);
    }
    let pairs = 0;
    for (const count of perKind.values()) pairs += Math.floor(count / 2);
    if (pairs === 2) add("ryanpeikou", 3);
    else if (pairs === 1) add("iipeikou", 1);
  }

  if (triplets.length === 4) add("toitoi", 2);
  if (triplets.filter((set) => set.concealed).length === 3) add("sanankou", 2);
  if (sets.filter((set) => set.type === "kantsu").length === 3) {
    add("sankantsu", 2);
  }

  for (const rank of [1, 9]) {
    const suitsWithTriplet = new Set(
      triplets
        .filter((set) => !isHonor(set.kind) && rankOf(set.kind) === rank)
        .map((set) => suitOf(set.kind)),
    );
    if (suitsWithTriplet.size === 3) add("sanshokuDoukou", 2);
  }

  if (
    triplets.filter((set) => isDragon(set.kind)).length === 2 &&
    isDragon(pair)
  ) {
    add("shousangen", 2);
  }

  // 全部の面子と雀頭に么九牌がある（順子は123か789）
  const setHasYaochu = (set: HandSet) =>
    set.type === "shuntsu"
      ? rankOf(set.kind) === 1 || rankOf(set.kind) === 7
      : isYaochu(set.kind);
  if (shuntsu.length > 0 && isYaochu(pair) && sets.every(setHasYaochu)) {
    if (hasHonor) add("chanta", menzen ? 2 : 1);
    else add("junchan", menzen ? 3 : 2);
  }

  for (const suit of ["p", "s"] as const) {
    const starts = new Set(
      shuntsu
        .filter((set) => suitOf(set.kind) === suit)
        .map((set) => rankOf(set.kind)),
    );
    if (starts.has(1) && starts.has(4) && starts.has(7)) {
      add("ittsu", menzen ? 2 : 1);
    }
  }

  return result;
}

function countDora(ctx: Context): DoraCount {
  const { input, kinds } = ctx;
  const tiles = [
    ...input.concealed,
    input.winTile,
    ...ctx.melds.flatMap((meld) => meld.tiles),
  ].map(tileOf);
  const flower = input.flowers?.length ?? 0;

  const countFor = (indicators: readonly TileId[]) => {
    let total = 0;
    for (const indicator of indicators) {
      const target = doraKind(tileOf(indicator).kind);
      // 表示牌が花牌なら、抜いた花牌がドラになる
      total +=
        suitOf(target) === "f"
          ? flower
          : kinds.filter((kind) => kind === target).length;
    }
    return total;
  };

  return {
    dora: countFor(input.doraIndicators ?? []),
    ura: countFor(input.riichi ? (input.uraIndicators ?? []) : []),
    red: tiles.filter((tile) => tile.variant === "red").length,
    gold: tiles.filter((tile) => tile.variant === "gold").length,
    flower,
  };
}

const sumHan = (yaku: readonly Yaku[]) =>
  yaku.reduce((sum, y) => sum + y.han, 0);

/**
 * 和了の役とドラを求める。和了形でない、または役がないときは null。
 * 読み方が複数ある手は、最も高くなる読み方を採る。
 */
export function evaluateWin(input: WinInput): WinResult | null {
  const melds = input.melds ?? [];
  if (input.concealed.length + 1 + melds.length * 3 !== 14) {
    throw new Error("手牌の枚数が合いません");
  }

  const ctx: Context = {
    input,
    melds,
    kinds: kindsOf([
      ...input.concealed,
      input.winTile,
      ...melds.flatMap((meld) => meld.tiles),
    ]),
    menzen: melds.every((meld) => meld.type === "ankan"),
    isDealer: input.seatWind === "1z",
  };

  let best: { yaku: Yaku[]; yakuman: number } | null = null;
  for (const shape of shapesOf(ctx)) {
    const yakumanNames = yakumanOf(shape, ctx);
    const candidate =
      yakumanNames.length > 0
        ? {
            yaku: yakumanNames.map((name) => ({ name, han: YAKUMAN_HAN })),
            yakuman: yakumanNames.length,
          }
        : { yaku: normalYakuOf(shape, ctx), yakuman: 0 };
    if (
      best === null ||
      candidate.yakuman > best.yakuman ||
      (candidate.yakuman === best.yakuman &&
        sumHan(candidate.yaku) > sumHan(best.yaku))
    ) {
      best = candidate;
    }
  }
  if (best === null || best.yaku.length === 0) return null;

  const dora = countDora(ctx);
  if (best.yakuman > 0) {
    return { ...best, han: sumHan(best.yaku), dora };
  }

  const doraTotal = dora.dora + dora.ura + dora.red + dora.gold + dora.flower;

  // リーチのみ：どう読んでもリーチ以外の役がなく、ドラも花牌もないロン
  if (
    !input.tsumo &&
    doraTotal === 0 &&
    best.yaku.length === 1 &&
    best.yaku[0]!.name === "riichi"
  ) {
    return {
      yaku: [{ name: "riichiOnly", han: YAKUMAN_HAN }],
      yakuman: 1,
      han: YAKUMAN_HAN,
      dora,
    };
  }

  return { ...best, han: sumHan(best.yaku) + doraTotal, dora };
}
