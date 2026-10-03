import { useEffect } from "react";
import type { CSSProperties } from "react";
import type { Seat } from "@/engine";
import { CALL_LABELS, isJackpotCall, isWinCall } from "../logic/calls";
import type { Call } from "../logic/calls";
import type { SeatLayout } from "../logic/seats";

/** 発声した人の席の側から出す。自分は下、上家は左、下家は右。 */
function placement(layout: SeatLayout, seat: Seat): string {
  if (seat === layout.left) return "top-[150px] left-[60px] cutin-from-left";
  if (seat === layout.right) {
    return "top-[150px] right-[60px] cutin-from-right";
  }
  return "bottom-[150px] left-1/2 cutin-from-bottom";
}

/** 特別な発声で、真ん中から飛び散る光の粒の数 */
const SPARKS = 28;

/**
 * ポッチと一発ツモの発声。画面を光らせ、金色の光線を回し、文字を叩きつけて光の粒を散らす。
 * 和了した本人の端末は震わせる（対応している端末だけ）。
 */
function JackpotCutin({
  call,
  name,
  mine,
}: {
  call: Call;
  name: string | undefined;
  mine: boolean;
}) {
  useEffect(() => {
    if (mine) navigator.vibrate?.([90, 50, 90, 50, 260]);
  }, [mine]);

  return (
    <div
      role="status"
      className="pointer-events-none absolute inset-0 z-40 overflow-hidden"
    >
      <div className="jackpot-dim absolute inset-0 bg-black/70" />
      <div className="absolute top-1/2 left-1/2 size-[1500px] -translate-x-1/2 -translate-y-1/2">
        <div className="jackpot-rays size-full rounded-full" />
      </div>
      <div className="jackpot-flash absolute inset-0 bg-white" />
      {Array.from({ length: SPARKS }, (_, i) => {
        // 角度は均等に、飛ぶ距離と大きさは粒ごとに少しずつ変える
        const angle = (i / SPARKS) * Math.PI * 2;
        const distance = 260 + ((i * 97) % 220);
        return (
          <span
            key={i}
            className="jackpot-spark absolute top-1/2 left-1/2 rounded-full bg-yellow-200"
            style={
              {
                width: 6 + (i % 4) * 3,
                height: 6 + (i % 4) * 3,
                animationDelay: `${120 + (i % 5) * 40}ms`,
                "--dx": `${Math.cos(angle) * distance}px`,
                "--dy": `${Math.sin(angle) * distance}px`,
              } as CSSProperties
            }
          />
        );
      })}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="jackpot-slam flex flex-col items-center">
          <span className="max-w-[480px] truncate text-xl font-bold text-yellow-100 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
            {name}
          </span>
          <span className="jackpot-text text-[120px] leading-none font-black tracking-widest">
            {CALL_LABELS[call.kind]}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * リーチ、ポン、カン、ロン、ツモの発声を、卓の上に大きく出す。
 * ポッチと一発ツモは画面いっぱいに派手に出す。
 * 操作の邪魔をしないよう、タップは下の部品に通す。
 */
export function CallCutin({
  calls,
  layout,
  names,
}: {
  calls: readonly Call[];
  layout: SeatLayout;
  names: string[];
}) {
  return (
    <>
      {calls.map((call) =>
        isJackpotCall(call) ? (
          <JackpotCutin
            key={`${call.seat}-${call.kind}`}
            call={call}
            name={names[call.seat]}
            mine={call.seat === layout.self}
          />
        ) : (
          <div
            key={`${call.seat}-${call.kind}`}
            role="status"
            className={`pointer-events-none absolute z-30 flex min-w-[260px] -skew-x-12 flex-col items-center border-y-2 px-10 py-2 shadow-lg shadow-black/60 ${placement(
              layout,
              call.seat,
            )} ${
              isWinCall(call)
                ? "border-rose-300 bg-rose-700/90"
                : "border-cyan-300 bg-[#0a2a55]/95"
            }`}
          >
            <span className="max-w-[240px] skew-x-12 truncate text-xs opacity-80">
              {names[call.seat]}
            </span>
            <span className="skew-x-12 text-5xl leading-tight font-black tracking-widest">
              {CALL_LABELS[call.kind]}
            </span>
          </div>
        ),
      )}
    </>
  );
}
