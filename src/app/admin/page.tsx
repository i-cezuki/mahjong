import Link from "next/link";
import { approveUser } from "@/app/actions";
import { Screen, buttonClass, subtleButtonClass } from "@/components/screen";
import { requireAdmin } from "@/server/auth";
import { createAdminClient } from "@/server/supabase";

/** 承認待ちのユーザーを、本人確認用のメールアドレス付きで取得する。 */
async function listPendingUsers() {
  const admin = createAdminClient();
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, display_name, created_at")
    .eq("approved", false)
    .order("created_at");
  if (error) throw new Error("承認待ちの一覧を取得できませんでした");

  return Promise.all(
    profiles.map(async (profile) => {
      const { data } = await admin.auth.admin.getUserById(profile.id);
      return { ...profile, email: data.user?.email ?? "（不明）" };
    }),
  );
}

export default async function AdminPage() {
  await requireAdmin();
  const pending = await listPendingUsers();

  return (
    <Screen title="承認">
      {pending.length === 0 ? (
        <p className="text-sm opacity-80">承認待ちの人はいません。</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {pending.map((user) => (
            <li
              key={user.id}
              className="flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {user.display_name ?? "（表示名は未設定）"}
                </p>
                <p className="truncate text-xs opacity-70">{user.email}</p>
              </div>
              <form action={approveUser}>
                <input type="hidden" name="userId" value={user.id} />
                <button type="submit" className={buttonClass}>
                  承認
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <Link href="/" className={subtleButtonClass}>
        ホームへ戻る
      </Link>
    </Screen>
  );
}
