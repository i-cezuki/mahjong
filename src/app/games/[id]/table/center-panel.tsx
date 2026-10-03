"use client";

import { useEffect, useState } from "react";
import { roundLabel, windLabel } from "@/components/labels";
import { Tile } from "@/components/tile";
import type { Seat } from "@/engine";
import type { PlayerView } from "@/server/table";
import { pointDiffs } from "../logic/points";
import type { SeatLayout } from "../logic/seats";
import { doraTiles } from "../logic/wall";

/** タップしてから点差を出しておく時間 */
const DIFF_MS = 2000;

const signed = (n: number) =>
  n > 0 ? `+${n.toLocaleString()}` : n.toLocaleString();

/**
 * 風と持ち点。手番の人は明るくする。リーチ中はリーチ棒を出す。
 * @param diff 持ち点の代わりに出す、自分との点差。出さないときは null。
 */
function Score({
  view,
  seat,
  diff,
}: {
  view: PlayerView;
  seat: Seat;
  diff: number | null;
}) {
  const active = view.turn === seat && view.roundPhase !== "ended";
  const riichi = view.riichi[seat];
  const tone =
    diff !== null
      ? // 相手が上なら赤、下なら水色
        diff > 0
        ? "font-bold text-rose-300"
        : diff < 0
          ? "font-bold text-cyan-300"
          : "font-bold"
      : active
        ? "font-bold text-cyan-300 [text-shadow:0_0_8px_#22d3ee]"
        : "opacity-80";
  return (
    <span className="flex flex-col items-center leading-none">
      <span
        className={`flex items-baseline gap-1 font-mono text-[15px] ${tone}`}
      >
        <span className="font-sans text-[13px]">
          {windLabel(seat, view.dealer)}
        </span>
        {diff !== null ? signed(diff) : view.points[seat].toLocaleString()}
      </span>
      {/* リーチ棒。2倍リーチは金色、オープンリーチは桃色 */}
      <span
        className={`mt-1 h-1 w-12 rounded-full ${
          riichi
            ? riichi.doubleStake
              ? "bg-amber-400"
              : riichi.open
                ? "bg-pink-400"
                : "bg-white"
            : "bg-transparent"
        }`}
      />
    </span>
  );
}

/**
 * 卓の中央。局、本場、供託、ドラ（表示牌の次の牌）、3人の風と持ち点。
 * タップすると、しばらくの間、相手2人の持ち点を自分との点差に変える。
 */
export function CenterPanel({
  view,
  layout,
}: {
  view: PlayerView;
  layout: SeatLayout;
}) {
  const [showDiff, setShowDiff] = useState(false);
  useEffect(() => {
    if (!showDiff) return;
    const timer = setTimeout(() => setShowDiff(false), DIFF_MS);
    return () => clearTimeout(timer);
  }, [showDiff]);
  const diffs = pointDiffs(view.points, view.seat);
  const diffOf = (seat: Seat) => (showDiff ? diffs[seat] : null);

  return (
    <button
      type="button"
      onClick={() => setShowDiff(true)}
      className="flex h-full w-full flex-col items-center justify-between rounded border border-cyan-400/60 bg-cyan-950/30 px-1.5 py-1.5"
    >
      <span className="flex w-full items-baseline justify-between text-[13px]">
        <span className="font-semibold">
          {roundLabel(view.roundIndex, view.honba)}
        </span>
        <span className="opacity-80">
          {showDiff ? "点差" : `供託 ${view.kyotaku.toLocaleString()}`}
        </span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="text-[11px] opacity-70">ドラ</span>
        <span className="flex">
          {/* 表示牌そのものは山に出している。ここには実際のドラを出す */}
          {doraTiles(view.doraIndicators).map((tile, i) => (
            <Tile key={i} id={tile} width={24} />
          ))}
        </span>
      </span>
      <span className="flex w-full justify-between">
        <Score view={view} seat={layout.left} diff={diffOf(layout.left)} />
        <Score view={view} seat={layout.right} diff={diffOf(layout.right)} />
      </span>
      {/* 自分の持ち点は、点差を出している間もそのまま出す */}
      <Score view={view} seat={layout.self} diff={null} />
    </button>
  );
}
