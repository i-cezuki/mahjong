import "server-only";

import { createAdminClient, createSessionClient } from "./supabase";

export interface ActiveRoom {
  id: string;
  code: string;
  /** waiting（3人待ち）か in_game */
  status: string;
}

/** 参加中（3人待ち、対局中）のルーム。なければ null。 */
export async function getActiveRoom(
  userId: string,
): Promise<ActiveRoom | null> {
  const admin = createAdminClient();
  const { data: roomId } = await admin.rpc("active_room_of", {
    p_user: userId,
  });
  if (!roomId) return null;
  const { data } = await admin
    .from("rooms")
    .select("id, code, status")
    .eq("id", roomId)
    .maybeSingle();
  return data ?? null;
}

export interface OpenRoom {
  code: string;
  /** 参加している人の表示名（入った順） */
  names: string[];
}

/** ホームに出す、参加者を募集中のルームの数の上限 */
const OPEN_ROOM_LIMIT = 10;

/**
 * 参加者を募集中（3人待ちで空きがある）のルーム。新しく作られた順。
 * メンバーでないルームはRLSで見えないので、管理者の権限で読む。
 */
export async function listOpenRooms(): Promise<OpenRoom[]> {
  const admin = createAdminClient();
  const { data: rooms } = await admin
    .from("rooms")
    .select("id, code")
    .eq("status", "waiting")
    .order("created_at", { ascending: false })
    .limit(OPEN_ROOM_LIMIT);
  if (!rooms?.length) return [];

  const { data: members } = await admin
    .from("room_members")
    .select("room_id, user_id")
    .in(
      "room_id",
      rooms.map((room) => room.id),
    )
    .order("joined_at");
  const memberRows = members ?? [];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, display_name")
    .in(
      "id",
      memberRows.map((member) => member.user_id),
    );
  const names = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile.display_name]),
  );

  return rooms
    .map((room) => ({
      code: room.code,
      names: memberRows
        .filter((member) => member.room_id === room.id)
        .map((member) => names.get(member.user_id) ?? "（不明）"),
    }))
    .filter((room) => room.names.length > 0 && room.names.length < 3);
}

export interface RoomMember {
  userId: string;
  name: string;
  rematchReady: boolean;
}

export interface RoomResultRow {
  userId: string;
  rank: number;
  points: number;
  score: number;
  chips: number;
}

export interface RoomDetail {
  id: string;
  code: string;
  status: string;
  members: RoomMember[];
  /** いちばん新しい対局 */
  gameId: string | null;
  /** いちばん新しい対局の結果（終わっていれば） */
  results: RoomResultRow[];
}

/**
 * ルームの表示に必要な情報をまとめて読む。
 * ログイン中のユーザーとして読むので、メンバーでなければRLSにより null になる。
 */
export async function getRoomDetail(code: string): Promise<RoomDetail | null> {
  const supabase = await createSessionClient();
  const { data: room } = await supabase
    .from("rooms")
    .select("id, code, status")
    .eq("code", code)
    .maybeSingle();
  if (!room) return null;

  const [members, game] = await Promise.all([
    supabase
      .from("room_members")
      .select("user_id, rematch_ready")
      .eq("room_id", room.id)
      .order("joined_at"),
    supabase
      .from("games")
      .select("id")
      .eq("room_id", room.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const gameId = game.data?.id ?? null;
  const memberRows = members.data ?? [];

  const [profiles, results] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name")
      .in(
        "id",
        memberRows.map((member) => member.user_id),
      ),
    gameId
      ? supabase
          .from("game_results")
          .select("player_id, rank, points, score, chips")
          .eq("game_id", gameId)
          .order("rank")
      : null,
  ]);
  const names = new Map(
    (profiles.data ?? []).map((profile) => [profile.id, profile.display_name]),
  );

  return {
    ...room,
    members: memberRows.map((member) => ({
      userId: member.user_id,
      name: names.get(member.user_id) ?? "（不明）",
      rematchReady: member.rematch_ready,
    })),
    gameId,
    results: (results?.data ?? []).map((row) => ({
      userId: row.player_id,
      rank: row.rank,
      points: row.points,
      score: row.score,
      chips: row.chips,
    })),
  };
}
