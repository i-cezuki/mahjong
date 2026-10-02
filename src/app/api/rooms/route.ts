import { isSameOrigin, jsonError, requireApiViewer } from "@/server/api";
import { createRoom } from "@/server/rooms";

/** ルームを作る。 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError("forbidden", 403);
  const viewer = await requireApiViewer();
  if (viewer instanceof Response) return viewer;

  const result = await createRoom(viewer.id);
  if (result.ok) return Response.json({ code: result.code }, { status: 201 });
  return Response.json(
    { error: result.error, code: result.code },
    { status: result.error === "busy" ? 409 : 403 },
  );
}
