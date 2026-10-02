import { isSameOrigin, jsonError, requireApiViewer } from "@/server/api";
import { isUuid } from "@/server/room-rules";
import { requestRematch } from "@/server/rooms";

/** 終わったルームで再戦を押す。3人そろったら次の対局が始まる。 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/rooms/[id]/rematch">,
) {
  if (!isSameOrigin(request)) return jsonError("forbidden", 403);
  const viewer = await requireApiViewer();
  if (viewer instanceof Response) return viewer;

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError("notFound", 404);

  const result = await requestRematch(viewer.id, id);
  if (result.ok) return Response.json({ ok: true });
  return Response.json(
    { error: result.error, code: result.code },
    { status: result.error === "forbidden" ? 403 : 409 },
  );
}
