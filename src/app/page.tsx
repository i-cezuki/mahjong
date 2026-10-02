import Link from "next/link";
import { signOut } from "@/app/actions";
import { Screen, subtleButtonClass } from "@/components/screen";
import { requireApproved } from "@/server/auth";

export default async function Home() {
  const viewer = await requireApproved();

  return (
    <Screen title="3人麻雀">
      <p className="text-sm opacity-80">
        {viewer.displayName} さん、ようこそ。
      </p>
      <p className="text-sm opacity-60">ルームの作成と参加は準備中です。</p>
      <div className="flex items-center gap-4">
        {viewer.isAdmin && (
          <Link href="/admin" className={subtleButtonClass}>
            承認
          </Link>
        )}
        <form action={signOut}>
          <button type="submit" className={subtleButtonClass}>
            ログアウト
          </button>
        </form>
      </div>
    </Screen>
  );
}
