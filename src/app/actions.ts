"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdmin, requireApproved, requireViewer } from "@/server/auth";
import { parseDisplayName, parseRonPhrase } from "@/server/profile-rules";
import { createAdminClient, createSessionClient } from "@/server/supabase";

const UNIQUE_VIOLATION = "23505";

export async function signInWithGoogle(): Promise<void> {
  const supabase = await createSessionClient();
  const origin = (await headers()).get("origin");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback` },
  });
  if (error || !data.url) redirect("/login?error=1");
  redirect(data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await createSessionClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export interface DisplayNameState {
  error: string | null;
  /** 入力し直しやすいよう、断った入力をそのまま返す */
  value: string;
}

/** 表示名を決める。プロフィールはクライアントから書けないので、確認のうえサーバーで書く。 */
export async function saveDisplayName(
  _previous: DisplayNameState,
  formData: FormData,
): Promise<DisplayNameState> {
  const viewer = await requireViewer();
  const input = formData.get("displayName");
  const value = typeof input === "string" ? input : "";
  const parsed = parseDisplayName(input);
  if (!parsed.ok) return { error: parsed.error, value };

  const { error } = await createAdminClient()
    .from("profiles")
    .update({ display_name: parsed.name })
    .eq("id", viewer.id);
  if (error) {
    return {
      error:
        error.code === UNIQUE_VIOLATION
          ? "その表示名はすでに使われています"
          : "保存できませんでした。もう一度お試しください",
      value,
    };
  }
  redirect("/");
}

export interface RonPhraseState {
  error: string | null;
  /** 保存できたときだけ true。設定画面に「保存しました」と出す */
  saved: boolean;
  value: string;
}

/** ロンの決めゼリフを保存する。空なら設定を消して「ロン」に戻す。 */
export async function saveRonPhrase(
  _previous: RonPhraseState,
  formData: FormData,
): Promise<RonPhraseState> {
  const viewer = await requireApproved();
  const input = formData.get("ronPhrase");
  const value = typeof input === "string" ? input : "";
  const parsed = parseRonPhrase(input);
  if (!parsed.ok) return { error: parsed.error, saved: false, value };

  const { error } = await createAdminClient()
    .from("profiles")
    .update({ ron_phrase: parsed.phrase })
    .eq("id", viewer.id);
  if (error) {
    return {
      error: "保存できませんでした。もう一度お試しください",
      saved: false,
      value,
    };
  }
  return { error: null, saved: true, value: parsed.phrase ?? "" };
}

/** 管理者がユーザーを承認する。 */
export async function approveUser(formData: FormData): Promise<void> {
  await requireAdmin();
  const userId = formData.get("userId");
  if (typeof userId !== "string") return;

  const { error } = await createAdminClient()
    .from("profiles")
    .update({ approved: true })
    .eq("id", userId);
  if (error) throw new Error("承認できませんでした");
  revalidatePath("/admin");
}
