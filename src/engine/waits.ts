import { completesRyanmen, decompose, waitingKinds } from "./agari";
import type { Meld } from "./agari";
import { isFlower, kindsOf } from "./tiles";
import type { TileId } from "./tiles";

/**
 * 待ちが良形か。待ち牌のうち1種類でも、和了形のどれかの読み方で順子の両面を埋める牌があれば良形。
 * カンチャン、ペンチャン、単騎、ノベタン、シャンポン、七対子、国士無双は愚形。聴牌していなければ false。
 * 役の平和と同じ両面の判定を使う。場に見えている枚数は考えない。
 */
export function isGoodWait(
  concealed: readonly TileId[],
  melds: readonly Meld[],
): boolean {
  const hand = concealed.filter((id) => !isFlower(id));
  const kinds = kindsOf(hand);
  const groupCount = 4 - melds.length;
  return waitingKinds(hand, melds).some((wait) =>
    decompose([...kinds, wait], groupCount).some(({ groups }) =>
      groups.some((group) => completesRyanmen(group, wait)),
    ),
  );
}
