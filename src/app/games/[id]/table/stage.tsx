"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

/** 卓のレイアウトの大きさ。部品の位置はすべてこの中のpxで決める。 */
export const STAGE_WIDTH = 1040;
export const STAGE_HEIGHT = 480;

/**
 * 画面の大きさや見え方が変わったら知らせる。
 * iPhoneは別のアプリから戻ったときやバーが伸び縮みしたときに、文書が少しずれたまま残り、
 * 牌の見た目とタッチの当たる位置が食い違うことがある。そのたびに先頭へ戻して測り直す。
 */
function subscribe(onChange: () => void) {
  const resync = () => {
    if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
    onChange();
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") resync();
  };
  const viewport = window.visualViewport;
  window.addEventListener("resize", resync);
  window.addEventListener("pageshow", resync);
  document.addEventListener("visibilitychange", onVisibility);
  viewport?.addEventListener("resize", resync);
  viewport?.addEventListener("scroll", resync);
  return () => {
    window.removeEventListener("resize", resync);
    window.removeEventListener("pageshow", resync);
    document.removeEventListener("visibilitychange", onVisibility);
    viewport?.removeEventListener("resize", resync);
    viewport?.removeEventListener("scroll", resync);
  };
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

/** 卓を出している間は文書をスクロールさせない。ずれの元になる */
function useLockScroll() {
  useEffect(() => {
    const restores = [document.documentElement, document.body].map(
      ({ style }) => {
        const { overflow, overscrollBehavior } = style;
        style.overflow = "hidden";
        style.overscrollBehavior = "none";
        return () => {
          style.overflow = overflow;
          style.overscrollBehavior = overscrollBehavior;
        };
      },
    );
    return () => restores.forEach((restore) => restore());
  }, []);
}

/**
 * 卓を画面いっぱいに拡大縮小して中央に置く。スマホでもPCでも同じ配置になる。
 * スマホを縦に持ったときは卓を90度回して、横画面のまま見せる（横固定）。
 */
export function Stage({ children }: { children: ReactNode }) {
  const scale = useSyncExternalStore(subscribe, fitScale, () => 1);
  const turned = useSyncExternalStore(subscribe, isTurned, () => false);
  useLockScroll();
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
      <TouchDebug />
    </main>
  );
}

const noSubscribe = () => () => {};

/** 一時的な計測用。URLに ?touchdebug を付けると、指の位置と当たった牌、画面の状態を出す */
function TouchDebug() {
  const enabled = useSyncExternalStore(
    noSubscribe,
    () => new URLSearchParams(window.location.search).has("touchdebug"),
    () => false,
  );
  const [touch, setTouch] = useState<{ x: number; y: number; info: string }>();
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    if (!enabled) return;
    const note = (event: string) =>
      setLog((lines) => [`${event} ${viewportState()}`, ...lines].slice(0, 6));
    const onDown = (event: PointerEvent) => {
      const hit = document.elementFromPoint(event.clientX, event.clientY);
      const tile = hit?.closest("[data-tile]")?.getAttribute("data-tile");
      setTouch({
        x: event.clientX,
        y: event.clientY,
        info: `(${Math.round(event.clientX)},${Math.round(event.clientY)}) tile=${tile ?? "-"} ${viewportState()}`,
      });
    };
    const onVisibility = () => note(`vis:${document.visibilityState}`);
    const onResize = () => note("resize");
    const onPageShow = () => note("pageshow");
    window.addEventListener("pointerdown", onDown, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", onResize);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <>
      {touch && (
        <span
          className="pointer-events-none fixed z-50 size-3 -translate-1/2 rounded-full bg-red-500"
          style={{ left: touch.x, top: touch.y }}
        />
      )}
      <pre className="pointer-events-none fixed top-0 left-0 z-50 bg-black/70 p-1 text-[10px] leading-tight text-lime-300">
        {[touch?.info ?? "tap somewhere", ...log].join("\n")}
      </pre>
    </>
  );
}

function viewportState() {
  const viewport = window.visualViewport;
  return [
    `inner=${window.innerWidth}x${window.innerHeight}`,
    `scroll=${window.scrollX},${window.scrollY}`,
    viewport &&
      `vv=${Math.round(viewport.width)}x${Math.round(viewport.height)}@${Math.round(viewport.offsetLeft)},${Math.round(viewport.offsetTop)} s${viewport.scale.toFixed(2)}`,
  ]
    .filter(Boolean)
    .join(" ");
}
