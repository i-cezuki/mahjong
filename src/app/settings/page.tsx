import Link from "next/link";
import { Screen, subtleButtonClass } from "@/components/screen";
import { requireApproved } from "@/server/auth";
import { RON_PHRASE_MAX_LENGTH } from "@/server/profile-rules";
import { createSessionClient } from "@/server/supabase";
import { DoubleTapForm } from "./double-tap-form";
import { RonPhraseForm } from "./ron-phrase-form";

export default async function SettingsPage() {
  const viewer = await requireApproved();
  const supabase = await createSessionClient();
  const { data } = await supabase
    .from("profiles")
    .select("ron_phrase, double_tap_tsumogiri")
    .eq("id", viewer.id)
    .maybeSingle();

  return (
    <Screen title="設定">
      <p className="text-sm opacity-80">
        ロンしたとき、卓に「ロン」の代わりに出す文字です。ほかの人の画面にも出ます。空にすると「ロン」に戻ります。
      </p>
      <RonPhraseForm
        initial={data?.ron_phrase ?? ""}
        maxLength={RON_PHRASE_MAX_LENGTH}
      />
      <DoubleTapForm initial={data?.double_tap_tsumogiri ?? true} />
      <div>
        <Link href="/" className={subtleButtonClass}>
          ホームへ戻る
        </Link>
      </div>
    </Screen>
  );
}
