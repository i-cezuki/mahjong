import "server-only";

import { getViewer } from "./auth";
import type { Viewer } from "./auth";

export function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

/**
 * APIを呼べる人（ログイン済み、表示名あり、承認済み）を返す。そうでなければエラーの応答を返す。
 * ページと違って、リダイレクトはしない。
 */
export async function requireApiViewer(): Promise<Viewer | Response> {
  const viewer = await getViewer();
  if (!viewer) return jsonError("unauthorized", 401);
  if (viewer.displayName === null || !viewer.approved) {
    return jsonError("forbidden", 403);
  }
  return viewer;
}

/**
 * 書き込みの要求が自分のサイトの画面から来たことを確かめる。
 * ブラウザは別サイトからのPOSTにも Origin を付けるので、それがこのサイトと一致することを見る。
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  // Origin を付けないのはブラウザ以外（スクリプトなど）で、Cookieを勝手に送られる心配がない
  if (origin === null) return true;
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** JSONの本文を読む。読めなければ null。 */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
