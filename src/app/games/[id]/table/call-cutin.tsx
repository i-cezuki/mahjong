import type { Seat } from "@/engine";
import { CALL_LABELS, isWinCall } from "../logic/calls";
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

/**
 * リーチ、ポン、カン、ロン、ツモの発声を、卓の上に大きく出す。
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
      {calls.map((call) => (
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
      ))}
    </>
  );
}
