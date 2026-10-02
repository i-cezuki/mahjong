import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { Screen, subtleButtonClass } from "@/components/screen";
import { requireViewer } from "@/server/auth";

export default async function PendingPage() {
  const viewer = await requireViewer();
  if (viewer.displayName === null) redirect("/welcome");
  if (viewer.approved) redirect("/");

  return (
    <Screen title="承認待ち">
      <p className="text-sm opacity-80">
        {viewer.displayName}{" "}
        さんの登録を受け付けました。管理者が承認すると遊べるようになります。
        承認されたら、このページを開き直してください。
      </p>
      <form action={signOut}>
        <button type="submit" className={subtleButtonClass}>
          ログアウト
        </button>
      </form>
    </Screen>
  );
}
