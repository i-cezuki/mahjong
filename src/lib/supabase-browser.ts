import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/server/database.types";

/**
 * ブラウザ用のクライアント。Realtimeの購読と、自分の画面データの取り直しに使う。
 * ログイン中のユーザーとして接続するのでRLSが効く。書き込みはできない。
 */
function createBrowserSupabase() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

type WatchedTable = "game_views" | "rooms";

/**
 * テーブルの行の更新を購読する。届くのはRLSで自分が読める行だけ。
 * 購読が始まる前や切れている間の更新は届かないので、つながるたびに onConnected を呼ぶ。
 * 呼び出す側はそこで最新の状態を取り直す。
 * @returns 購読をやめる関数
 */
export function watchUpdates<T extends WatchedTable>(params: {
  /** 同じ画面を二重に開いても混ざらないよう、購読ごとに決める名前 */
  channel: string;
  table: T;
  /** 例: `game_id=eq.<id>` */
  filter: string;
  onUpdate: (row: Database["public"]["Tables"][T]["Row"]) => void;
  onConnected: () => void;
}): () => void {
  const supabase = createBrowserSupabase();
  let stopped = false;
  let channel: ReturnType<typeof supabase.channel> | null = null;

  void (async () => {
    // Cookieのセッションを読み終える前に購読すると、未ログインの扱いになり何も届かない
    await supabase.realtime.setAuth();
    if (stopped) return;
    channel = supabase
      .channel(params.channel)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: params.table,
          filter: params.filter,
        },
        (payload) =>
          params.onUpdate(
            payload.new as Database["public"]["Tables"][T]["Row"],
          ),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") params.onConnected();
      });
  })();

  return () => {
    stopped = true;
    if (channel) void supabase.removeChannel(channel);
  };
}

/** 自分の画面データを取り直す。RLSにより自分の行しか返らない。 */
export async function fetchGameView(
  gameId: string,
): Promise<{ version: number; view: unknown } | null> {
  const { data } = await createBrowserSupabase()
    .from("game_views")
    .select("version, view")
    .eq("game_id", gameId)
    .maybeSingle();
  return data;
}

/** 自分の画面データの版番号だけを読む。通知の取りこぼしに気づくために使う。 */
export async function fetchGameVersion(gameId: string): Promise<number | null> {
  const { data } = await createBrowserSupabase()
    .from("game_views")
    .select("version")
    .eq("game_id", gameId)
    .maybeSingle();
  return data?.version ?? null;
}
