"use client";

import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";

/** 卓のレイアウトの大きさ。部品の位置はすべてこの中のpxで決める。 */
export const STAGE_WIDTH = 1040;
export const STAGE_HEIGHT = 480;

function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

/** スマホを縦に持っている */
const PHONE_PORTRAIT = "(max-width: 700px) and (orientation: portrait)";

function isTurned() {
  return window.matchMedia(PHONE_PORTRAIT).matches;
}

function fitScale() {
  const [width, height] = isTurned()
    ? [window.innerHeight, window.innerWidth]
    : [window.innerWidth, window.innerHeight];
  return Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT);
}

/**
 * 卓を画面いっぱいに拡大縮小して中央に置く。スマホでもPCでも同じ配置になる。
 * スマホを縦に持ったときは卓を90度回して、横画面のまま見せる（横固定）。
 */
export function Stage({ children }: { children: ReactNode }) {
  const scale = useSyncExternalStore(subscribe, fitScale, () => 1);
  const turned = useSyncExternalStore(subscribe, isTurned, () => false);
  // touch-manipulation：2回タップの打牌で、ブラウザの拡大が働かないようにする
  return (
    <main className="fixed inset-0 touch-manipulation overflow-hidden bg-background select-none">
      <div
        className="absolute top-1/2 left-1/2"
        style={{
          width: STAGE_WIDTH,
          height: STAGE_HEIGHT,
          transform: `translate(-50%, -50%) rotate(${turned ? 90 : 0}deg) scale(${scale})`,
        }}
      >
        {children}
      </div>
    </main>
  );
}
