import "server-only";

import { randomInt } from "node:crypto";
import { startGameForRoom } from "./games";
import { generateRoomCode } from "./room-rules";
import { createAdminClient } from "./supabase";

const UNIQUE_VIOLATION = "23505";
const CODE_ATTEMPTS = 5;

export type RoomError =
  /** ほかのルームに参加中 */
  | "busy"
  | "notFound"
  /** 満員、またはすでに対局が始まっている */
  | "full"
  | "forbidden"
  | "notAllowed";

export type RoomResult =
  { ok: true; code: string } | { ok: false; error: RoomError; code?: string };

interface RpcResult {
  result: string;
  room_id?: string;
  member_count?: number;
  all_ready?: boolean;
}

async function codeOfRoom(roomId: string | undefined): Promise<string | null> {
  if (!roomId) return null;
  const { data } = await createAdminClient()
    .from("rooms")
    .select("code")
    .eq("id", roomId)
    .maybeSingle();
  return data?.code ?? null;
}

/** ほかのルームに参加中のとき、そのルームへ案内できるようコードを付けて返す。 */
async function busy(roomId: string | undefined): Promise<RoomResult> {
  const code = await codeOfRoom(roomId);
  return { ok: false, error: "busy", ...(code && { code }) };
}

export async function createRoom(userId: string): Promise<RoomResult> {
  const admin = createAdminClient();
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    const code = generateRoomCode(randomInt);
    const { data, error } = await admin.rpc("create_room", {
      p_user: userId,
      p_code: code,
    });
    // コードが重複したら別のコードでやり直す
    if (error?.code === UNIQUE_VIOLATION) continue;
    if (error) break;

    const result = data as unknown as RpcResult;
    if (result.result === "created") return { ok: true, code };
    if (result.result === "busy") return busy(result.room_id);
    return { ok: false, error: "forbidden" };
  }
  throw new Error("ルームを作れませんでした");
}

/** ルームコードで参加する。3人そろったら対局を始める。 */
export async function joinRoom(
  userId: string,
  code: string,
): Promise<RoomResult> {
  const { data, error } = await createAdminClient().rpc("join_room", {
    p_user: userId,
    p_code: code,
  });
  if (error) throw new Error("ルームに参加できませんでした");

  const result = data as unknown as RpcResult;
  switch (result.result) {
    case "joined":
    case "already":
      await startIfFull(result.room_id!, result.member_count ?? 0);
      return { ok: true, code };
    case "busy":
      return busy(result.room_id);
    case "not_found":
      return { ok: false, error: "notFound" };
    case "full":
      return { ok: false, error: "full" };
    default:
      return { ok: false, error: "forbidden" };
  }
}

/**
 * 3人そろっているのに待機中のままなら対局を始める。
 * 3人目の参加の直後に開始の処理が失敗しても、次に誰かが開いたときに始まる。
 */
export async function startIfFull(
  roomId: string,
  memberCount: number,
): Promise<void> {
  if (memberCount === 3) await startGameForRoom(roomId, "waiting");
}

export async function leaveRoom(
  userId: string,
  roomId: string,
): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("leave_room", {
    p_user: userId,
    p_room: roomId,
  });
  if (error) throw new Error("ルームから抜けられませんでした");
  return data;
}

/** 再戦を押す。3人そろったら次の対局を始める。 */
export async function requestRematch(
  userId: string,
  roomId: string,
): Promise<{ ok: true } | { ok: false; error: RoomError; code?: string }> {
  const { data, error } = await createAdminClient().rpc("set_rematch_ready", {
    p_user: userId,
    p_room: roomId,
  });
  if (error) throw new Error("再戦を受け付けられませんでした");

  const result = data as unknown as RpcResult;
  switch (result.result) {
    case "ok":
      if (result.all_ready) await startGameForRoom(roomId, "finished");
      return { ok: true };
    case "busy": {
      const code = await codeOfRoom(result.room_id);
      return { ok: false, error: "busy", ...(code && { code }) };
    }
    case "forbidden":
      return { ok: false, error: "forbidden" };
    default:
      return { ok: false, error: "notAllowed" };
  }
}
