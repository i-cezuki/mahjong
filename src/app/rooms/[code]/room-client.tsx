"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { buttonClass } from "@/components/screen";
import { watchUpdates } from "@/lib/supabase-browser";

/**
 * ルームの変更（メンバーの増減、対局の開始、再戦の表明）を購読して、画面を読み直す。
 * 通知を取りこぼしても、つながり直したときと画面に戻ったときに読み直す。
 */
export function RoomWatcher({ roomId }: { roomId: string }) {
  const router = useRouter();

  useEffect(() => {
    const stop = watchUpdates({
      channel: `room:${roomId}`,
      table: "rooms",
      filter: `id=eq.${roomId}`,
      onUpdate: () => router.refresh(),
      onConnected: () => router.refresh(),
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      stop();
    };
  }, [roomId, router]);

  return null;
}

const ERRORS: Record<string, string> = {
  busy: "ほかのルームに参加中です",
  notAllowed: "いまはできません",
};
const FALLBACK = "うまくいきませんでした。もう一度お試しください";

export function RoomActions({
  roomId,
  status,
  rematchReady,
}: {
  roomId: string;
  status: string;
  rematchReady: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(action: "leave" | "rematch") {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/rooms/${roomId}/${action}`, {
        method: "POST",
      });
      if (response.ok) {
        if (action === "leave") router.push("/");
        router.refresh();
      } else {
        const json = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(ERRORS[json?.error ?? ""] ?? FALLBACK);
      }
    } catch {
      setError(FALLBACK);
    }
    setPending(false);
  }

  return (
    <>
      {status === "waiting" && (
        <button
          type="button"
          disabled={pending}
          className={buttonClass}
          onClick={() => send("leave")}
        >
          ルームから抜ける
        </button>
      )}
      {status === "finished" && (
        <button
          type="button"
          disabled={pending || rematchReady}
          className={buttonClass}
          onClick={() => send("rematch")}
        >
          {rematchReady ? "ほかの人を待っています" : "再戦する"}
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
    </>
  );
}
