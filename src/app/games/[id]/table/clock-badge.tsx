"use client";

import { useEffect, useState } from "react";
import { clockLabel } from "../logic/clock";

/** 表示を更新する間隔 */
const REFRESH_MS = 200;

/**
 * 自分が待たれているときの残り時間。
 * @param bank 手番のときの自分の持ち時間。手番以外（応答、サイコロ、局の結果）は null。
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

  const label = clockLabel(deadline - now, bank);
  return (
    <span
      aria-label="残り時間"
      className={`rounded border px-2 py-0.5 font-mono text-lg tabular-nums ${
        label.startsWith("+")
          ? "border-amber-300/70 text-amber-200"
          : "border-foreground/40"
      }`}
    >
      {label}
    </span>
  );
}
