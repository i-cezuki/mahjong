"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { displayHand } from "@/components/hand-order";
import {
  YAKU_LABELS,
  kindLabel,
  roundLabel,
  tileLabel,
  windLabel,
} from "@/components/labels";
import { buttonClass, subtleButtonClass } from "@/components/screen";
import {
  fetchGameVersion,
  fetchGameView,
  watchUpdates,
} from "@/lib/supabase-browser";
import type { PlayerView, TableAction } from "@/server/table";

/*
 * 通信を確かめるための仮の対局画面。牌は文字で出す。
 * 卓の配置と牌の絵柄は、あとのフェーズで作り直す。
 */

interface Snapshot {
  version: number;
  view: PlayerView;
}

const SEATS = [0, 1, 2] as const;
/** 通知の取りこぼしを確かめる間隔 */
const VERSION_CHECK_MS = 4000;

/** 画面データを最新に保つ。Realtimeの通知と、操作の応答の両方から受け取る。 */
function useGameView(gameId: string, initial: Snapshot) {
  const [snapshot, setSnapshot] = useState(initial);

  // 通知は順番どおりに届くとは限らないので、版番号の新しいものだけを採用する
  const accept = useCallback((next: Snapshot) => {
    setSnapshot((current) => (next.version > current.version ? next : current));
  }, []);

  const refetch = useCallback(async () => {
    try {
      const row = await fetchGameView(gameId);
      if (row) accept({ version: row.version, view: row.view as PlayerView });
    } catch {
      // つながり直したときにもう一度取りに行く
    }
  }, [gameId, accept]);

  // 通知はまれに届かないことがある。対局中は版番号を定期的に見て、進んでいたら取り直す
  const version = useRef(snapshot.version);
  useEffect(() => {
    version.current = snapshot.version;
  }, [snapshot.version]);
  const playing = snapshot.view.phase === "playing";
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const latest = await fetchGameVersion(gameId);
        if (latest !== null && latest > version.current) await refetch();
      } catch {
        // 次の回でもう一度見る
      }
    }, VERSION_CHECK_MS);
    return () => clearInterval(timer);
  }, [gameId, playing, refetch]);

  useEffect(() => {
    const stop = watchUpdates({
      channel: `game:${gameId}`,
      table: "game_views",
      filter: `game_id=eq.${gameId}`,
      onUpdate: (row) =>
        accept({
          version: row.version,
          view: row.view as unknown as PlayerView,
        }),
      onConnected: () => void refetch(),
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      stop();
    };
  }, [gameId, accept, refetch]);

  return { snapshot, accept, refetch };
}

function Tiles({ tiles }: { tiles: readonly number[] }) {
  if (tiles.length === 0) return <span className="opacity-50">なし</span>;
  return <>{tiles.map(tileLabel).join(" ")}</>;
}

function actionLabel(action: TableAction): string {
  switch (action.type) {
    case "discard":
      return tileLabel(action.tile);
    case "riichi":
      return `${action.doubleStake ? "2倍リーチ" : "リーチ"}（${tileLabel(action.tile)}切り）`;
    case "tsumo":
      return "ツモ";
    case "ankan":
      return `暗槓（${kindLabel(action.kind)}）`;
    case "kakan":
      return `加槓（${tileLabel(action.tile)}）`;
    case "ron":
      return "ロン";
    case "pon":
      return `ポン（${action.tiles.map(tileLabel).join(" ")}）`;
    case "minkan":
      return "大明槓";
    case "pass":
      return "スキップ";
    case "dice":
      return `${action.faces[0]}-${action.faces[1]}`;
    case "confirm":
      return "確認";
  }
}

const WIN_KINDS: Record<string, string> = {
  tsumo: "ツモ",
  ron: "ロン",
  pocchi: "ポッチ",
  reversePocchi: "逆ポッチ",
  nagashi: "流し役満",
};

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export function GameClient({
  gameId,
  roomCode,
  names,
  initialVersion,
  initialView,
}: {
  gameId: string;
  roomCode: string | null;
  names: string[];
  initialVersion: number;
  initialView: PlayerView;
}) {
  const { snapshot, accept, refetch } = useGameView(gameId, {
    version: initialVersion,
    view: initialView,
  });
  const { version, view } = snapshot;
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);

  async function send(action: TableAction) {
    // 応答が返るまで次の操作は送らない
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/games/${gameId}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version, action }),
      });
      if (response.ok) {
        accept((await response.json()) as Snapshot);
      } else if (response.status === 409) {
        // 見ていた状態が古かった。取り直せば続けられる
        await refetch();
      } else {
        setError("その操作はできません");
        await refetch();
      }
    } catch {
      setError("通信できませんでした。もう一度お試しください");
    }
    sending.current = false;
    setBusy(false);
  }

  const discards = view.actions.filter((a) => a.type === "discard");
  const others = view.actions.filter((a) => a.type !== "discard");
  const outcome = view.outcome;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4 text-sm">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-lg font-semibold">
          {roundLabel(view.roundIndex, view.honba)}
        </h1>
        <span>供託 {view.kyotaku}</span>
        <span>残り {view.wallCount}枚</span>
        <span>
          ドラ表示 <Tiles tiles={view.doraIndicators} />
        </span>
      </header>

      <ul className="flex flex-col gap-3">
        {SEATS.map((seat) => (
          <li
            key={seat}
            className={`rounded border p-3 ${
              view.turn === seat && view.roundPhase !== "ended"
                ? "border-foreground"
                : "border-foreground/30"
            }`}
          >
            <p className="flex flex-wrap gap-x-3 font-medium">
              <span>
                {windLabel(seat, view.dealer)} {names[seat]}
                {seat === view.seat && "（自分）"}
              </span>
              <span>{view.points[seat]}点</span>
              <span>祝儀 {signed(view.chips[seat])}</span>
              {view.riichi[seat] && (
                <span>
                  {view.riichi[seat].doubleStake ? "2倍リーチ" : "リーチ"}
                </span>
              )}
              {seat !== view.seat && (
                <span>手牌 {view.handCounts[seat]}枚</span>
              )}
            </p>
            <p>
              河：
              {view.rivers[seat].length === 0 ? (
                <span className="opacity-50">なし</span>
              ) : (
                view.rivers[seat].map((discard, i) => (
                  <span
                    key={i}
                    className={discard.called ? "opacity-40" : undefined}
                  >
                    {discard.riichi && "［リ］"}
                    {tileLabel(discard.tile)}{" "}
                  </span>
                ))
              )}
            </p>
            {view.melds[seat].length > 0 && (
              <p>
                副露：
                {view.melds[seat]
                  .map((meld) => meld.tiles.map(tileLabel).join(" "))
                  .join(" ／ ")}
              </p>
            )}
            {view.flowers[seat].length > 0 && (
              <p>花：{view.flowers[seat].length}枚</p>
            )}
            {view.revealed[seat] && seat !== view.seat && (
              <p>
                手牌：
                <Tiles tiles={view.revealed[seat]} />
              </p>
            )}
          </li>
        ))}
      </ul>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">自分の手牌</h2>
        <div className="flex flex-wrap gap-1">
          {displayHand(view.hand, view.drawn).map((tile) => {
            const action = discards.find(
              (a) => a.type === "discard" && a.tile === tile,
            );
            return (
              <button
                key={tile}
                type="button"
                disabled={!action || busy}
                onClick={() => action && send(action)}
                className={`rounded border px-2 py-2 ${
                  tile === view.drawn ? "ml-3" : ""
                } ${
                  action
                    ? "border-foreground/60 hover:bg-foreground/10"
                    : "border-foreground/20"
                }`}
              >
                {tileLabel(tile)}
              </button>
            );
          })}
        </div>
        {others.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {view.diceChance && (
              <p className="w-full">
                サイコロチャンス：出目を選んでください（残り
                {view.diceChance.remaining}回）
              </p>
            )}
            {others.map((action, i) => (
              <button
                key={i}
                type="button"
                disabled={busy}
                onClick={() => send(action)}
                className={buttonClass}
              >
                {actionLabel(action)}
              </button>
            ))}
          </div>
        )}
        {view.actions.length === 0 && view.phase === "playing" && (
          <p className="opacity-60">ほかの人を待っています</p>
        )}
        {error && (
          <p role="alert" className="text-red-300">
            {error}
          </p>
        )}
      </section>

      {outcome && (
        <section className="flex flex-col gap-1 rounded border border-foreground/30 p-3">
          <h2 className="font-medium">
            {outcome.type === "win" ? "和了" : "流局"}
          </h2>
          {outcome.wins.map((win, i) => (
            <p key={i}>
              {names[win.seat]}：{WIN_KINDS[win.kind]}
              {win.from !== null && `（${names[win.from]}から）`}
              {win.winTile !== null && ` ${tileLabel(win.winTile)}`}
              {win.result &&
                ` ${win.result.yaku.map((y) => YAKU_LABELS[y.name]).join("、")} ${
                  win.result.yakuman > 0
                    ? `役満×${win.result.yakuman}`
                    : `${win.result.han}翻`
                }`}
            </p>
          ))}
          {outcome.type === "exhaustiveDraw" && (
            <p>
              テンパイ：
              {outcome.tenpai.length === 0
                ? "なし"
                : outcome.tenpai.map((seat) => names[seat]).join("、")}
            </p>
          )}
          {outcome.uraIndicators.length > 0 && (
            <p>
              裏ドラ表示 <Tiles tiles={outcome.uraIndicators} />
            </p>
          )}
          <p>
            点棒：
            {SEATS.map(
              (seat) => `${names[seat]} ${signed(outcome.pointDeltas[seat])}`,
            ).join("　")}
          </p>
          <p>
            祝儀：
            {SEATS.map(
              (seat) => `${names[seat]} ${signed(outcome.chipDeltas[seat])}`,
            ).join("　")}
          </p>
          {view.dice.map((dice, i) => (
            <p key={i}>
              サイコロ（{names[dice.seat]}が {dice.faces.join("-")} を指定）：
              {dice.rolls.map((roll) => roll.join("-")).join("、")} →{" "}
              {dice.hits}回当たり
            </p>
          ))}
          {view.diceChance && view.diceChance.seat !== view.seat && (
            <p>{names[view.diceChance.seat]}がサイコロの出目を選んでいます</p>
          )}
          {view.phase === "playing" && view.roundPhase === "ended" && (
            <p className="opacity-70">
              確認済み：
              {SEATS.filter((seat) => view.confirmed[seat])
                .map((seat) => names[seat])
                .join("、") || "なし"}
            </p>
          )}
        </section>
      )}

      {view.result && (
        <section className="flex flex-col gap-1 rounded border border-foreground p-3">
          <h2 className="font-medium">終局</h2>
          {view.result.ranking.map((seat, i) => (
            <p key={seat}>
              {i + 1}位 {names[seat]}：{view.result!.points[seat]}点　スコア{" "}
              {signed(view.result!.payout[seat])}　祝儀{" "}
              {signed(view.result!.chips[seat])}
            </p>
          ))}
          {roomCode && (
            <Link href={`/rooms/${roomCode}`} className={subtleButtonClass}>
              ルームへ戻る（再戦はこちら）
            </Link>
          )}
        </section>
      )}
    </main>
  );
}
