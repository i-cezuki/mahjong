import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { isAdminEmail } from "@/server/profile-rules";
import { createAdminClient, createSessionClient } from "@/server/supabase";

/** Googleログインの戻り先。認可コードをセッションに交換する。 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (!code) return NextResponse.redirect(`${origin}/login?error=1`);

  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user)
    return NextResponse.redirect(`${origin}/login?error=1`);

  // 管理者はメールアドレスで固定。ログインのたびに合わせ直し、管理者は承認済みにする。
  const isAdmin = isAdminEmail(data.user.email, env.adminEmail);
  await createAdminClient()
    .from("profiles")
    .update(isAdmin ? { is_admin: true, approved: true } : { is_admin: false })
    .eq("id", data.user.id);

  return NextResponse.redirect(`${origin}/`);
}
