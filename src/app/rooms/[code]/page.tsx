import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RoomEntry } from "@/app/room-entry";
import { Screen, subtleButtonClass } from "@/components/screen";
import { requireApproved } from "@/server/auth";
import { getRoomDetail } from "@/server/room-queries";
import { parseRoomCode } from "@/server/room-rules";
import { startIfFull } from "@/server/rooms";
import { RoomActions, RoomWatcher } from "./room-client";

export default async function RoomPage({ params }: PageProps<"/rooms/[code]">) {
  const viewer = await requireApproved();
  const code = parseRoomCode((await params).code);
  if (!code) notFound();

  let room = await getRoomDetail(code);
  // メンバーでなければルームは見えない。URLを受け取った人が参加できるよう、コードを入れた状態で出す。
  if (!room) {
    return (
      <Screen title="ルームに参加">
        <RoomEntry initialCode={code} />
        <Link href="/" className={subtleButtonClass}>
          ホームへ戻る
        </Link>
      </Screen>
    );
  }

  if (room.status === "waiting" && room.members.length === 3) {
    await startIfFull(room.id, room.members.length);
    room = (await getRoomDetail(code)) ?? room;
  }
  if (room.status === "in_game" && room.gameId) {
    redirect(`/games/${room.gameId}`);
  }

  const nameOf = new Map(room.members.map((m) => [m.userId, m.name]));
  const me = room.members.find((member) => member.userId === viewer.id);

  return (
    <Screen title={`ルーム ${room.code}`}>
      <RoomWatcher roomId={room.id} />
      {room.status === "waiting" && (
        <p className="text-sm opacity-80">
          3人そろうと自動で始まります。このページのURLかルームコードを伝えてください。
        </p>
      )}
      {room.status === "abandoned" && (
        <p className="text-sm opacity-80">この対局は破棄されました。</p>
      )}

      {room.results.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left opacity-70">
              <th className="font-normal">順位</th>
              <th className="font-normal">名前</th>
              <th className="text-right font-normal">持ち点</th>
              <th className="text-right font-normal">スコア</th>
              <th className="text-right font-normal">祝儀</th>
            </tr>
          </thead>
          <tbody>
            {room.results.map((row) => (
              <tr key={row.userId}>
                <td>{row.rank}</td>
                <td>{nameOf.get(row.userId) ?? "（不明）"}</td>
                <td className="text-right">{row.points}</td>
                <td className="text-right">{row.score}</td>
                <td className="text-right">{row.chips}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ul className="flex flex-col gap-1 text-sm">
        {room.members.map((member) => (
          <li key={member.userId} className="flex justify-between gap-3">
            <span className="truncate">{member.name}</span>
            {room.status === "finished" && (
              <span className="opacity-70">
                {member.rematchReady ? "再戦する" : "未回答"}
              </span>
            )}
          </li>
        ))}
        {room.status === "waiting" &&
          Array.from({ length: 3 - room.members.length }, (_, i) => (
            <li key={i} className="opacity-50">
              （待っています）
            </li>
          ))}
      </ul>

      <RoomActions
        roomId={room.id}
        status={room.status}
        rematchReady={me?.rematchReady ?? false}
      />
      <Link href="/" className={subtleButtonClass}>
        ホームへ戻る
      </Link>
    </Screen>
  );
}
