import { SEATS } from "@/engine";
import type { PlayerView } from "@/server/table";
import { detectCalls } from "./calls";
import type { CallKind } from "./calls";

/** 卓で鳴らす音。public/sounds/<名前>.wav */
export type SoundName = "discard" | "riichi" | "pon" | "kan" | "ron" | "tsumo";

export const SOUND_NAMES: readonly SoundName[] = [
  "discard",
  "riichi",
  "pon",
  "kan",
  "ron",
  "tsumo",
];

const SOUND_OF_CALL: Record<CallKind, SoundName> = {
  riichi: "riichi",
  doubleStakeRiichi: "riichi",
  openRiichi: "riichi",
  pon: "pon",
  kan: "kan",
  ron: "ron",
  tsumo: "tsumo",
  ippatsuTsumo: "tsumo",
  pocchi: "tsumo",
};

/** 同時に起きたときに鳴らす1つ。宣言牌でのロンはロン、リーチの宣言は打牌の音の代わり */
const PRIORITY: readonly SoundName[] = [
  "ron",
  "tsumo",
  "kan",
  "pon",
  "riichi",
  "discard",
];

/**
 * 前の画面データと比べて、鳴らす音を1つ選ぶ。なければ null。
 * 発声があればその音、なければ誰かの河が増えたときに打牌の音。局が変わったときは鳴らさない。
 */
export function detectSound(
  before: PlayerView,
  after: PlayerView,
): SoundName | null {
  if (before.roundIndex !== after.roundIndex || before.honba !== after.honba) {
    return null;
  }
  const sounds = new Set(
    detectCalls(before, after).map((call) => SOUND_OF_CALL[call.kind]),
  );
  if (
    SEATS.some(
      (seat) => after.rivers[seat].length > before.rivers[seat].length,
    )
  ) {
    sounds.add("discard");
  }
  return PRIORITY.find((sound) => sounds.has(sound)) ?? null;
}
