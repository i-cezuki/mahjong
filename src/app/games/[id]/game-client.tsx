"use client";

import { useCallback, useRef, useState } from "react";
import type { PlayerView, TableAction } from "@/server/table";
import { optimisticView } from "./logic/optimistic";
import { TableScreen } from "./table/table-screen";
import { useServerTime, useTick } from "./use-clock";
import { useDrawHold } from "./use-draw-hold";
import { useGameView } from "./use-game-view";
import type { Snapshot } from "./use-game-view";

const roundKey = (view: PlayerView) => `${view.roundIndex}-${view.honba}`;

/** エラーの応答の種類を読む。 */
async function errorOf(response: Response): Promise<string | null> {
  const json = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return json?.error ?? null;
}

/** 対局の画面の通信の部分。画面データを最新に保ち、操作をサーバーへ送る。 */
export function GameClient({
  gameId,
  roomCode,
  names,
  ronPhrases,
  doubleTapTsumogiri,
  initialVersion,
  initialView,
  renderedAt,
}: {
  gameId: string;
  roomCode: string | null;
  names: string[];
  /** 席ごとのロンの決めゼリフ。設定なしは null */
  ronPhrases: (string | null)[];
  /** 自分の設定。ダブルタップでツモ切りするか */
  doubleTapTsumogiri: boolean;
  initialVersion: number;
  initialView: PlayerView;
  /** サーバーがこのページを描いた時刻。サーバーの時計との差の見積もりに使う */
  renderedAt: number;
}) {
  const { snapshot, accept, refetch } = useGameView(gameId, {
    version: initialVersion,
    view: initialView,
  });
  const { version, view } = snapshot;
  const serverTime = useServerTime(snapshot, renderedAt);
  // 打牌のあと、次の人のツモはサーバーが決めた時刻まで見せない
  const shown = useDrawHold(view, snapshot.previous, serverTime);

  // 終わった（または破棄された）対局に操作や申告を送ったら、ページを読み込み直して結果か案内を出す
  const recover = useCallback(
    async (response: Response) => {
      if ((await errorOf(response)) === "finished") window.location.reload();
      else await refetch();
    },
    [refetch],
  );

  const tick = useCallback(async () => {
    try {
      const response = await fetch(`/api/games/${gameId}/tick`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version }),
      });
      if (response.ok) accept((await response.json()) as Snapshot);
      // 期限前（422）や版番号が古い（409）のは、ほかの人が先に進めたか時計がずれているだけ
      else await recover(response);
    } catch {
      // useTick が間を置いて送り直す
    }
  }, [gameId, version, accept, recover]);
  useTick({
    deadline: view.deadline,
    version,
    seat: view.seat,
    serverTime,
    tick,
  });
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);
  // 応答を待たずに先に出している画面データ。元にした版番号から画面データが進んだら捨てる
  const [guess, setGuess] = useState<{
    base: number;
    view: PlayerView;
  } | null>(null);
  const ahead = guess?.base === version ? guess.view : null;

  // 画面を開いた時点で届いていたサイコロの結果は、再生せずに結果だけ出す
  const [opened] = useState(() => ({
    round: roundKey(initialView),
    dice: initialView.dice.length,
  }));

  const send = useCallback(
    async (action: TableAction) => {
      // 応答が返るまで次の操作は送らない
      if (sending.current) return;
      sending.current = true;
      setBusy(true);
      setError(null);
      // 打牌などは、応答を待たずに画面へ出す。拒否されたら下で元に戻す
      const next = optimisticView(view, action);
      setGuess(next && { base: version, view: next });
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
          setGuess(null);
          await recover(response);
        } else {
          setGuess(null);
          setError("その操作はできません");
          await refetch();
        }
      } catch {
        setGuess(null);
        setError("通信できませんでした。もう一度お試しください");
      }
      sending.current = false;
      setBusy(false);
    },
    [gameId, version, view, accept, refetch, recover],
  );

  return (
    <TableScreen
      gameId={gameId}
      view={ahead ?? shown}
      // 先に出している間は別の版として扱い、牌の選択や発声の検出をやり直させる
      version={ahead ? version + 0.5 : version}
      names={names}
      ronPhrases={ronPhrases}
      doubleTapTsumogiri={doubleTapTsumogiri}
      roomCode={roomCode}
      busy={busy}
      error={error}
      send={send}
      shownDice={roundKey(view) === opened.round ? opened.dice : 0}
      serverTime={serverTime}
    />
  );
}
