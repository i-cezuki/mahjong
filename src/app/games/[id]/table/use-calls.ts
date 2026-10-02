"use client";

import { useEffect, useState } from "react";
import type { PlayerView } from "@/server/table";
import { detectCalls, isWinCall } from "../logic/calls";
import type { Call } from "../logic/calls";

/** リーチや鳴きの発声を出しておく時間 */
const CALL_MS = 1400;
/** 和了の発声を出して、局の結果を出すのを待つ時間 */
const WIN_PAUSE_MS = 500;

interface Shown {
  /** 発声が起きた版番号。同じ発声を出し直さないために持つ */
  version: number;
  calls: Call[];
}

/**
 * 画面データが更新されるたびに、新しく起きた発声（リーチ、ポン、カン、ロン、ツモ）を返す。
 * 画面を開いた時点ですでに起きていたものは出さない。
 * @returns resultHeld が true の間は、和了の発声を見せるために局の結果を出さない。
 */
export function useCalls(
  view: PlayerView,
  version: number,
): { calls: readonly Call[]; resultHeld: boolean } {
  const [seen, setSeen] = useState({ version, view });
  const [shown, setShown] = useState<Shown | null>(null);

  // 版番号が進んだら、前の画面データと比べる（描画中に状態を合わせる）
  if (seen.version !== version) {
    setSeen({ version, view });
    const calls = detectCalls(seen.view, view);
    if (calls.length > 0) setShown({ version, calls });
  }

  const win = shown?.calls.some(isWinCall) ?? false;
  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(
      () => setShown((current) => (current === shown ? null : current)),
      win ? WIN_PAUSE_MS : CALL_MS,
    );
    return () => clearTimeout(timer);
  }, [shown, win]);

  return { calls: shown?.calls ?? [], resultHeld: win };
}
