import Link from "next/link";
import type { GameResult as Result } from "@/engine";
import { signed } from "./round-result";

/** 終局。順位、最終の持ち点、スコア、祝儀。 */
export function GameResult({
  result,
  names,
  roomCode,
  replayHref = null,
}: {
  result: Result;
  names: string[];
  roomCode: string | null;
  /** 牌譜の再生画面。牌譜の中で出すときは null */
  replayHref?: string | null;
}) {
  return (
    <section className="flex flex-col gap-2 border-t border-cyan-400/40 pt-3">
      <h3 className="text-lg font-bold">終局</h3>
      <table className="w-fit text-base">
        <thead>
          <tr className="text-left text-sm opacity-70">
            <th className="pr-6 font-normal">順位</th>
            <th className="pr-6 font-normal">名前</th>
            <th className="pr-6 text-right font-normal">持ち点</th>
            <th className="pr-6 text-right font-normal">スコア</th>
            <th className="text-right font-normal">祝儀</th>
          </tr>
        </thead>
        <tbody>
          {result.ranking.map((seat, i) => (
            <tr key={seat} className={i === 0 ? "text-amber-200" : ""}>
              <td className="pr-6">{i + 1}位</td>
              <td className="pr-6 font-semibold">{names[seat]}</td>
              <td className="pr-6 text-right font-mono">
                {result.points[seat].toLocaleString()}
              </td>
              <td className="pr-6 text-right font-mono">
                {signed(result.payout[seat])}
              </td>
              <td className="text-right font-mono">
                {signed(result.chips[seat])}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {replayHref && (
        <Link href={replayHref} className="w-fit text-sm underline opacity-80">
          牌譜を見る
        </Link>
      )}
      {roomCode && (
        <Link
          href={`/rooms/${roomCode}`}
          className="w-fit rounded border border-cyan-300 bg-cyan-400/25 px-6 py-2 text-base font-semibold hover:bg-cyan-400/40"
        >
          ルームへ戻る（再戦はこちら）
        </Link>
      )}
    </section>
  );
}
