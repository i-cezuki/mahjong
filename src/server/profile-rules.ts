export const DISPLAY_NAME_MAX_LENGTH = 12;

export type DisplayNameResult =
  { ok: true; name: string } | { ok: false; error: string };

/** 表示名を検証して整える。DBの制約（1〜12文字）と同じ長さで判定する。 */
export function parseDisplayName(input: unknown): DisplayNameResult {
  if (typeof input !== "string") {
    return { ok: false, error: "表示名を入力してください" };
  }
  const name = input.normalize("NFKC").trim();
  const length = [...name].length;
  if (length === 0) return { ok: false, error: "表示名を入力してください" };
  if (length > DISPLAY_NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `表示名は${DISPLAY_NAME_MAX_LENGTH}文字までです`,
    };
  }
  if (/\p{Cc}/u.test(name)) {
    return { ok: false, error: "使えない文字が含まれています" };
  }
  return { ok: true, name };
}

export const RON_PHRASE_MAX_LENGTH = 8;

export type RonPhraseResult =
  { ok: true; phrase: string | null } | { ok: false; error: string };

/**
 * ロンの決めゼリフを検証して整える。DBの制約（1〜8文字）と同じ長さで判定する。
 * 空なら設定なし（null）で、カットインには「ロン」と出る。
 */
export function parseRonPhrase(input: unknown): RonPhraseResult {
  const phrase =
    typeof input === "string" ? input.normalize("NFKC").trim() : "";
  if (phrase === "") return { ok: true, phrase: null };
  if ([...phrase].length > RON_PHRASE_MAX_LENGTH) {
    return {
      ok: false,
      error: `決めゼリフは${RON_PHRASE_MAX_LENGTH}文字までです`,
    };
  }
  if (/\p{Cc}/u.test(phrase)) {
    return { ok: false, error: "使えない文字が含まれています" };
  }
  return { ok: true, phrase };
}

/** ログインした人が管理者（環境変数 ADMIN_EMAIL の人）かどうか。 */
export function isAdminEmail(
  email: string | undefined,
  adminEmail: string | undefined,
): boolean {
  const normalize = (value: string | undefined) =>
    value?.trim().toLowerCase() ?? "";
  return normalize(email) !== "" && normalize(email) === normalize(adminEmail);
}
