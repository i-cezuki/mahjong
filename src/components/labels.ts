import { tileOf } from "@/engine/tiles";
import type { TileId, TileKind, TileVariant } from "@/engine/tiles";
import type { YakuName } from "@/engine/yaku";

const HONORS = ["東", "南", "西", "北", "白", "發", "中"];
const SUITS: Record<string, string> = { m: "萬", p: "筒", s: "索" };
const VARIANTS: Record<TileVariant, string> = {
  normal: "",
  red: "赤",
  gold: "金",
  pocchi: "ポッチ",
  reversePocchi: "逆ポッチ",
};

export function kindLabel(kind: TileKind): string {
  const rank = Number(kind[0]);
  const suit = kind[1]!;
  if (suit === "z") return HONORS[rank - 1]!;
  if (suit === "f") return "花";
  return `${rank}${SUITS[suit]}`;
}

/** 牌の文字表記。絵柄ができるまでの仮の表示に使う。 */
export function tileLabel(id: TileId): string {
  const tile = tileOf(id);
  if (tile.variant === "pocchi" || tile.variant === "reversePocchi") {
    return VARIANTS[tile.variant];
  }
  return `${VARIANTS[tile.variant]}${kindLabel(tile.kind)}`;
}

const WINDS = ["東", "南", "西"];

/** 親から数えた風 */
export function windLabel(seat: number, dealer: number): string {
  return WINDS[(seat - dealer + 3) % 3]!;
}

export function roundLabel(roundIndex: number, honba: number): string {
  const name =
    roundIndex < 3
      ? `東${roundIndex + 1}局`
      : roundIndex < 6
        ? `南${roundIndex - 2}局`
        : "サドンデス";
  return `${name} ${honba}本場`;
}

export const YAKU_LABELS: Record<YakuName, string> = {
  riichi: "リーチ",
  openRiichi: "オープンリーチ",
  doubleRiichi: "ダブルリーチ",
  ippatsu: "一発",
  menzenTsumo: "門前清自摸和",
  tanyao: "断么九",
  pinfu: "平和",
  iipeikou: "一盃口",
  haku: "白",
  hatsu: "發",
  chun: "中",
  seatWind: "自風",
  roundWind: "場風",
  rinshan: "嶺上開花",
  haitei: "海底摸月",
  houtei: "河底撈魚",
  chiitoitsu: "七対子",
  toitoi: "対々和",
  sanankou: "三暗刻",
  sankantsu: "三槓子",
  sanshokuDoukou: "三色同刻",
  honroutou: "混老頭",
  shousangen: "小三元",
  chanta: "混全帯么九",
  ittsu: "一気通貫",
  honitsu: "混一色",
  junchan: "純全帯么九",
  ryanpeikou: "二盃口",
  chinitsu: "清一色",
  tenhou: "天和",
  chiihou: "地和",
  kokushi: "国士無双",
  suuankou: "四暗刻",
  daisangen: "大三元",
  shousuushii: "小四喜",
  daisuushii: "大四喜",
  tsuuiisou: "字一色",
  chinroutou: "清老頭",
  ryuuiisou: "緑一色",
  chuuren: "九蓮宝燈",
  suukantsu: "四槓子",
  manzuHonitsu: "萬子混一色",
  chinitsuChiitoitsu: "清一色七対子",
  riichiOnly: "リーチのみ",
};

/** [翻の下限, 呼び名]。区切りは点数表（engine/score.ts）と同じ。 */
const LIMITS = [
  [13, "数え役満"],
  [11, "三倍満"],
  [8, "倍満"],
  [6, "跳満"],
  [4, "満貫"],
] as const;

/** 満貫以上の呼び名。満貫に届かなければ null。 */
export function limitLabel(han: number): string | null {
  return LIMITS.find(([minHan]) => han >= minHan)?.[1] ?? null;
}
