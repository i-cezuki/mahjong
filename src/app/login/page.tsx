import { redirect } from "next/navigation";
import { signInWithGoogle } from "@/app/actions";
import { Screen, buttonClass } from "@/components/screen";
import { getViewer } from "@/server/auth";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getViewer()) redirect("/");
  const { error } = await searchParams;

  return (
    <Screen title="3人麻雀">
      <p className="text-sm opacity-80">
        Googleアカウントでログインします。初めての人は、管理者の承認後に遊べるようになります。
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-300">
          ログインできませんでした。もう一度お試しください。
        </p>
      )}
      <form action={signInWithGoogle}>
        <button type="submit" className={`${buttonClass} w-full`}>
          Googleでログイン
        </button>
      </form>
    </Screen>
  );
}
