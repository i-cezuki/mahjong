"use client";

import { useEffect, useState } from "react";
import type { PlayerView } from "@/server/table";
import { flowerStage } from "../logic/flowers";
import type { FlowerStage } from "../logic/flowers";

/** 引いた花牌を手牌に見せておく時間 */
const FLOWER_MS = 500;

/** 自分が抜いた花牌を、1枚ずつ「引く→少し待つ→花に移して補充」の順に見せる。 */
export function useFlowerReveal(view: PlayerView): FlowerStage {
  const flowers = view.flowers[view.seat];
  const [shown, setShown] = useState(() => {
    // 局の最初の手番なら、配牌に入っていた花牌を抜くところも見せる。
    // それ以外（対局の途中で画面を開いた）は、抜き終わった状態から始める
    const firstTurn =
      view.turn === view.seat &&
      view.drawn !== null &&
      view.rivers[view.seat].length === 0 &&
      view.melds[view.seat].length === 0;
    return firstTurn ? 0 : flowers.length;
  });

  useEffect(() => {
    if (shown >= flowers.length) return;
    const timer = setTimeout(() => setShown((n) => n + 1), FLOWER_MS);
    return () => clearTimeout(timer);
  }, [shown, flowers.length]);

  return flowerStage(view.hand, view.drawn, flowers, shown);
}
