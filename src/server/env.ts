import "server-only";

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`環境変数 ${name} が設定されていません`);
  return value;
}

/** NEXT_PUBLIC_ はビルド時に埋め込まれるので、名前を直接書いて参照する。 */
export const env = {
  get supabaseUrl() {
    return required(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    );
  },
  get supabasePublishableKey() {
    return required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    );
  },
  get supabaseSecretKey() {
    return required("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY);
  },
  get adminEmail() {
    return required("ADMIN_EMAIL", process.env.ADMIN_EMAIL);
  },
  /** 定期実行（GitHub Actions）の秘密の値。設定していなければ null で、定期実行は受け付けない。 */
  get cronSecret(): string | null {
    return process.env.CRON_SECRET || null;
  },
};
