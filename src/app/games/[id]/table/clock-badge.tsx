"use client";

import { useEffect, useState } from "react";
import { clockDisplay } from "../logic/clock";

/** 表示を更新する間隔 */
const REFRESH_MS = 200;

const STAGES = {
  base: { label: null, ariaLabel: "残り時間", style: "border-foreground/40" },
  think: {
    label: "+30",
    ariaLabel: "長考ボタンの残り時間",
    style: "border-sky-300/80 bg-sky-950/60 text-sky-200",
  },
  reserve: {
    label: "長考",
    ariaLabel: "長考の残り時間",
    style: "border-amber-300/80 bg-amber-950/60 text-amber-200",
  },
} as const;

/**
 * 自分が待たれているときの残り時間。
 * @param bank 手番と応答のときの自分の持ち時間。サイコロの指定と局の結果は null。
 * @param thinking 長考ボタンを押した判断
 * @param serverTime サーバーの現在時刻の見積もり
 */
export function ClockBadge({
  deadline,
  bank,
  thinking,
  serverTime,
}: {
  deadline: number;
  bank: number | null;
  thinking: boolean;
  serverTime: () => number;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(serverTime()), REFRESH_MS);
    return () => clearInterval(timer);
  }, [serverTime]);
  if (now === null) return null;

  const { seconds, stage } = clockDisplay(deadline - now, bank, thinking);
  const { label, ariaLabel, style } = STAGES[stage];
  return (
    <span
      aria-label={ariaLabel}
      className={`flex items-baseline gap-1 rounded border px-2 py-0.5 font-mono text-lg tabular-nums ${style}`}
    >
      {label && <span className="font-sans text-xs font-bold">{label}</span>}
      {seconds}
    </span>
  );
}
