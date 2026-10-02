"use client";

import { useCallback, useRef, useState } from "react";
import type { PlayerView, TableAction } from "@/server/table";
import { TableScreen } from "./table/table-screen";
import { useGameView } from "./use-game-view";
import type { Snapshot } from "./use-game-view";

const roundKey = (view: PlayerView) => `${view.roundIndex}-${view.honba}`;

/** 対局の画面の通信の部分。画面データを最新に保ち、操作をサーバーへ送る。 */
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
    },
    [gameId, version, accept, refetch],
  );

  return (
    <TableScreen
      view={view}
      version={version}
      names={names}
      roomCode={roomCode}
      busy={busy}
      error={error}
      send={send}
      shownDice={roundKey(view) === opened.round ? opened.dice : 0}
    />
  );
}
