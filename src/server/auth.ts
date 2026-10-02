import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { createSessionClient } from "./supabase";

export interface Viewer {
  id: string;
  email: string | undefined;
  displayName: string | null;
  approved: boolean;
  isAdmin: boolean;
}

/** ログイン中のユーザー。未ログインなら null。1回のリクエストの中では結果を使い回す。 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createSessionClient();
  // getUser は認証サーバーに問い合わせるので、Cookieの中身を偽装されても通らない
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, approved, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email,
    displayName: profile?.display_name ?? null,
    approved: profile?.approved ?? false,
    isAdmin: profile?.is_admin ?? false,
  };
});

/** ログインしていなければログイン画面へ送る。 */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

/** 表示名が未設定なら設定画面へ、未承認なら承認待ち画面へ送る。 */
export async function requireApproved(): Promise<
  Viewer & { displayName: string }
> {
  const viewer = await requireViewer();
  if (viewer.displayName === null) redirect("/welcome");
  if (!viewer.approved) redirect("/pending");
  return { ...viewer, displayName: viewer.displayName };
}

/** 管理者でなければホームへ送る。 */
export async function requireAdmin(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!viewer.isAdmin) redirect("/");
  return viewer;
}
