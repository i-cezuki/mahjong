// 3人分のユーザーでAPIとRealtimeを通して1半荘を最後まで進める、通信の検証用スクリプト。
// ローカルのSupabase専用（テスト用のユーザーを作る）。
//
//   npx supabase start && npm run dev
//   node --env-file=.env.local scripts/play-hanchan.mjs [アプリのURL]
//
// 合法手の判定はしない。画面データに入っている「可能な操作」からランダムに選ぶだけ。

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { tileOf } from "../src/engine/tiles.ts";

const APP_URL = process.argv[2] ?? "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const PASSWORD = "play-hanchan-local-only";
const NAMES = ["けんしょうA", "けんしょうB", "けんしょうC", "けんしょうD"];

if (!SUPABASE_URL || !PUBLISHABLE_KEY || !SECRET_KEY) {
  throw new Error(
    "環境変数がありません。--env-file=.env.local を付けてください",
  );
}
if (!/\/\/(127\.0\.0\.1|localhost)[:/]/.test(SUPABASE_URL)) {
  throw new Error(
    "このスクリプトはローカルのSupabase専用です（テスト用のユーザーを作るため）",
  );
}

const admin = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let failures = 0;
function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  ok  ${label}`);
  } else {
    failures++;
    console.log(`  NG  ${label} ${detail}`);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** テスト用のユーザーを作り直し、承認済みにしてログインする。 */
async function createPlayer(index) {
  const email = `play-hanchan-${index}@example.test`;
  const name = NAMES[index];

  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = list.users.find((user) => user.email === email);
  if (existing) {
    // 前回の実行で作ったルーム（対局と結果も一緒に消える）を先に消す
    await admin.from("rooms").delete().eq("created_by", existing.id);
    const removed = await admin.auth.admin.deleteUser(existing.id);
    if (removed.error) throw removed.error;
  }

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  const id = created.user.id;
  await admin
    .from("profiles")
    .update({ approved: true, display_name: name })
    .eq("id", id);

  // アプリと同じ形式のセッションCookieを作る
  const jar = new Map();
  const cookieClient = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const { name, value } of cookies) jar.set(name, value);
      },
    },
  });
  const signedIn = await cookieClient.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signedIn.error) throw signedIn.error;
  const cookie = [...jar]
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join("; ");

  // Realtimeの購読とRLSの確認に使う、本人としてのクライアント
  const supabase = createClient(SUPABASE_URL, PUBLISHABLE_KEY);
  const session = await supabase.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (session.error) throw session.error;

  return { index, id, name, cookie, supabase, version: -1, view: null };
}

async function api(player, method, path, body) {
  const started = performance.now();
  const response = await fetch(`${APP_URL}${path}`, {
    method,
    headers: {
      ...(player && { cookie: player.cookie }),
      ...(body !== undefined && { "content-type": "application/json" }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const json = await response.json().catch(() => null);
  return {
    status: response.status,
    json,
    ms: performance.now() - started,
  };
}

function accept(player, version, view) {
  if (version > player.version) {
    player.version = version;
    player.view = view;
  }
}

async function refresh(player, gameId) {
  const { status, json } = await api(
    player,
    "GET",
    `/api/games/${gameId}/view`,
  );
  if (status !== 200) throw new Error(`画面データを取得できません: ${status}`);
  accept(player, json.version, json.view);
}

const stats = { realtime: 0, late: 0, actions: 0, ms: [], realtimeMs: [] };

function subscribe(player, gameId) {
  return new Promise((resolve, reject) => {
    player.channel = player.supabase
      .channel(`game:${gameId}:${player.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "game_views",
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          stats.realtime++;
          player.received.push(payload.new);
          accept(player, payload.new.version, payload.new.view);
        },
      )
      .subscribe((status, error) => {
        if (status === "SUBSCRIBED") resolve();
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          reject(error ?? new Error(status));
        }
      });
  });
}

/** 3人のRealtimeが指定の版番号に届くまで待つ。届かなければ取り直す。 */
async function waitForVersion(players, gameId, version) {
  const started = performance.now();
  const deadline = Date.now() + 5000;
  while (players.some((player) => player.version < version)) {
    if (Date.now() > deadline) {
      stats.late++;
      console.log(
        `  通知が届かない: 版 ${version}、届いている版 ${players.map((p) => p.version).join(",")}、状態 ${players.map((p) => p.channel.state).join(",")}`,
      );
      await Promise.all(players.map((player) => refresh(player, gameId)));
      return;
    }
    await sleep(5);
  }
  stats.realtimeMs.push(performance.now() - started);
}

/** 同じ牌や隣の牌が手牌にどれだけあるか。孤立した牌ほど小さい。 */
function connectivity(hand, tile) {
  const kind = tileOf(tile).kind;
  const rank = Number(kind[0]);
  const suit = kind[1];
  let score = 0;
  for (const other of hand) {
    if (other === tile) continue;
    const otherKind = tileOf(other).kind;
    if (otherKind === kind) score += 3;
    else if (suit !== "z" && otherKind[1] === suit) {
      const gap = Math.abs(Number(otherKind[0]) - rank);
      if (gap === 1) score += 2;
      else if (gap === 2) score += 1;
    }
  }
  return score;
}

function pickAction(actions, hand) {
  const of = (...types) => actions.filter((a) => types.includes(a.type));
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const chance = (percent) => Math.random() * 100 < percent;

  if (of("confirm", "dice").length > 0) return pick(actions);
  if (of("tsumo", "ron").length > 0) return pick(of("tsumo", "ron"));
  if (of("riichi").length > 0 && chance(60)) return pick(of("riichi"));
  if (of("ankan", "kakan", "minkan").length > 0 && chance(50)) {
    return pick(of("ankan", "kakan", "minkan"));
  }
  if (of("pon").length > 0 && chance(30)) return pick(of("pon"));
  if (of("pass").length > 0) return pick(of("pass"));

  // 孤立した牌から切る（でたらめに切ると誰も和了できず、3人同点のサドンデスが終わらない）
  const scored = of("discard").map((action) => ({
    action,
    score: connectivity(hand, action.tile),
  }));
  const lowest = Math.min(...scored.map((s) => s.score));
  return pick(scored.filter((s) => s.score === lowest)).action;
}

async function currentGameId(player) {
  const { data, error } = await player.supabase
    .from("games")
    .select("id")
    .eq("status", "playing")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

async function playGame(players, gameId, outsider) {
  for (const player of players) {
    player.version = -1;
    player.view = null;
    player.received = [];
    await subscribe(player, gameId);
    await refresh(player, gameId);
  }

  console.log("不正な要求");
  {
    const turn = players.find((p) => p.view.actions.length > 0);
    const other = players.find((p) => p.view.actions.length === 0);
    const action = turn.view.actions.find((a) => a.type === "discard");
    const path = `/api/games/${gameId}/actions`;

    const noCookie = await api(null, "POST", path, { version: 0, action });
    check("未ログインは401", noCookie.status === 401, noCookie.status);
    const outside = await api(outsider, "POST", path, { version: 0, action });
    check("参加者以外は404", outside.status === 404, outside.status);
    const outsideView = await api(outsider, "GET", `/api/games/${gameId}/view`);
    check(
      "参加者以外は画面データを読めない",
      outsideView.status === 404,
      outsideView.status,
    );
    const notTurn = await api(other, "POST", path, {
      version: other.version,
      action,
    });
    check("手番でない人の操作は422", notTurn.status === 422, notTurn.status);
    const stale = await api(turn, "POST", path, {
      version: turn.version - 1,
      action,
    });
    check("古い版番号は409", stale.status === 409, stale.status);
    const broken = await api(turn, "POST", path, {
      version: turn.version,
      action: { type: "discard", tile: "x" },
    });
    check("形のおかしい操作は400", broken.status === 400, broken.status);
    const foreign = await api(turn, "POST", path, {
      version: turn.version,
      action: { type: "discard", tile: firstTileNotIn(turn.view.hand) },
    });
    check("持っていない牌の打牌は422", foreign.status === 422, foreign.status);

    // 同じ操作を同時に2回送っても、通るのは1回だけ
    const body = { version: turn.version, action };
    const [first, second] = await Promise.all([
      api(turn, "POST", path, body),
      api(turn, "POST", path, body),
    ]);
    const statuses = [first.status, second.status].sort();
    check(
      "二重送信は片方だけ通る",
      statuses[0] === 200 && statuses[1] === 409,
      statuses.join(","),
    );
    const winner = first.status === 200 ? first : second;
    accept(turn, winner.json.version, winner.json.view);
    await waitForVersion(players, gameId, winner.json.version);
  }

  console.log("対局");
  let rounds = 0;
  for (;;) {
    const view = players[0].view;
    if (view.phase === "ended") break;

    const actor = players.find((p) => p.view.actions.length > 0);
    if (!actor) throw new Error("誰にも可能な操作がありません");
    const action = pickAction(actor.view.actions, actor.view.hand);
    if (action.type === "confirm" && actor.view.confirmed.every((c) => !c)) {
      rounds++;
    }

    const result = await api(actor, "POST", `/api/games/${gameId}/actions`, {
      version: actor.version,
      action,
    });
    if (result.status === 409) {
      await refresh(actor, gameId);
      continue;
    }
    if (result.status !== 200) {
      throw new Error(
        `操作が拒否されました: ${result.status} ${JSON.stringify(result.json)} ${JSON.stringify(action)}`,
      );
    }
    stats.actions++;
    stats.ms.push(result.ms);
    accept(actor, result.json.version, result.json.view);
    await waitForVersion(players, gameId, result.json.version);
    if (stats.actions % 200 === 0) {
      console.log(`  ${stats.actions} 手、${rounds} 局`);
    }
  }

  console.log("Realtimeで届いた内容");
  for (const player of players) {
    check(
      `${player.name}に届いたのは自分の席の画面データだけ`,
      player.received.length > 0 &&
        player.received.every(
          (row) =>
            row.player_id === player.id && row.view.seat === player.view.seat,
        ),
    );
  }
  for (const player of players) await player.supabase.removeAllChannels();
  return rounds + 1;
}

function firstTileNotIn(hand) {
  for (let tile = 0; tile < 112; tile++) {
    if (!hand.includes(tile)) return tile;
  }
  throw new Error("unreachable");
}

async function main() {
  console.log(`アプリ: ${APP_URL}`);
  const all = [];
  for (let i = 0; i < 4; i++) all.push(await createPlayer(i));
  const players = all.slice(0, 3);
  const outsider = all[3];
  const [a, b, c] = players;

  console.log("ルーム");
  const created = await api(a, "POST", "/api/rooms");
  check("ルームを作れる", created.status === 201, created.status);
  const code = created.json.code;
  const again = await api(a, "POST", "/api/rooms");
  check(
    "参加中は別のルームを作れない",
    again.status === 409 && again.json.code === code,
    again.status,
  );
  const missing = await api(b, "POST", "/api/rooms/join", { code: "ZZZZZ9" });
  check("存在しないコードは404", missing.status === 404, missing.status);
  const joinB = await api(b, "POST", "/api/rooms/join", {
    code: code.toLowerCase(),
  });
  check("小文字のコードでも参加できる", joinB.status === 200, joinB.status);

  const { data: room } = await a.supabase
    .from("rooms")
    .select("id, status")
    .eq("code", code)
    .single();
  const left = await api(b, "POST", `/api/rooms/${room.id}/leave`);
  check("待機中は抜けられる", left.status === 200, left.status);
  await api(b, "POST", "/api/rooms/join", { code });
  check("2人ではまだ始まらない", (await currentGameId(a)) === null);

  const joinC = await api(c, "POST", "/api/rooms/join", { code });
  check("3人目が参加できる", joinC.status === 200, joinC.status);
  const joinD = await api(outsider, "POST", "/api/rooms/join", { code });
  check("4人目は参加できない", joinD.status === 409, joinD.status);

  const gameId = await currentGameId(a);
  check("3人そろったら対局が始まる", gameId !== null);
  const leaveInGame = await api(a, "POST", `/api/rooms/${room.id}/leave`);
  check("対局中は抜けられない", leaveInGame.status === 409, leaveInGame.status);

  const { data: secrets, error: secretsError } = await a.supabase
    .from("game_secrets")
    .select("game_id");
  check(
    "game_secrets は参加者でも読めない",
    secretsError !== null || secrets.length === 0,
  );
  const { data: liveEvents } = await a.supabase
    .from("game_events")
    .select("seq")
    .eq("game_id", gameId);
  check("進行中の牌譜は読めない", (liveEvents ?? []).length === 0);

  const started = Date.now();
  const rounds = await playGame(players, gameId, outsider);
  const seconds = (Date.now() - started) / 1000;

  console.log("終局");
  const { data: results } = await a.supabase
    .from("game_results")
    .select("seat, rank, points, score, chips")
    .eq("game_id", gameId)
    .order("rank");
  check("3人分の結果が記録される", results?.length === 3);
  const sum = (key) => results.reduce((total, row) => total + row[key], 0);
  check("最終持ち点の合計は90000点", sum("points") === 90000, sum("points"));
  check("スコアの合計は0", sum("score") === 0, sum("score"));
  check("祝儀の合計は0", sum("chips") === 0, sum("chips"));
  console.table(results);

  const { data: events } = await a.supabase
    .from("game_events")
    .select("seq")
    .eq("game_id", gameId);
  check("終了後は参加者が牌譜を読める", (events ?? []).length > 0);
  const { data: outsiderEvents } = await outsider.supabase
    .from("game_events")
    .select("seq")
    .eq("game_id", gameId);
  check("部外者は牌譜を読めない", (outsiderEvents ?? []).length === 0);
  const finishedAction = await api(a, "POST", `/api/games/${gameId}/actions`, {
    version: a.version,
    action: { type: "pass" },
  });
  check(
    "終わった対局には操作できない",
    finishedAction.status === 409,
    finishedAction.status,
  );

  console.log("再戦");
  for (const player of [a, b]) {
    const rematch = await api(player, "POST", `/api/rooms/${room.id}/rematch`);
    check(`${player.name}が再戦を押せる`, rematch.status === 200);
  }
  check("2人ではまだ始まらない", (await currentGameId(a)) === null);
  await api(c, "POST", `/api/rooms/${room.id}/rematch`);
  const secondGame = await currentGameId(a);
  check(
    "3人が押すと次の対局が始まる",
    secondGame !== null && secondGame !== gameId,
  );

  const sorted = [...stats.ms].sort((x, y) => x - y);
  const at = (q) => Math.round(sorted[Math.floor(sorted.length * q)] ?? 0);
  console.log("計測");
  console.log(
    `  局数: ${rounds}、操作: ${stats.actions} 回、${seconds.toFixed(1)} 秒`,
  );
  console.log(
    `  操作の応答時間: 中央値 ${at(0.5)}ms、95% ${at(0.95)}ms、最大 ${at(0.999)}ms`,
  );
  const realtime = [...stats.realtimeMs].sort((x, y) => x - y);
  const rt = (q) => Math.round(realtime[Math.floor(realtime.length * q)] ?? 0);
  console.log(
    `  応答から3人全員に通知が届くまで: 中央値 ${rt(0.5)}ms、95% ${rt(0.95)}ms、最大 ${rt(0.999)}ms`,
  );
  console.log(
    `  Realtimeで届いた通知: ${stats.realtime} 件（5秒以内に届かなかった回数: ${stats.late}）`,
  );
  check("Realtimeの通知がすべて届いた", stats.late === 0, stats.late);

  // 作ったルーム（対局と結果も一緒に消える）とユーザーを片付ける
  for (const player of all) {
    await player.supabase.removeAllChannels();
    await admin.from("rooms").delete().eq("created_by", player.id);
  }
  for (const player of all) await admin.auth.admin.deleteUser(player.id);

  console.log(failures === 0 ? "すべて成功" : `失敗: ${failures} 件`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
