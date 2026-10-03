"use client";

import { useEffect, useState } from "react";
import { clockDisplay } from "../logic/clock";

/** 表示を更新する間隔 */
const REFRESH_MS = 200;

/**
 * 自分が待たれているときの残り時間。
 * @param bank 手番と応答のときの自分の持ち時間。サイコロの指定と局の結果は null。
 * @param serverTime サーバーの現在時刻の見積もり
 */
export function ClockBadge({
  deadline,
  bank,
  serverTime,
}: {
  deadline: number;
  bank: number | null;
  serverTime: () => number;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(serverTime()), REFRESH_MS);
    return () => clearInterval(timer);
  }, [serverTime]);
  if (now === null) return null;

  const { seconds, reserve } = clockDisplay(deadline - now, bank);
  return (
    <span
      aria-label={reserve ? "長考の残り時間" : "残り時間"}
      className={`flex items-baseline gap-1 rounded border px-2 py-0.5 font-mono text-lg tabular-nums ${
        reserve
          ? "border-amber-300/80 bg-amber-950/60 text-amber-200"
          : "border-foreground/40"
      }`}
    >
      {reserve && <span className="font-sans text-xs font-bold">長考</span>}
      {seconds}
    </span>
  );
}
