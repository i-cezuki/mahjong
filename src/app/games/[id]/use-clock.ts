"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Seat } from "@/engine";
import { estimateOffset, tickDelayMs } from "./logic/clock";
import type { Snapshot } from "./use-game-view";

/** 申告が通らなかった（通信の失敗、時計のずれ、画面が裏にある）ときに、もう一度送るまでの間 */
const TICK_RETRY_MS = 2000;

/**
 * サーバーの現在時刻を見積もる関数を返す。残り時間はブラウザの時計ではなく、これで計算する。
 * @param renderedAt サーバーがこのページを描いた時刻。最初の見積もりに使う。
 */
export function useServerTime(
  snapshot: Snapshot,
  renderedAt: number,
): () => number {
  const offset = useRef<number | null>(null);
  useEffect(() => {
    offset.current = estimateOffset(offset.current, Date.now(), renderedAt);
  }, [renderedAt]);
  const { version, view } = snapshot;
  useEffect(() => {
    offset.current = estimateOffset(offset.current, Date.now(), view.serverNow);
  }, [version, view.serverNow]);
  return useCallback(() => Date.now() - (offset.current ?? 0), []);
}

/**
 * 期限を過ぎたら時間切れを申告する。画面データが進むまで、間を置いて送り直す。
 * サーバーが自分の時計で期限を確かめるので、早すぎる申告は拒否されるだけで害はない。
 */
export function useTick(params: {
  deadline: number | null;
  version: number;
  seat: Seat;
  serverTime: () => number;
  tick: () => Promise<void>;
}) {
  const { deadline, version, seat, serverTime, tick } = params;
  useEffect(() => {
    if (deadline === null) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const fire = async () => {
      // 裏に回っている間は送らない。表にいる誰かが送る
      if (document.visibilityState === "visible") await tick();
      if (!stopped) timer = setTimeout(fire, TICK_RETRY_MS);
    };
    timer = setTimeout(
      fire,
      Math.max(0, deadline - serverTime()) + tickDelayMs(seat),
    );
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [deadline, version, seat, serverTime, tick]);
}
