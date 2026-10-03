"use client";

import { useEffect, useState } from "react";
import type { Seat } from "@/engine";
import type { PlayerView } from "@/server/table";
import {
  detectCalls,
  detectTedashi,
  isJackpotCall,
  isWinCall,
} from "../logic/calls";
import type { Call } from "../logic/calls";

/** リーチや鳴きの発声を出しておく時間 */
const CALL_MS = 1400;
/** 和了の発声を出して、局の結果を出すのを待つ時間 */
const WIN_PAUSE_MS = 1000;
/** ポッチと一発ツモの特別な発声を出して、局の結果を出すのを待つ時間 */
const JACKPOT_PAUSE_MS = 2600;
/** 「手出し」の吹き出しを出しておく時間 */
const TEDASHI_MS = 1000;

const NONE: readonly never[] = [];

/**
 * 画面データが更新されるたびに、前の画面データと比べて見つかった出来事を、しばらくの間だけ返す。
 * 画面を開いた時点ですでに起きていたものは出さない。
 * @param detect 前後の画面データから出来事を出す関数
 * @param duration 出しておく時間（ms）を決める関数
 */
function useTransient<T>(
  view: PlayerView,
  version: number,
  detect: (before: PlayerView, after: PlayerView) => T[],
  duration: (items: readonly T[]) => number,
): readonly T[] {
  const [seen, setSeen] = useState({ version, view });
  const [shown, setShown] = useState<{ items: T[] } | null>(null);

  // 版番号が進んだら、前の画面データと比べる（描画中に状態を合わせる）
  if (seen.version !== version) {
    setSeen({ version, view });
    const items = detect(seen.view, view);
    if (items.length > 0) setShown({ items });
  }

  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(
      () => setShown((current) => (current === shown ? null : current)),
      duration(shown.items),
    );
    return () => clearTimeout(timer);
  }, [shown, duration]);

  return shown?.items ?? NONE;
}

const callDuration = (calls: readonly Call[]) =>
  calls.some(isJackpotCall)
    ? JACKPOT_PAUSE_MS
    : calls.some(isWinCall)
      ? WIN_PAUSE_MS
      : CALL_MS;
const tedashiDuration = () => TEDASHI_MS;

/**
 * 新しく起きた発声（リーチ、ポン、カン、ロン、ツモ）を返す。
 * @returns resultHeld が true の間は、和了の発声を見せるために局の結果を出さない。
 */
export function useCalls(
  view: PlayerView,
  version: number,
): { calls: readonly Call[]; resultHeld: boolean } {
  const calls = useTransient(view, version, detectCalls, callDuration);
  return { calls, resultHeld: calls.some(isWinCall) };
}

/** いま手出しで切った相手の席を返す。ツモ切りと自分の打牌では空。 */
export function useTedashi(view: PlayerView, version: number): readonly Seat[] {
  return useTransient(view, version, detectTedashi, tedashiDuration);
}
