import {
  isSameOrigin,
  jsonError,
  readJson,
  requireApiViewer,
} from "@/server/api";
import { parseRoomCode } from "@/server/room-rules";
import { joinRoom } from "@/server/rooms";
import type { RoomError } from "@/server/rooms";

const STATUS: Record<RoomError, number> = {
  busy: 409,
  full: 409,
  notFound: 404,
  forbidden: 403,
  notAllowed: 409,
};

/** ルームコードで参加する。本文は { code }。 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError("forbidden", 403);
  const viewer = await requireApiViewer();
  if (viewer instanceof Response) return viewer;

  const body = await readJson(request);
  const code = parseRoomCode((body as { code?: unknown } | null)?.code);
  if (!code) return jsonError("invalid", 400);

  const result = await joinRoom(viewer.id, code);
  if (result.ok) return Response.json({ code: result.code });
  return Response.json(
    { error: result.error, code: result.code },
    { status: STATUS[result.error] },
  );
}
