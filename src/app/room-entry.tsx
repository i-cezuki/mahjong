"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass } from "@/components/screen";

const ERRORS: Record<string, string> = {
  busy: "ほかのルームに参加中です",
  notFound: "そのコードのルームはありません",
  full: "そのルームは満員か、すでに対局が始まっています",
  invalid: "ルームコードは6文字の英数字です",
  forbidden: "この操作はできません",
};
const FALLBACK = "うまくいきませんでした。もう一度お試しください";

/** ルームを作る、またはルームコードで参加する。 */
export function RoomEntry({ initialCode = "" }: { initialCode?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
