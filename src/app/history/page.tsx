import Link from "next/link";
import { Screen, subtleButtonClass } from "@/components/screen";
import { formatJst } from "@/lib/datetime";
import { requireApproved } from "@/server/auth";
import { loadHistory } from "@/server/stats";
import { formatMetric } from "@/stats/metrics";

/** 1回に出す件数と、「もっと見る」で増やせる上限 */
const PAGE_SIZE = 50;
const MAX_GAMES = 300;

export default async function HistoryPage({
  searchParams,
}: PageProps<"/history">) {
  await requireApproved();
  const requested = Number((await searchParams).n);
  const limit =
    Number.isInteger(requested) && requested > 0
      ? Math.min(requested, MAX_GAMES)
      : PAGE_SIZE;
  const { games, hasMore } = await loadHistory(limit);

  return (
    <Screen title="対局履歴" wide>
      {games.length === 0 && (
        <p className="text-sm opacity-80">終わった対局はまだありません。</p>
      )}
      <ul className="flex flex-col gap-4">
        {games.map((game) => (
          <li
            key={game.gameId}
            className="rounded border border-foreground/20 p-3"
          >
            <p className="mb-2 text-xs opacity-70">
              {formatJst(game.finishedAt)}
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs opacity-70">
                  <th className="w-10 font-normal">順位</th>
                  <th className="font-normal">名前</th>
                  <th className="text-right font-normal">持ち点</th>
                  <th className="text-right font-normal">スコア</th>
                  <th className="text-right font-normal">祝儀</th>
                </tr>
              </thead>
              <tbody>
                {game.players.map((player) => (
                  <tr key={player.playerId}>
                    <td>{player.rank}</td>
                    <td className="max-w-[10rem] truncate">
                      <Link
                        href={`/stats/${player.playerId}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {player.name}
                      </Link>
                    </td>
                    <td className="text-right tabular-nums">{player.points}</td>
                    <td className="text-right tabular-nums">
                      {formatMetric("signed", player.score)}
                    </td>
                    <td className="text-right tabular-nums">
                      {formatMetric("signed", player.chips)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </li>
        ))}
      </ul>
      {hasMore && limit < MAX_GAMES && (
        <Link
          href={`/history?n=${Math.min(limit + PAGE_SIZE, MAX_GAMES)}`}
          className={subtleButtonClass}
        >
          もっと見る
        </Link>
      )}
      <div className="flex gap-4">
        <Link href="/stats" className={subtleButtonClass}>
          成績
        </Link>
        <Link href="/" className={subtleButtonClass}>
          ホームへ戻る
        </Link>
      </div>
    </Screen>
  );
}
