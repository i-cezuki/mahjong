import { isSameOrigin, jsonError, requireApiViewer } from "@/server/api";
import { isUuid } from "@/server/room-rules";
import { leaveRoom } from "@/server/rooms";

/** 3人待ちのルームから抜ける。 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/rooms/[id]/leave">,
) {
  if (!isSameOrigin(request)) return jsonError("forbidden", 403);
  const viewer = await requireApiViewer();
  if (viewer instanceof Response) return viewer;

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError("notFound", 404);

  const left = await leaveRoom(viewer.id, id);
  return left ? Response.json({ ok: true }) : jsonError("notAllowed", 409);
}
