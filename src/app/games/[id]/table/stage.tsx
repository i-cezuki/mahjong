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

function fitScale() {
  return Math.min(
    window.innerWidth / STAGE_WIDTH,
    window.innerHeight / STAGE_HEIGHT,
  );
}

/**
 * 卓を画面いっぱいに拡大縮小して中央に置く。スマホでもPCでも同じ配置になる。
 * スマホの縦画面では卓を隠し、横にするよう促す。
 */
export function Stage({ children }: { children: ReactNode }) {
  const scale = useSyncExternalStore(subscribe, fitScale, () => 1);
  // touch-manipulation：2回タップの打牌で、ブラウザの拡大が働かないようにする
  return (
    <main className="fixed inset-0 touch-manipulation overflow-hidden bg-background select-none">
      <div
        className="absolute top-1/2 left-1/2 max-[700px]:portrait:hidden"
        style={{
          width: STAGE_WIDTH,
          height: STAGE_HEIGHT,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        {children}
      </div>
      <p className="hidden h-full items-center justify-center text-lg max-[700px]:portrait:flex">
        画面を横にしてください
      </p>
    </main>
  );
}
