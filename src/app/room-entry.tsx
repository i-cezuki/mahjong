"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { buttonClass } from "@/components/screen";
import type { OpenRoom } from "@/server/room-queries";

const ERRORS: Record<string, string> = {
  busy: "ほかのルームに参加中です",
  notFound: "そのコードのルームはありません",
  full: "そのルームは満員か、すでに対局が始まっています",
  invalid: "ルームコードは6文字の英数字です",
  forbidden: "この操作はできません",
};
const FALLBACK = "うまくいきませんでした。もう一度お試しください";
/** 募集中のルームの一覧を読み直す間隔 */
const REFRESH_MS = 20_000;

/**
 * ルームを作る、またはルームコードで参加する。
 * @param openRooms 参加者を募集中のルーム。渡すと、コードを打たずに参加できる一覧を出す
 */
export function RoomEntry({
  initialCode = "",
  openRooms,
}: {
  initialCode?: string;
  openRooms?: OpenRoom[];
}) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listsRooms = openRooms !== undefined;

  // ほかの人が作ったルームが一覧に出るよう、画面に戻ったときと見ている間は定期的に読み直す
  useEffect(() => {
    if (!listsRooms) return;
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [listsRooms, router]);

  async function send(path: string, body?: unknown) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        ...(body !== undefined && {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      });
      const json = (await response.json().catch(() => null)) as {
        code?: string;
        error?: string;
      } | null;
      // 参加中のルームがあるときは、そのルームへ案内する
      if (json?.code && (response.ok || json.error === "busy")) {
        router.push(`/rooms/${json.code}`);
        router.refresh();
        return;
      }
      setError(ERRORS[json?.error ?? ""] ?? FALLBACK);
    } catch {
      setError(FALLBACK);
    }
    setPending(false);
  }

  return (
    <div className="flex flex-col gap-4">
      {openRooms && openRooms.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm opacity-80">参加者を募集中のルーム</h2>
          <ul className="flex flex-col gap-2">
            {openRooms.map((room) => (
              <li
                key={room.code}
                className="flex items-center justify-between gap-3 rounded border border-foreground/20 px-3 py-2"
              >
                <div className="min-w-0 text-sm">
                  <p className="tracking-widest">{room.code}</p>
                  <p className="truncate text-xs opacity-70">
                    {room.names.join("、")}（{room.names.length}/3）
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  className={`${buttonClass} shrink-0`}
                  onClick={() => send("/api/rooms/join", { code: room.code })}
                >
                  参加
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <button
        type="button"
        disabled={pending}
        className={buttonClass}
        onClick={() => send("/api/rooms")}
      >
        ルームを作る
      </button>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send("/api/rooms/join", { code });
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          ルームコード
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
            maxLength={12}
            autoCapitalize="characters"
            autoComplete="off"
            className="rounded border border-foreground/40 bg-transparent px-3 py-2 text-base tracking-widest uppercase"
          />
        </label>
        <button type="submit" disabled={pending} className={buttonClass}>
          参加する
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
