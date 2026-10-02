import {
  isSameOrigin,
  jsonError,
  readJson,
  requireApiViewer,
} from "@/server/api";
import { submitAction } from "@/server/games";
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
 * 対局の操作を受け付ける。本文は { version, action }。
 * version は自分が見ていた版番号。古ければ拒否するので、二重送信や古い要求の送り直しは無効になる。
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/games/[id]/actions">,
) {
  if (!isSameOrigin(request)) return jsonError("forbidden", 403);
  const viewer = await requireApiViewer();
  if (viewer instanceof Response) return viewer;

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError("notFound", 404);

  const body = (await readJson(request)) as {
    version?: unknown;
    action?: unknown;
  } | null;
  const result = await submitAction({
    gameId: id,
    userId: viewer.id,
    version: body?.version,
    action: body?.action,
  });
  if (!result.ok) return jsonError(result.error, STATUS[result.error]);
  return Response.json({ version: result.version, view: result.view });
}
