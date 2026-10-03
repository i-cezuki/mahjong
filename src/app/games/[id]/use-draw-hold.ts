"use client";

import { useEffect, useState } from "react";
import type { PlayerView } from "@/server/table";
import { heldView, isDrawHeld } from "./logic/draw-hold";

/**
 * 打牌のあと、サーバーが決めた時刻まで次の人のツモを見せない。
 * 他家が鳴けるか和了できるときの応答待ちを、打牌のたびの間にまぎれさせるため。
 * @param previous ひとつ前の版の画面データ。なければ（画面を開いた直後や取りこぼしたあと）待たずに見せる
 */
export function useDrawHold(
  view: PlayerView,
  previous: PlayerView | null,
  serverTime: () => number,
): PlayerView {
  const [, setReleased] = useState<PlayerView | null>(null);
  const held = previous !== null && isDrawHeld(view, serverTime());

  useEffect(() => {
    if (!held || view.startedAt === null) return;
    const timer = setTimeout(
      () => setReleased(view),
      Math.max(0, view.startedAt - serverTime()),
    );
    return () => clearTimeout(timer);
  }, [held, view, serverTime]);

  return held ? heldView(previous, view) : view;
}
