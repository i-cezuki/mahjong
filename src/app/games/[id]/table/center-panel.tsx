import { roundLabel, windLabel } from "@/components/labels";
import { Tile } from "@/components/tile";
import type { Seat } from "@/engine";
import type { PlayerView } from "@/server/table";
import type { SeatLayout } from "../logic/seats";

/** 風と持ち点。手番の人は明るくする。リーチ中はリーチ棒を出す。 */
function Score({ view, seat }: { view: PlayerView; seat: Seat }) {
  const active = view.turn === seat && view.roundPhase !== "ended";
  const riichi = view.riichi[seat];
  return (
    <div className="flex flex-col items-center leading-none">
      <span
        className={`flex items-baseline gap-1 font-mono text-[15px] ${
          active
            ? "font-bold text-cyan-300 [text-shadow:0_0_8px_#22d3ee]"
            : "opacity-80"
        }`}
      >
        <span className="font-sans text-[13px]">
          {windLabel(seat, view.dealer)}
        </span>
        {view.points[seat].toLocaleString()}
      </span>
      {/* リーチ棒。2倍リーチは金色 */}
      <span
        className={`mt-1 h-1 w-12 rounded-full ${
          riichi
            ? riichi.doubleStake
              ? "bg-amber-400"
              : "bg-white"
            : "bg-transparent"
        }`}
      />
    </div>
  );
}

/** 卓の中央。局、本場、供託、ドラ表示牌、3人の風と持ち点。 */
export function CenterPanel({
  view,
  layout,
}: {
  view: PlayerView;
  layout: SeatLayout;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-between rounded border border-cyan-400/60 bg-cyan-950/30 px-1.5 py-1.5">
      <div className="flex w-full items-baseline justify-between text-[13px]">
        <span className="font-semibold">
          {roundLabel(view.roundIndex, view.honba)}
        </span>
        <span className="opacity-80">供託 {view.kyotaku.toLocaleString()}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] opacity-70">ドラ</span>
        <span className="flex">
          {view.doraIndicators.map((tile) => (
            <Tile key={tile} id={tile} width={24} />
          ))}
        </span>
      </div>
      <div className="flex w-full justify-between">
        <Score view={view} seat={layout.left} />
        <Score view={view} seat={layout.right} />
      </div>
      <Score view={view} seat={layout.self} />
    </div>
  );
}
