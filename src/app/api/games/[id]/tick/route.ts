import {
  isSameOrigin,
  jsonError,
  readJson,
  requireApiViewer,
} from "@/server/api";
import { submitTick } from "@/server/games";
import type { SubmitError } from "@/server/games";
import { isUuid } from "@/server/room-rules";

const STATUS: Record<SubmitError, number> = {
  notFound: 404,
  finished: 409,
  stale: 409,
  invalid: 400,
  illegal: 422,
};

/**
 * 時間切れの申告を受け付ける。本文は { version }。
 * 期限を過ぎたら、画面を開いている誰かが送る。期限はサーバーが自分の時計で確かめる。
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/games/[id]/tick">,
) {
  if (!isSameOrigin(request)) return jsonError("forbidden", 403);
  const viewer = await requireApiViewer();
  if (viewer instanceof Response) return viewer;

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError("notFound", 404);

  const body = (await readJson(request)) as { version?: unknown } | null;
  const result = await submitTick({
    gameId: id,
    userId: viewer.id,
    version: body?.version,
  });
  if (!result.ok) return jsonError(result.error, STATUS[result.error]);
  return Response.json({ version: result.version, view: result.view });
}
