import Link from "next/link";
import { signOut } from "@/app/actions";
import { RoomEntry } from "@/app/room-entry";
import { Screen, buttonClass, subtleButtonClass } from "@/components/screen";
import { requireApproved } from "@/server/auth";
import { abandonStaleGames } from "@/server/games";
import { getActiveRoomCode } from "@/server/room-queries";

export default async function Home() {
  const viewer = await requireApproved();
  // 放置された対局に閉じ込められないよう、ここで破棄する
  await abandonStaleGames(viewer.id).catch(() => 0);
  const activeCode = await getActiveRoomCode(viewer.id);

  return (
    <Screen title="3人麻雀">
      <p className="text-sm opacity-80">
        {viewer.displayName} さん、ようこそ。
      </p>
      {activeCode ? (
        <>
          <p className="text-sm opacity-80">参加中のルームがあります。</p>
          <Link
            href={`/rooms/${activeCode}`}
            className={`${buttonClass} text-center`}
          >
            ルーム {activeCode} に戻る
          </Link>
        </>
      ) : (
        <RoomEntry />
      )}
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/history" className={subtleButtonClass}>
          対局履歴
        </Link>
        <Link href="/stats" className={subtleButtonClass}>
          成績
        </Link>
        <Link href="/rules" className={subtleButtonClass}>
          ルール
        </Link>
        <Link href="/settings" className={subtleButtonClass}>
          設定
        </Link>
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
      <p className="text-xs opacity-50">
        牌画像：
        <a
          href="https://mj-king.net/sozai/"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          麻雀王国
        </a>
      </p>
    </Screen>
  );
}
