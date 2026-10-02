import { redirect } from "next/navigation";
import { Screen } from "@/components/screen";
import { requireViewer } from "@/server/auth";
import { DISPLAY_NAME_MAX_LENGTH } from "@/server/profile-rules";
import { DisplayNameForm } from "./display-name-form";

export default async function WelcomePage() {
  const viewer = await requireViewer();
  if (viewer.displayName !== null) redirect("/");

  return (
    <Screen title="表示名を決める">
      <p className="text-sm opacity-80">
        対局中にほかの人に見える名前です。ほかの人と同じ名前は使えません。
      </p>
      <DisplayNameForm maxLength={DISPLAY_NAME_MAX_LENGTH} />
    </Screen>
  );
}
