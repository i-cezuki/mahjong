import { jsonError, requireApiViewer } from "@/server/api";
import { isUuid } from "@/server/room-rules";
import { createSessionClient } from "@/server/supabase";

/** 自分の画面データを取り直す。再接続やブラウザ更新のあとに使う。 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/games/[id]/view">,
) {
  const viewer = await requireApiViewer();
  if (viewer instanceof Response) return viewer;

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError("notFound", 404);

  // RLSにより自分の行しか読めない
  const supabase = await createSessionClient();
  const { data } = await supabase
    .from("game_views")
    .select("version, view")
    .eq("game_id", id)
    .eq("player_id", viewer.id)
    .maybeSingle();
  if (!data) return jsonError("notFound", 404);
  return Response.json({ version: data.version, view: data.view });
}
