"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchGameVersion,
  fetchGameView,
  watchUpdates,
} from "@/lib/supabase-browser";
import type { PlayerView } from "@/server/table";
import { withClockFields } from "./logic/clock";

export interface Snapshot {
  version: number;
  view: PlayerView;
}

/** 通知の取りこぼしを確かめる間隔 */
const VERSION_CHECK_MS = 4000;

/** 画面データを最新に保つ。Realtimeの通知と、操作の応答の両方から受け取る。 */
export function useGameView(gameId: string, initial: Snapshot) {
  const [snapshot, setSnapshot] = useState(() => ({
    ...initial,
    view: withClockFields(initial.view),
  }));

  // 通知は順番どおりに届くとは限らないので、版番号の新しいものだけを採用する
  const accept = useCallback((next: Snapshot) => {
    setSnapshot((current) =>
      next.version > current.version
        ? { version: next.version, view: withClockFields(next.view) }
        : current,
    );
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
