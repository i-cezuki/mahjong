import type { Seat } from "@/engine";
import type { SeatLayout } from "../logic/seats";

/**
 * 相手が手牌から切ったことを知らせる吹き出し。その人の河の下に出す。
 * ツモ切りのときは出さないので、出なければツモ切りと読める。タップは下の部品に通す。
 */
export function TedashiBubble({
  seats,
  layout,
}: {
  seats: readonly Seat[];
  layout: SeatLayout;
}) {
  return (
    <>
      {seats.map((seat) => (
        <div
          key={seat}
          role="status"
          className={`tedashi-pop pointer-events-none absolute top-[216px] z-40 rounded-full border border-amber-200 bg-amber-400 px-3 py-0.5 text-sm font-bold text-black shadow shadow-black/60 ${
            seat === layout.left ? "left-[296px]" : "left-[668px]"
          }`}
        >
          手出し
        </div>
      ))}
    </>
  );
}
