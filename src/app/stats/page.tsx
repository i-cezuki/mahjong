import Link from "next/link";
import { Screen, subtleButtonClass } from "@/components/screen";
import { requireApproved } from "@/server/auth";
import { loadStandings } from "@/server/stats";
import { METRICS, formatMetric } from "@/stats/metrics";

const MAIN = METRICS.filter((metric) => metric.main);

/** 全員の通算成績を並べる。主な項目だけを出し、名前から個人の成績へ進む。 */
export default async function StatsPage() {
  const viewer = await requireApproved();
  const standings = await loadStandings();

  return (
    <Screen title="成績" wide>
      {standings.length === 0 ? (
        <p className="text-sm opacity-80">終わった対局はまだありません。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-sm whitespace-nowrap">
            <thead>
              <tr className="text-xs opacity-70">
                <th className="sticky left-0 bg-background pr-4 text-left font-normal">
                  名前
                </th>
                {MAIN.map((metric) => (
                  <th key={metric.key} className="px-2 text-right font-normal">
                    {metric.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {standings.map((row) => (
                <tr
                  key={row.playerId}
                  className={row.playerId === viewer.id ? "font-semibold" : ""}
                >
                  <td className="sticky left-0 max-w-[8rem] truncate bg-background pr-4">
                    <Link
                      href={`/stats/${row.playerId}`}
                      className="underline underline-offset-2"
                    >
                      {row.name}
                    </Link>
                  </td>
                  {MAIN.map((metric) => (
                    <td
                      key={metric.key}
                      className="px-2 text-right tabular-nums"
                    >
                      {formatMetric(metric.format, metric.value(row.totals))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs opacity-60">
        名前を押すと、その人の全部の項目が見られます。良形は、リーチの待ちに両面が含まれる形です。
      </p>
      <div className="flex gap-4">
        <Link href="/history" className={subtleButtonClass}>
          対局履歴
        </Link>
        <Link href="/" className={subtleButtonClass}>
          ホームへ戻る
        </Link>
      </div>
    </Screen>
  );
}
