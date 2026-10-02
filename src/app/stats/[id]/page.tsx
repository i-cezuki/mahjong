import Link from "next/link";
import { notFound } from "next/navigation";
import { Screen, subtleButtonClass } from "@/components/screen";
import { requireApproved } from "@/server/auth";
import { isUuid } from "@/server/room-rules";
import { loadStandings } from "@/server/stats";
import { METRICS, METRIC_GROUPS, formatMetric } from "@/stats/metrics";

/** 1人分の全部の項目を、分類ごとに出す。 */
export default async function PlayerStatsPage({
  params,
}: PageProps<"/stats/[id]">) {
  await requireApproved();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const standing = (await loadStandings()).find((row) => row.playerId === id);
  if (!standing) notFound();

  return (
    <Screen title={`${standing.name} の成績`} wide>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {METRIC_GROUPS.map((group) => (
          <section key={group} className="flex flex-col gap-2">
            <h2 className="border-b border-foreground/20 pb-1 text-sm font-semibold">
              {group}
            </h2>
            <dl className="flex flex-col gap-1 text-sm">
              {METRICS.filter((metric) => metric.group === group).map(
                (metric) => (
                  <div key={metric.key} className="flex justify-between gap-4">
                    <dt className="opacity-80">{metric.label}</dt>
                    <dd className="tabular-nums">
                      {formatMetric(
                        metric.format,
                        metric.value(standing.totals),
                      )}
                    </dd>
                  </div>
                ),
              )}
            </dl>
          </section>
        ))}
      </div>
      <div className="flex gap-4">
        <Link href="/stats" className={subtleButtonClass}>
          全員の成績
        </Link>
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
