import { jsonError } from "@/server/api";
import { isCronAuthorized } from "@/server/cron-rules";
import { env } from "@/server/env";
import { abandonStaleGames } from "@/server/games";

/**
 * 定期実行（GitHub Actions、1日1回）から呼ばれる。放置された対局を破棄する。
 * Supabase にアクセスするので、無料枠の一時停止（1週間アクセスなし）も防ぐ。
 */
export async function POST(request: Request) {
  const header = request.headers.get("authorization");
  if (!isCronAuthorized(header, env.cronSecret)) {
    return jsonError("unauthorized", 401);
  }
  return Response.json({ abandoned: await abandonStaleGames() });
}
