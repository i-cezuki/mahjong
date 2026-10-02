# フェーズ8 持ち時間、切断、再接続 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 手番、応答、サイコロの指定、局の結果に期限を付けて時間切れを自動で処理し、いなくなった人を即ツモ切りにし、放置された対局を破棄する。

**Architecture:** 時間のルールは純粋な関数 `src/server/clock.ts` にまとめ、エンジンの外側（`TableState.clock`）に状態を持つ。サーバーは保存のたびに期限を記録して画面データに入れ、期限を過ぎたら画面を開いている誰かが `/tick` を送り、サーバーが自分の時計で確かめて処理する。破棄はPostgres関数1つで行い、ページを開いたときと1日1回の GitHub Actions から呼ぶ。

**Tech Stack:** Next.js 16.3.8（App Router）、React 19.2、TypeScript strict、Vitest、Supabase（Postgres、pgTAP）、GitHub Actions

**Spec:** `docs/superpowers/specs/2026-10-02-phase8-timers-design.md`（全体の仕様は `docs/SPEC.md`）

## Global Constraints

- エンジン（`src/engine/`）は変えない。エンジンは時刻を知らないままにする。
- `src/server/clock.ts` と `src/server/table.ts` は純粋に保つ。`Date.now()`、`Math.random()`、`server-only` を書かない（`/dev/table` がブラウザで読み込むため）。現在時刻と乱数は引数で受け取る。
- 時間の値：手番の基本5秒、持ち時間20秒（局ごとに回復）、応答15秒、サイコロの指定20秒、局の結果15秒、対局の最初の手番に+10秒、サイコロ1振りの演出2.2秒（転がる1.2秒＋見せる1.0秒）、破棄は最後の保存から10分。
- 切断は検知しない。時間切れだけで判定する。
- 合法手はクライアントで判定しない。`view.actions` に `resume` は入れない（画面は `view.auto` を見て復帰のタップを出す）。
- DBの列は増やさない。依存パッケージを増やさない。有料サービスを使わない。
- コードのコメントと画面の文言は日本語。既存のコメントの密度と書き方に合わせる。コミットメッセージは英語（`feat(server): ...` の形）で、末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` を付ける。
- Next.js はこのリポジトリの版に合わせる。ルートやページを書く前に `node_modules/next/dist/docs/01-app/` の該当ページを読む（`AGENTS.md`）。既存の `src/app/api/games/[id]/actions/route.ts` と同じ書き方にする。
- 各タスクの終わりに `npm run typecheck && npm run lint && npm run test` を通し、変えたファイルに `npx prettier --write` をかけてからコミットする。
- ブランチは `phase-8-timers`。main には直接コミットしない。本番DBへの `npx supabase db push` と main へのマージは、ユーザーの確認を取ってから行う。

## ファイルの構成

| ファイル                                                                   | 役割                                                               |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `src/lib/timing.ts`（新規）                                                | サーバーと画面で共有する時間の定数                                 |
| `src/server/table.ts`                                                      | `Clock`、`PlayAction`、`resume` の型。画面データに時計の項目を足す |
| `src/server/clock.ts`（新規、＋test）                                      | 時間のルール（期限、持ち時間、時間切れ、自動の人の連続処理、復帰） |
| `src/server/games.ts`                                                      | 読込と保存の共通化、`submitTick`、`abandonStaleGames`、`serverNow` |
| `src/app/api/games/[id]/tick/route.ts`（新規）                             | 時間切れの申告                                                     |
| `src/server/cron-rules.ts`（新規、＋test）                                 | 定期実行の秘密の値の照合                                           |
| `src/app/api/cron/route.ts`（新規）                                        | 定期実行から呼ばれ、放置対局を破棄する                             |
| `src/server/env.ts`、`.env.example`                                        | `CRON_SECRET`                                                      |
| `supabase/migrations/20261002020000_abandon_stale_games.sql`               | `abandon_stale_games` 関数                                         |
| `supabase/tests/database/abandon.test.sql`（新規）                         | 破棄のテスト                                                       |
| `src/server/database.types.ts`                                             | 型の再生成                                                         |
| `.github/workflows/cron.yml`（新規）                                       | 1日1回 `/api/cron` を呼ぶ                                          |
| `src/app/games/[id]/logic/clock.ts`（新規、＋test）                        | 画面側の純粋な計算（項目の補完、時計の差、表示、申告までの間）     |
| `src/app/games/[id]/use-clock.ts`（新規）                                  | サーバーの時刻の見積もりと、時間切れの申告                         |
| `src/app/games/[id]/table/clock-badge.tsx`（新規）                         | 残り時間の表示                                                     |
| `src/app/games/[id]/table/table-screen.tsx`                                | 残り時間、「自動」、復帰のタップ                                   |
| `src/app/games/[id]/table/use-dice-playback.ts`                            | 演出の長さを `timing.ts` から読む                                  |
| `src/app/games/[id]/use-game-view.ts`、`game-client.tsx`                   | 項目の補完、`/tick` の送信、終わった対局への操作で読み込み直す     |
| `src/app/games/[id]/page.tsx`、`src/app/page.tsx`、`rooms/[code]/page.tsx` | 開いたときの破棄、破棄された対局の案内                             |
| `src/app/dev/table/sandbox.tsx`                                            | 同じ時計をブラウザで動かす                                         |
| `scripts/play-hanchan.mjs`                                                 | 1人が操作をやめても半荘が終わることの検証                          |
| `docs/SPEC.md`                                                             | 決めた内容の反映                                                   |

---

### Task 1: 時間の定数と、時計の型・画面データ

**Files:**

- Create: `src/lib/timing.ts`
- Modify: `src/server/table.ts`、`src/server/table.test.ts`、`src/server/games.ts`（一時的な1行）、`src/app/dev/table/sandbox.tsx`（型だけ）、`src/app/games/[id]/table/use-dice-playback.ts`

**Interfaces:**

- Produces（`src/lib/timing.ts`）: `TURN_BASE_MS`、`BANK_MS`、`RESPONSE_MS`、`DICE_CHOICE_MS`、`RESULT_MS`、`FIRST_TURN_GRACE_MS`、`DICE_ROLL_MS`、`DICE_SHOW_MS`、`DICE_STEP_MS`（すべて `number`、ミリ秒）
- Produces（`src/server/table.ts`）:
  - `interface Clock { savedAt: number; deadline: number | null; bank: PerSeat<number>; auto: PerSeat<boolean> }`
  - `TableState.clock?: Clock`
  - `type PlayAction = Action | { type: "confirm"; seat: Seat }`
  - `type TableAction = PlayAction | { type: "resume"; seat: Seat }`
  - `applyTableAction(table: TableState, action: PlayAction, nextSeed: () => string): TableStep`（`clock` を引き継ぐ）
  - `actionsFor(table: TableState, seat: Seat): PlayAction[]`（export する）
  - `PlayerView` に `deadline: number | null`、`serverNow: number`、`bank: number`、`auto: PerSeat<boolean>`。`actions` は `PlayAction[]`
  - `parseAction` が `{ type: "resume" }` を受け付ける

- [ ] **Step 1: 定数のファイルを作る**

`src/lib/timing.ts`:

```ts
/** サーバーと画面で共有する時間の定数。単位はミリ秒。 */

/** 手番の基本の時間。これを超えた分だけ持ち時間が減る */
export const TURN_BASE_MS = 5_000;
/** 局ごとの持ち時間。局が変わると戻る */
export const BANK_MS = 20_000;
/** 他家の打牌への応答 */
export const RESPONSE_MS = 15_000;
/** サイコロの出目の指定 */
export const DICE_CHOICE_MS = 20_000;
/** 局の結果の表示 */
export const RESULT_MS = 15_000;
/** 対局の最初の手番に足す時間（ルームから卓の画面へ移る分） */
export const FIRST_TURN_GRACE_MS = 10_000;

/** サイコロが転がっている時間 */
export const DICE_ROLL_MS = 1_200;
/** 止まった出目と当たり外れを見せる時間 */
export const DICE_SHOW_MS = 1_000;
/** サイコロ1振りの演出の長さ。演出のあとの期限に足す */
export const DICE_STEP_MS = DICE_ROLL_MS + DICE_SHOW_MS;
```

`src/app/games/[id]/table/use-dice-playback.ts` の `ROLL_MS` と `SHOW_MS` の定義（コメントごと）を消し、`import { DICE_ROLL_MS, DICE_SHOW_MS } from "@/lib/timing";` を足して、`position.rolling ? ROLL_MS : SHOW_MS` を `position.rolling ? DICE_ROLL_MS : DICE_SHOW_MS` に変える。

- [ ] **Step 2: 失敗するテストを書く**

`src/server/table.test.ts` の `VIEW_KEYS` を次に置き換える（4つ増える）:

```ts
const VIEW_KEYS = [
  "actions",
  "auto",
  "bank",
  "chips",
  "confirmed",
  "deadline",
  "dealer",
  "dice",
  "diceChance",
  "doraIndicators",
  "drawn",
  "flowers",
  "hand",
  "handCounts",
  "honba",
  "kyotaku",
  "lastDiscard",
  "melds",
  "outcome",
  "phase",
  "points",
  "result",
  "revealed",
  "riichi",
  "rivers",
  "roundIndex",
  "roundPhase",
  "roundWind",
  "seat",
  "serverNow",
  "turn",
  "wallCount",
];
```

ファイルの末尾（`parseAction` の `describe` の前）に足す:

```ts
describe("持ち時間の項目", () => {
  it("clock がなければ、期限なし・自動なしとして出す", () => {
    const { table } = startTable({ seed: seedOf(2) });
    const view = buildView(table, 1);
    expect(view.deadline).toBeNull();
    expect(view.serverNow).toBe(0);
    expect(view.bank).toBe(0);
    expect(view.auto).toEqual([false, false, false]);
  });

  it("期限、保存した時刻、自分の持ち時間、3人の自動を出す。他人の持ち時間は出さない", () => {
    const start = startTable({ seed: seedOf(2) }).table;
    const table: TableState = {
      ...start,
      clock: {
        savedAt: 5_000,
        deadline: 9_000,
        bank: [11_111, 22_222, 33_333],
        auto: [false, true, false],
      },
    };
    const view = buildView(table, 1);
    expect(view.deadline).toBe(9_000);
    expect(view.serverNow).toBe(5_000);
    expect(view.bank).toBe(22_222);
    expect(view.auto).toEqual([false, true, false]);
    expect(JSON.stringify(view)).not.toContain("11111");
    expect(JSON.stringify(view)).not.toContain("33333");
  });

  it("次の局へ進んでも clock を引き継ぐ", () => {
    // 親（席0）の天和
    const round = startRoundFromDeck(
      buildDeck({
        hands: [
          "123p456p789s111s4z",
          "19m258p36s4s23z567z",
          "19m369p25s7s23z567z",
        ],
        live: "4z",
      }),
      { dealer: 0 },
    ).state;
    const start = startTable({ seed: seedOf(1) }).table;
    const clock = {
      savedAt: 1,
      deadline: 2,
      bank: [3, 4, 5] as [number, number, number],
      auto: [false, false, false] as [boolean, boolean, boolean],
    };
    let table: TableState = { ...start, game: { ...start.game, round }, clock };
    const next = () => seedOf(2);
    table = applyTableAction(table, { type: "tsumo", seat: 0 }, next).table;
    table = applyTableAction(
      table,
      { type: "dice", seat: 0, faces: [1, 2] },
      next,
    ).table;
    for (const seat of SEATS) {
      table = applyTableAction(table, { type: "confirm", seat }, next).table;
    }
    expect(table.game.round.phase).toBe("awaitTurnAction");
    expect(table.clock).toEqual(clock);
  });
});
```

`parseAction` の `describe` の中に足す:

```ts
it("復帰（resume）を受け付ける", () => {
  expect(parseAction({ type: "resume" }, 2)).toEqual({
    type: "resume",
    seat: 2,
  });
});
```

- [ ] **Step 3: テストが失敗することを確かめる**

Run: `npx vitest run src/server/table.test.ts`
Expected: FAIL（`VIEW_KEYS` の不一致、`view.deadline` が `undefined`、`table.clock` が `undefined`、`resume` が `null`）

- [ ] **Step 4: `src/server/table.ts` を直す**

`TableState` の前に足し、`TableState` に `clock` を足す:

```ts
/** 持ち時間の状態。ルールは clock.ts にある。 */
export interface Clock {
  /** この状態を保存したサーバーの時刻（エポックms） */
  savedAt: number;
  /** いま待っている操作の期限（エポックms）。待っていなければ null */
  deadline: number | null;
  /** 残り持ち時間（ms）。局が変わると戻る */
  bank: PerSeat<number>;
  /** 即ツモ切り中。時間切れでなり、本人の操作で解除する */
  auto: PerSeat<boolean>;
}
```

```ts
export interface TableState {
  game: GameState;
  /** 局の結果を確認した人。3人そろったら次の局へ進む。 */
  confirmed: PerSeat<boolean>;
  /** この局で振ったサイコロの結果 */
  dice: DiceResult[];
  /** フェーズ8より前に始まった対局にはない。次の操作のときに clock.ts が補う。 */
  clock?: Clock;
}
```

`TableAction` の定義を置き換える:

```ts
/** 対局を進める操作。confirm は局の結果の確認。 */
export type PlayAction = Action | { type: "confirm"; seat: Seat };

/** クライアントが送れる操作。resume は即ツモ切りの解除（clock.ts が扱う）。 */
export type TableAction = PlayAction | { type: "resume"; seat: Seat };
```

`PlayerView` の `actions` の型を `PlayAction[]` にし、`result` の下に足す:

```ts
/** いま待っている操作の期限（サーバーの時刻、エポックms）。待っていなければ null */
deadline: number | null;
/** この画面データを保存したサーバーの時刻。画面はこれとの差で残り時間を計算する */
serverNow: number;
/** 自分の残り持ち時間（ms） */
bank: number;
/** 即ツモ切り中の人 */
auto: PerSeat<boolean>;
```

`applyTableAction` の引数の型を `action: PlayAction` にし、次の局を始める最後の `return` を `clock` が消えない形にする:

```ts
return {
  table: {
    ...table,
    game: step.state,
    confirmed: [false, false, false],
    dice: [],
  },
  events: [{ type: "seed", seed }, ...step.events],
};
```

`actionsFor` を export し、戻り値を `PlayAction[]` にする:

```ts
/** その席がいまできる操作。局の結果では確認、それ以外はエンジンの合法手。 */
export function actionsFor(table: TableState, seat: Seat): PlayAction[] {
```

`buildView` の `result: game.result,` の下に足す:

```ts
    deadline: table.clock?.deadline ?? null,
    serverNow: table.clock?.savedAt ?? 0,
    bank: table.clock?.bank[seat] ?? 0,
    auto: table.clock?.auto ?? [false, false, false],
```

`parseAction` の最初の `case` の並びに `case "resume":` を足す（`confirm` の下）。

- [ ] **Step 5: 型が通るように呼び出し側を合わせる**

`src/server/games.ts` の `if (!action) return { ok: false, error: "invalid" };` の下に足す（Task 3 で消す）:

```ts
// resume は時計（clock.ts）が扱う。つなぐまでは受け付けない
if (action.type === "resume") return { ok: false, error: "illegal" };
```

`src/app/dev/table/sandbox.tsx`（Task 6 で作り直すので、ここでは型だけ）:

- import に `PlayAction` を足す。
- `botAction` を `function botAction(actions: readonly PlayAction[]): PlayAction` にし、中の `of` を `(type: PlayAction["type"])` にする。
- `step` を `function step(table: TableState, action: PlayAction): TableState` にする。
- `send` の `if (action.type === "confirm") setFake(null);` の上に `if (action.type === "resume") return;` を足す。

- [ ] **Step 6: 通ることを確かめる**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: すべて PASS

- [ ] **Step 7: コミット**

```bash
npx prettier --write src/lib/timing.ts src/server/table.ts src/server/table.test.ts src/server/games.ts src/app/dev/table/sandbox.tsx "src/app/games/[id]/table/use-dice-playback.ts"
git add -A src
git commit -m "feat(server): add clock fields to the table state and player view"
```

---

### Task 2: 時間のルール（`clock.ts`）

**Files:**

- Create: `src/server/clock.ts`、`src/server/clock.test.ts`

**Interfaces:**

- Consumes: Task 1 の `Clock`、`PlayAction`、`TableAction`、`TableEvent`、`TableState`、`actionsFor`、`applyTableAction`、`src/lib/timing.ts` の定数
- Produces:
  - `interface ClockContext { now: number; nextSeed: () => string; pick: (count: number) => number }`
  - `type TimedTable = TableState & { clock: Clock }`
  - `interface TimedStep { table: TimedTable; events: TableEvent[] }`
  - `startClock(table: TableState, now: number): TimedTable`
  - `applyTimed(table: TableState, action: TableAction, ctx: ClockContext): TimedStep`（不正な操作は `IllegalActionError`）
  - `applyTimeout(table: TableState, ctx: ClockContext): TimedStep`（期限前、期限なしは `IllegalActionError`）

- [ ] **Step 1: 失敗するテストを書く**

`src/server/clock.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  IllegalActionError,
  SEATS,
  diceFaceChoices,
  startRoundFromDeck,
  tileOf,
} from "@/engine";
import type { Seat } from "@/engine";
import { buildDeck, seedOf } from "@/engine/testing";
import { applyTimed, applyTimeout, startClock } from "./clock";
import type { ClockContext, TimedTable } from "./clock";
import { actionsFor, startTable } from "./table";
import type { PlayAction, TableState } from "./table";

const T0 = 1_000_000;

function ctx(now: number, pick: (count: number) => number = () => 0) {
  let n = 0;
  const context: ClockContext = {
    now,
    nextSeed: () => seedOf(900 + ++n),
    pick,
  };
  return context;
}

function start(seed = 1): TimedTable {
  return startClock(startTable({ seed: seedOf(seed) }).table, T0);
}

function withRound(deck: Parameters<typeof buildDeck>[0]): TimedTable {
  const round = startRoundFromDeck(buildDeck(deck), { dealer: 0 }).state;
  const base = startTable({ seed: seedOf(1) }).table;
  return startClock({ ...base, game: { ...base.game, round } }, T0);
}

/** 親（席0）が天和できる局。和了するとサイコロチャンスになる。 */
const tenhou = () =>
  withRound({
    hands: ["123p456p789s111s4z", "19m258p36s4s23z567z", "19m369p25s7s23z567z"],
    live: "4z",
  });

/** 席0が東を切ると、席1がポンできる局。 */
const ponnable = () =>
  withRound({
    hands: [
      "123456789p 234s 1z",
      "11z 19m 147p 268s 234z",
      "19m 258p 147s 23467z",
    ],
    live: "7z",
  });

const discardsOf = (table: TableState, seat: Seat) =>
  actionsFor(table, seat).filter(
    (a): a is Extract<PlayAction, { type: "discard" }> => a.type === "discard",
  );

/** 待たれている人のうち自動でない1人が、和了も鳴きもせずに進める。 */
function advance(table: TimedTable, now: number): TimedTable {
  const seat = SEATS.find(
    (s) => actionsFor(table, s).length > 0 && !table.clock.auto[s],
  );
  if (seat === undefined) throw new Error("待たれている人がいません");
  const actions = actionsFor(table, seat);
  const discards = discardsOf(table, seat);
  const action =
    actions.find((a) => a.type === "confirm") ??
    actions.find((a) => a.type === "pass") ??
    discards[discards.length - 1] ??
    actions[0]!;
  return applyTimed(table, action, ctx(now)).table;
}

describe("startClock（対局の開始）", () => {
  it("持ち時間は20秒ずつ、最初の手番は5秒＋20秒＋10秒", () => {
    const table = start();
    expect(table.clock).toEqual({
      savedAt: T0,
      deadline: T0 + 35_000,
      bank: [20_000, 20_000, 20_000],
      auto: [false, false, false],
    });
  });
});

describe("applyTimed（操作）", () => {
  it("基本の時間のうちに切れば、持ち時間は減らない", () => {
    const table = start();
    const next = applyTimed(
      table,
      discardsOf(table, 0)[0]!,
      ctx(T0 + 14_000),
    ).table;
    expect(next.clock.bank).toEqual([20_000, 20_000, 20_000]);
    expect(next.clock.savedAt).toBe(T0 + 14_000);
  });

  it("基本の時間を超えた分だけ持ち時間が減る", () => {
    const table = start();
    // 最初の手番は15秒までが基本。22秒で切ると7秒減る
    const next = applyTimed(
      table,
      discardsOf(table, 0)[0]!,
      ctx(T0 + 22_000),
    ).table;
    expect(next.clock.bank).toEqual([13_000, 20_000, 20_000]);
  });

  it("期限を過ぎていても、時間切れが処理される前の操作は受け付ける", () => {
    const table = start();
    const next = applyTimed(
      table,
      discardsOf(table, 0)[0]!,
      ctx(T0 + 40_000),
    ).table;
    expect(next.game.round.rivers[0]).toHaveLength(1);
    expect(next.clock.bank[0]).toBe(0);
    expect(next.clock.auto).toEqual([false, false, false]);
  });

  it("次の待ちの期限は場面で決まる（応答は15秒、手番は5秒＋持ち時間）", () => {
    const table = ponnable();
    const east = discardsOf(table, 0).find(
      (a) => tileOf(a.tile).kind === "1z",
    )!;
    const waiting = applyTimed(table, east, ctx(T0 + 1_000)).table;
    expect(waiting.game.round.phase).toBe("awaitResponses");
    expect(waiting.clock.deadline).toBe(T0 + 1_000 + 15_000);

    const passed = applyTimed(
      waiting,
      { type: "pass", seat: 1 },
      ctx(T0 + 2_000),
    ).table;
    expect(passed.game.round.phase).toBe("awaitTurnAction");
    expect(passed.game.round.turn).toBe(1);
    expect(passed.clock.deadline).toBe(T0 + 2_000 + 5_000 + 20_000);
  });

  it("不正な操作は IllegalActionError で、元の状態を書き換えない", () => {
    const table = start();
    const before = structuredClone(table);
    const tile = table.game.round.hands[1][0]!;
    expect(() =>
      applyTimed(table, { type: "discard", seat: 1, tile }, ctx(T0 + 30_000)),
    ).toThrow(IllegalActionError);
    applyTimed(table, discardsOf(table, 0)[0]!, ctx(T0 + 30_000));
    expect(table).toEqual(before);
  });

  it("clock のない状態には、操作のときに初期値を補う", () => {
    const legacy = startTable({ seed: seedOf(1) }).table;
    expect(() => applyTimeout(legacy, ctx(T0))).toThrow(IllegalActionError);
    const next = applyTimed(legacy, discardsOf(legacy, 0)[0]!, ctx(T0)).table;
    expect(next.clock.bank).toEqual([20_000, 20_000, 20_000]);
    expect(next.clock.deadline).not.toBeNull();
  });
});

describe("applyTimeout（時間切れ）", () => {
  it("期限前の申告は拒否する", () => {
    const table = start();
    expect(() => applyTimeout(table, ctx(T0 + 34_999))).toThrow(
      IllegalActionError,
    );
  });

  it("手番の時間切れはツモ切りで、その人は自動になり持ち時間がなくなる", () => {
    const table = start();
    const drawn = table.game.round.drawn;
    const before = structuredClone(table);
    const next = applyTimeout(table, ctx(T0 + 35_000)).table;
    expect(next.game.round.rivers[0]).toEqual([
      expect.objectContaining({ tile: drawn, tsumogiri: true }),
    ]);
    expect(next.clock.auto).toEqual([true, false, false]);
    expect(next.clock.bank[0]).toBe(0);
    expect(table).toEqual(before);
  });

  it("応答の時間切れはスルーで、自動になった人の手番も同じ処理の中で進む", () => {
    const table = ponnable();
    const east = discardsOf(table, 0).find(
      (a) => tileOf(a.tile).kind === "1z",
    )!;
    const waiting = applyTimed(table, east, ctx(T0 + 1_000)).table;
    const next = applyTimeout(waiting, ctx(T0 + 16_000)).table;
    expect(next.clock.auto).toEqual([false, true, false]);
    expect(next.game.round.melds[1]).toEqual([]);
    // スルーのあとの席1の手番は、待たずにツモ切りになる
    expect(next.game.round.rivers[1]).toEqual([
      expect.objectContaining({ tsumogiri: true }),
    ]);
    expect(actionsFor(next, 1)).toEqual([]);
  });

  it("ポン直後の時間切れは、切れる牌の右端を切る", () => {
    const table = ponnable();
    const east = discardsOf(table, 0).find(
      (a) => tileOf(a.tile).kind === "1z",
    )!;
    const waiting = applyTimed(table, east, ctx(T0 + 1_000)).table;
    const pon = actionsFor(waiting, 1).find((a) => a.type === "pon")!;
    const called = applyTimed(waiting, pon, ctx(T0 + 2_000)).table;
    expect(called.game.round.drawn).toBeNull();
    expect(called.clock.deadline).toBe(T0 + 2_000 + 25_000);

    const choices = discardsOf(called, 1);
    const next = applyTimeout(called, ctx(T0 + 27_000)).table;
    expect(next.game.round.rivers[1][0]!.tile).toBe(
      choices[choices.length - 1]!.tile,
    );
    expect(next.clock.auto[1]).toBe(true);
  });

  it("自動の人がいても、残りの2人の操作だけで次の局まで進む", () => {
    let table = applyTimeout(start(), ctx(T0 + 35_000)).table;
    let now = T0 + 36_000;
    let steps = 0;
    const sameRound = () =>
      table.game.phase === "playing" &&
      table.game.roundIndex === 0 &&
      table.game.honba === 0;
    while (sameRound()) {
      // 自動の席0が待たれることはない
      expect(actionsFor(table, 0)).toEqual([]);
      table = advance(table, (now += 1_000));
      if (++steps > 1_000) throw new Error("局が終わりません");
    }
    expect(table.clock.auto).toEqual([true, false, false]);
    if (table.game.phase === "playing") {
      expect(table.clock.bank).toEqual([20_000, 20_000, 20_000]);
    }
  });

  it("サイコロの指定は20秒。時間切れなら乱数で選び、その人は自動になる", () => {
    const table = tenhou();
    const chance = applyTimed(
      table,
      { type: "tsumo", seat: 0 },
      ctx(T0 + 1_000),
    ).table;
    expect(chance.game.round.phase).toBe("diceChance");
    expect(chance.clock.deadline).toBe(T0 + 1_000 + 20_000);

    const now = T0 + 21_000;
    const next = applyTimeout(
      chance,
      ctx(now, () => 3),
    ).table;
    expect(next.dice).toHaveLength(1);
    expect(next.dice[0]!.faces).toEqual(diceFaceChoices()[3]);
    expect(next.clock.auto).toEqual([true, false, false]);
    // 自動の人は局の結果を確認済みになる。残りの2人には、演出の長さを足した期限が付く
    expect(next.confirmed).toEqual([true, false, false]);
    expect(next.clock.deadline).toBe(
      now + 15_000 + next.dice[0]!.rolls.length * 2_200,
    );
  });

  it("局の結果は15秒で次の局へ進み、誰も自動にならず、持ち時間が戻る", () => {
    const chance = applyTimed(
      tenhou(),
      { type: "tsumo", seat: 0 },
      ctx(T0 + 1_000),
    ).table;
    const result = applyTimed(
      chance,
      { type: "dice", seat: 0, faces: [1, 2] },
      ctx(T0 + 2_000),
    ).table;
    const deadline = T0 + 2_000 + 15_000 + result.dice[0]!.rolls.length * 2_200;
    expect(result.clock.deadline).toBe(deadline);

    // 1人が確認しても期限は変わらない
    const one = applyTimed(
      result,
      { type: "confirm", seat: 1 },
      ctx(T0 + 3_000),
    ).table;
    expect(one.clock.deadline).toBe(deadline);
    expect(one.clock.savedAt).toBe(T0 + 3_000);

    const spent: TimedTable = {
      ...one,
      clock: { ...one.clock, bank: [1, 2, 3] },
    };
    const step = applyTimeout(spent, ctx(deadline));
    expect(step.events.some((event) => event.type === "roundStart")).toBe(true);
    expect(step.table.game.round.phase).toBe("awaitTurnAction");
    expect(step.table.confirmed).toEqual([false, false, false]);
    expect(step.table.clock.auto).toEqual([false, false, false]);
    expect(step.table.clock.bank).toEqual([20_000, 20_000, 20_000]);
    expect(step.table.clock.deadline).toBe(deadline + 25_000);
  });
});

describe("3人とも自動", () => {
  function frozen(): TimedTable {
    const base = start();
    const table: TimedTable = {
      ...base,
      clock: { ...base.clock, auto: [false, true, true] },
    };
    return applyTimeout(table, ctx(T0 + 35_000)).table;
  }

  it("進行を止めて、期限をなくす", () => {
    const table = frozen();
    expect(table.clock.auto).toEqual([true, true, true]);
    expect(table.clock.deadline).toBeNull();
    expect(table.game.round.rivers[0]).toEqual([]);
    expect(() => applyTimeout(table, ctx(T0 + 999_000))).toThrow(
      IllegalActionError,
    );
  });

  it("待たれている本人が復帰すると、5秒の期限で再開する", () => {
    const next = applyTimed(
      frozen(),
      { type: "resume", seat: 0 },
      ctx(T0 + 100_000),
    ).table;
    expect(next.clock.auto).toEqual([false, true, true]);
    expect(next.clock.deadline).toBe(T0 + 100_000 + 5_000);
    expect(actionsFor(next, 0).length).toBeGreaterThan(0);
  });

  it("ほかの人が復帰すると、自動の人の番を進めてから期限を付ける", () => {
    const next = applyTimed(
      frozen(),
      { type: "resume", seat: 1 },
      ctx(T0 + 100_000),
    ).table;
    expect(next.clock.auto).toEqual([true, false, true]);
    expect(next.game.round.rivers[0]).toHaveLength(1);
    expect(next.clock.deadline).not.toBeNull();
  });

  it("自動の人が自分で操作しても解除される", () => {
    const table = frozen();
    const next = applyTimed(
      table,
      discardsOf(table, 0)[0]!,
      ctx(T0 + 100_000),
    ).table;
    expect(next.clock.auto[0]).toBe(false);
    expect(next.game.round.rivers[0]).toHaveLength(1);
  });
});

describe("復帰（resume）", () => {
  it("自動でない人の復帰は拒否する", () => {
    expect(() =>
      applyTimed(start(), { type: "resume", seat: 1 }, ctx(T0 + 1_000)),
    ).toThrow(IllegalActionError);
  });

  it("待ちの途中で復帰しても、その待ちの期限は変えない", () => {
    const base = start();
    const table: TimedTable = {
      ...base,
      clock: { ...base.clock, auto: [false, true, false] },
    };
    const next = applyTimed(
      table,
      { type: "resume", seat: 1 },
      ctx(T0 + 1_000),
    ).table;
    expect(next.clock.auto).toEqual([false, false, false]);
    expect(next.clock.deadline).toBe(T0 + 35_000);
    expect(next.clock.savedAt).toBe(T0 + 1_000);
  });
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npx vitest run src/server/clock.test.ts`
Expected: FAIL（`./clock` が見つからない）

- [ ] **Step 3: `src/server/clock.ts` を書く**

```ts
import { IllegalActionError, SEATS } from "@/engine";
import type { PerSeat, Seat } from "@/engine";
import {
  BANK_MS,
  DICE_CHOICE_MS,
  DICE_STEP_MS,
  FIRST_TURN_GRACE_MS,
  RESPONSE_MS,
  RESULT_MS,
  TURN_BASE_MS,
} from "@/lib/timing";
import { actionsFor, applyTableAction } from "./table";
import type {
  Clock,
  PlayAction,
  TableAction,
  TableEvent,
  TableState,
} from "./table";

/*
 * 持ち時間のルール。エンジンは時刻を知らないので、ここで期限と自動処理を決める。
 * UI、DB、通信には依存しない。現在時刻と乱数は呼び出す側が渡す。
 */

export interface ClockContext {
  /** サーバーの現在時刻（エポックms） */
  now: number;
  /** 次の局を始めるときにだけ呼ぶ。新しい乱数の種を返す。 */
  nextSeed: () => string;
  /** 0 以上 count 未満の整数を返す乱数。サイコロの出目の自動指定に使う。 */
  pick: (count: number) => number;
}

export type TimedTable = TableState & { clock: Clock };

export interface TimedStep {
  table: TimedTable;
  events: TableEvent[];
}

const fullBank = (): PerSeat<number> => [BANK_MS, BANK_MS, BANK_MS];

/** 持ち時間が満ちていて、誰も自動でなく、まだ何も待っていない時計。 */
const newClock = (now: number): Clock => ({
  savedAt: now,
  deadline: null,
  bank: fullBank(),
  auto: [false, false, false],
});

/** 書き換えてよい写しを作る。clock のない状態（フェーズ8より前に始まった対局）には初期値を補う。 */
function timed(table: TableState, now: number): TimedTable {
  const clock = table.clock;
  return {
    ...table,
    clock: clock
      ? { ...clock, bank: [...clock.bank], auto: [...clock.auto] }
      : newClock(now),
  };
}

function waitedSeats(table: TableState): Seat[] {
  return SEATS.filter((seat) => actionsFor(table, seat).length > 0);
}

/**
 * いまの待ちの長さ。
 * @param diceThrows この保存で振ったサイコロの回数。画面の演出が終わるまでの分を足す。
 */
function waitMs(table: TimedTable, diceThrows: number): number {
  const round = table.game.round;
  switch (round.phase) {
    case "awaitTurnAction":
      return TURN_BASE_MS + table.clock.bank[round.turn];
    case "awaitResponses":
      return RESPONSE_MS;
    case "diceChance":
      return DICE_CHOICE_MS + diceThrows * DICE_STEP_MS;
    case "ended":
      return RESULT_MS + diceThrows * DICE_STEP_MS;
  }
}

/** 操作の前後で、同じ待ちが続いているか。続いていれば期限を変えない。 */
function sameWait(before: TableState, after: TableState): boolean {
  // 局の結果を1人が確認しただけ、または復帰しただけ
  if (before.game === after.game) return true;
  // 応答できる2人のうち1人だけが応答した
  const a = before.game.round;
  const b = after.game.round;
  return (
    a.phase === "awaitResponses" &&
    b.phase === "awaitResponses" &&
    a.pending?.tile === b.pending?.tile
  );
}

/** 時間切れや即ツモ切りで、本人の代わりに行う操作。和了できる形でも和了しない。 */
function autoAction(
  table: TimedTable,
  seat: Seat,
  ctx: ClockContext,
): PlayAction {
  const actions = actionsFor(table, seat);
  const confirm = actions.find((a) => a.type === "confirm");
  if (confirm) return confirm;
  const dice = actions.filter((a) => a.type === "dice");
  if (dice.length > 0) return dice[ctx.pick(dice.length)]!;
  const pass = actions.find((a) => a.type === "pass");
  if (pass) return pass;
  const discards = actions.filter(
    (a): a is Extract<PlayAction, { type: "discard" }> => a.type === "discard",
  );
  // ツモ牌がない（ポン直後）ときは、切れる牌の右端を切る
  const drawn = table.game.round.drawn;
  return (
    discards.find((a) => a.tile === drawn) ?? discards[discards.length - 1]!
  );
}

/** 操作を1つ適用する。局が変わったら持ち時間を戻す。 */
function applyOne(
  table: TimedTable,
  action: PlayAction,
  ctx: ClockContext,
  events: TableEvent[],
): TimedTable {
  const step = applyTableAction(table, action, ctx.nextSeed);
  events.push(...step.events);
  const newRound = step.events.some((event) => event.type === "roundStart");
  return {
    ...step.table,
    clock: { ...table.clock, ...(newRound && { bank: fullBank() }) },
  };
}

/**
 * 自動の人が待たれている間、その人の番を続けて進め、止まったところで期限を決める。
 * 3人とも自動なら進めずに止める（1回の保存で半荘が最後まで進まないようにする）。
 * @param fresh 新しい待ちが始まった。false なら、いまの期限を変えない。
 */
function settle(
  start: TimedTable,
  events: TableEvent[],
  ctx: ClockContext,
  fresh: boolean,
): TimedStep {
  let table = start;
  let isFresh = fresh;
  const stopped = () =>
    table.game.phase !== "playing" || table.clock.auto.every(Boolean);

  while (!stopped()) {
    const seat = waitedSeats(table).find((s) => table.clock.auto[s]);
    if (seat === undefined) break;
    const before = table;
    table = applyOne(table, autoAction(table, seat, ctx), ctx, events);
    isFresh ||= !sameWait(before, table);
  }

  const clock: Clock = { ...table.clock, savedAt: ctx.now };
  if (stopped()) {
    clock.deadline = null;
  } else if (isFresh || clock.deadline === null) {
    const diceThrows = events.reduce(
      (total, event) =>
        event.type === "dice" ? total + event.rolls.length : total,
      0,
    );
    clock.deadline = ctx.now + waitMs({ ...table, clock }, diceThrows);
  }
  return { table: { ...table, clock }, events };
}

/** 対局の開始。持ち時間を満たし、最初の手番の期限を決める。 */
export function startClock(table: TableState, now: number): TimedTable {
  const start: TimedTable = { ...table, clock: newClock(now) };
  return {
    ...start,
    clock: {
      ...start.clock,
      deadline: now + waitMs(start, 0) + FIRST_TURN_GRACE_MS,
    },
  };
}

/**
 * プレイヤーの操作を適用する。不正な操作は IllegalActionError。
 * 期限を過ぎていても、時間切れが処理される前に届いた操作は受け付ける。
 */
export function applyTimed(
  input: TableState,
  action: TableAction,
  ctx: ClockContext,
): TimedStep {
  const table = timed(input, ctx.now);
  const { seat } = action;

  if (action.type === "resume") {
    if (!table.clock.auto[seat]) throw new IllegalActionError("notAllowed");
    table.clock.auto[seat] = false;
    return settle(table, [], ctx, false);
  }

  // 手番の操作なら、基本の時間を超えた分を持ち時間から引く。
  // 期限は「基本の時間＋持ち時間」なので、期限までの残りが持ち時間より短ければ、それが新しい持ち時間になる
  const round = table.game.round;
  const { deadline } = table.clock;
  if (
    round.phase === "awaitTurnAction" &&
    round.turn === seat &&
    deadline !== null
  ) {
    table.clock.bank[seat] = Math.min(
      table.clock.bank[seat],
      Math.max(0, deadline - ctx.now),
    );
  }

  const events: TableEvent[] = [];
  const next = applyOne(table, action, ctx, events);
  // 本人が操作したので、即ツモ切りを解除する
  next.clock.auto[seat] = false;
  return settle(next, events, ctx, !sameWait(table, next));
}

/**
 * 時間切れを処理する。期限前、または期限のない状態なら IllegalActionError。
 * 待たれていた人を自動にして、その人の番を進める。局の結果の時間切れでは自動にしない。
 */
export function applyTimeout(input: TableState, ctx: ClockContext): TimedStep {
  let table = timed(input, ctx.now);
  const { deadline } = table.clock;
  if (
    table.game.phase !== "playing" ||
    deadline === null ||
    ctx.now < deadline
  ) {
    throw new IllegalActionError("notAllowed");
  }

  const events: TableEvent[] = [];
  const round = table.game.round;
  if (round.phase === "ended") {
    for (const seat of waitedSeats(table)) {
      table = applyOne(table, { type: "confirm", seat }, ctx, events);
    }
  } else {
    for (const seat of waitedSeats(table)) table.clock.auto[seat] = true;
    if (round.phase === "awaitTurnAction") table.clock.bank[round.turn] = 0;
  }
  return settle(table, events, ctx, true);
}
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run src/server/clock.test.ts`
Expected: PASS（全件）

補足:

- 天和の局とポンの局の牌の並びは、計画を書くときにエンジンで確かめてある（天和のあとは持ち点 78000/6000/6000 で対局が続き、席0の連荘で1本場。東を切ると席1に `pon` と `pass` が出る）。
- 「次の局まで進む」のテストで種1の局にポッチやサイコロチャンスが挟まっても、`advance` は `actions[0]` で進める。1000手で終わらない場合だけ、`start(2)` など別の種に変える。
- `tsconfig.json` は `exactOptionalPropertyTypes` と `noUncheckedIndexedAccess` が有効。`clock: undefined` のような書き方は型エラーになるので、上のコードのとおりに書く。

- [ ] **Step 5: 全体を確かめてコミット**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: すべて PASS

```bash
npx prettier --write src/server/clock.ts src/server/clock.test.ts
git add src/server/clock.ts src/server/clock.test.ts
git commit -m "feat(server): add turn clocks, timeouts and automatic play"
```

---

### Task 3: サーバーにつなぐ（保存の共通化、`/tick`、通しの検証）

**Files:**

- Modify: `src/server/games.ts`、`scripts/play-hanchan.mjs`
- Create: `src/app/api/games/[id]/tick/route.ts`

**Interfaces:**

- Consumes: Task 2 の `startClock`、`applyTimed`、`applyTimeout`、`ClockContext`、`TimedStep`
- Produces（`src/server/games.ts`）:
  - `submitAction(params: { gameId: string; userId: string; version: unknown; action: unknown }): Promise<SubmitResult>`（変わらない。中で `applyTimed` を使う）
  - `submitTick(params: { gameId: string; userId: string; version: unknown }): Promise<SubmitResult>`
  - `serverNow(): number`
- Produces（API）: `POST /api/games/:id/tick`、本文 `{ version }`、成功は `{ version, view }`。期限前は 422 `illegal`、版番号が古い・対局が終わっているは 409（`stale`、`finished`）、参加者でないは 404

- [ ] **Step 1: 検証スクリプトに時間切れの確認を足す（まだ失敗する）**

`scripts/play-hanchan.mjs`:

`const stats = {...}` に `ticks: 0` を足す。

`playGame` の「不正な要求」のブロックで、`// 同じ操作を同時に2回送っても、通るのは1回だけ` の上に足す:

```js
const tickPath = `/api/games/${gameId}/tick`;
const early = await api(turn, "POST", tickPath, { version: turn.version });
check("期限前の時間切れの申告は422", early.status === 422, early.status);
const outsideTick = await api(outsider, "POST", tickPath, { version: 0 });
check("参加者以外の申告は404", outsideTick.status === 404, outsideTick.status);
const resumeEarly = await api(turn, "POST", path, {
  version: turn.version,
  action: { type: "resume" },
});
check(
  "自動でない人の復帰は422",
  resumeEarly.status === 422,
  resumeEarly.status,
);
```

`console.log("対局");` から `for (;;) {` の中の `if (!actor) throw new Error("誰にも可能な操作がありません");` までを、次に置き換える:

```js
  console.log("対局");
  // 3人目は途中から操作をやめる。残りの2人が時間切れを申告して、最後まで進める
  const IDLE_AFTER = 30;
  const idle = players[2];
  let resumed = false;
  let rounds = 0;
  for (;;) {
    const view = players[0].view;
    if (view.phase === "ended") break;

    // 自動になったら1回だけ復帰して、また操作をやめる
    if (!resumed && view.auto[idle.view.seat]) {
      const back = await api(idle, "POST", `/api/games/${gameId}/actions`, {
        version: idle.version,
        action: { type: "resume" },
      });
      if (back.status === 409) {
        await refresh(idle, gameId);
        continue;
      }
      check("自動になった人は復帰できる", back.status === 200, back.status);
      check("復帰すると自動が外れる", back.json.view.auto[idle.view.seat] === false);
      resumed = true;
      accept(idle, back.json.version, back.json.view);
      await waitForVersion(players, gameId, back.json.version);
      continue;
    }

    const idling = stats.actions >= IDLE_AFTER;
    const actor = players.find(
      (p) => p.view.actions.length > 0 && !(idling && p === idle),
    );
    if (!actor) {
      // 操作をやめた人だけが待たれている。期限を待って、ほかの人が時間切れを申告する
      const waiter = players[0];
      if (waiter.view.deadline === null) {
        throw new Error("期限がないのに誰も操作できません");
      }
      await sleep(Math.max(0, waiter.view.deadline - Date.now()) + 50);
      const tick = await api(waiter, "POST", `/api/games/${gameId}/tick`, {
        version: waiter.version,
      });
      if (tick.status === 409 || tick.status === 422) {
        for (const player of players) await refresh(player, gameId);
        continue;
      }
      if (tick.status !== 200) {
        throw new Error(`時間切れの申告が拒否されました: ${tick.status}`);
      }
      stats.ticks++;
      accept(waiter, tick.json.version, tick.json.view);
      await waitForVersion(players, gameId, tick.json.version);
      continue;
    }
```

（そのあとの `const action = pickAction(...)` 以降は変えない。元の `let rounds = 0;` と `for (;;) {`、`const view = ...`、`if (view.phase === "ended") break;`、`const actor = ...` は上の置き換えに含まれているので、重複させない。）

ループを抜けたあとの `console.log("Realtimeで届いた内容");` の上に足す:

```js
console.log("時間切れ");
check("時間切れが申告された", stats.ticks > 0, stats.ticks);
check(
  "操作をやめた人は自動のまま終局した",
  players[0].view.auto[idle.view.seat] === true,
);
check("復帰を確かめた", resumed);
```

`main` の「計測」の出力に1行足す:

```js
console.log(`  時間切れの申告: ${stats.ticks} 回`);
```

- [ ] **Step 2: 失敗することを確かめる**

ローカルのSupabaseと開発サーバーを起動してから実行する（別の端末、またはバックグラウンド）:

```bash
npx supabase start
npm run dev
npm run test:play
```

Expected: 「期限前の時間切れの申告は422」が NG（`/tick` がまだないので 404）。そのあと `view.auto` がなくて例外で止まる。

- [ ] **Step 3: `src/server/games.ts` を書き換える**

import を直す（`applyTableAction` は使わなくなる）:

```ts
import { applyTimed, applyTimeout, startClock } from "./clock";
import type { ClockContext, TimedStep } from "./clock";
import { shuffled } from "./room-rules";
import { createAdminClient } from "./supabase";
import { buildView, parseAction, startTable } from "./table";
import type { PlayerView, TableState } from "./table";
```

`newSeed` の下に足す:

```ts
/** サーバーの現在時刻。期限はすべてこの時計で決める。 */
export function serverNow(): number {
  return Date.now();
}

function clockContext(): ClockContext {
  return {
    now: serverNow(),
    nextSeed: newSeed,
    pick: (count) => randomInt(count),
  };
}
```

`startGameForRoom` の `const { table, events } = startTable({ seed: newSeed() });` を置き換える:

```ts
const started = startTable({ seed: newSeed() });
const table = startClock(started.table, serverNow());
const { events } = started;
```

`submitAction`（`/** 操作を受け付ける…` のコメントから関数の終わりまで）を、次の4つに置き換える:

```ts
type Loaded =
  | { ok: true; seat: Seat; version: number; table: TableState }
  | { ok: false; error: SubmitError };

/** 対局の状態を読む。参加者以外には、対局があるかどうかも教えない。 */
async function loadGame(gameId: string, userId: string): Promise<Loaded> {
  const admin = createAdminClient();
  const [game, secret] = await Promise.all([
    admin
      .from("games")
      .select("status, version, player_ids")
      .eq("id", gameId)
      .maybeSingle(),
    admin
      .from("game_secrets")
      .select("state")
      .eq("game_id", gameId)
      .maybeSingle(),
  ]);
  if (game.error || secret.error) {
    throw new Error("対局を読み込めませんでした");
  }
  const seat = game.data?.player_ids.indexOf(userId) ?? -1;
  if (!game.data || !secret.data || seat < 0) {
    return { ok: false, error: "notFound" };
  }
  if (game.data.status !== "playing") return { ok: false, error: "finished" };
  return {
    ok: true,
    seat: seat as Seat,
    version: game.data.version,
    table: secret.data.state as unknown as TableState,
  };
}

/**
 * 状態を進めて保存し、本人の新しい画面データを返す。
 * 進め方（操作か時間切れか）は呼び出す側が渡す。どちらも時計（clock.ts）を通る。
 */
async function advance(
  gameId: string,
  loaded: Extract<Loaded, { ok: true }>,
  apply: (ctx: ClockContext) => TimedStep,
): Promise<SubmitResult> {
  let step;
  try {
    step = apply(clockContext());
  } catch (error) {
    if (error instanceof IllegalActionError) {
      return { ok: false, error: "illegal" };
    }
    throw error;
  }

  const { table, events } = step;
  const views = viewsOf(table);
  const result = table.game.result;
  const results =
    result &&
    SEATS.map((s) => ({
      rank: result.ranking.indexOf(s) + 1,
      points: result.points[s],
      score: result.payout[s],
      chips: result.chips[s],
    }));

  const { data: saved, error } = await createAdminClient().rpc("save_game", {
    p_game: gameId,
    p_expected_version: loaded.version,
    p_state: toJson(table),
    p_views: toJson(views),
    p_events: toJson(events),
    ...(results && { p_results: toJson(results) }),
  });
  if (error) throw new Error("対局を保存できませんでした");
  // 読み込んでから保存するまでの間に、ほかの操作が先に保存された
  if (!saved) return { ok: false, error: "stale" };

  return { ok: true, version: loaded.version + 1, view: views[loaded.seat] };
}

/**
 * 操作を受け付ける。状態の読込、検証、適用、保存を行い、本人の新しい画面データを返す。
 * クライアントが送るのは「何をしたいか」だけで、結果はここで決まる。
 */
export async function submitAction(params: {
  gameId: string;
  userId: string;
  version: unknown;
  action: unknown;
}): Promise<SubmitResult> {
  const loaded = await loadGame(params.gameId, params.userId);
  if (!loaded.ok) return loaded;
  if (params.version !== loaded.version) return { ok: false, error: "stale" };

  const action = parseAction(params.action, loaded.seat);
  if (!action) return { ok: false, error: "invalid" };
  return advance(params.gameId, loaded, (ctx) =>
    applyTimed(loaded.table, action, ctx),
  );
}

/**
 * 時間切れの申告を受け付ける。参加者なら誰でも送れる。
 * 期限はサーバーの時計で確かめるので、申告で早く進めることはできない（期限前は illegal）。
 */
export async function submitTick(params: {
  gameId: string;
  userId: string;
  version: unknown;
}): Promise<SubmitResult> {
  const loaded = await loadGame(params.gameId, params.userId);
  if (!loaded.ok) return loaded;
  if (params.version !== loaded.version) return { ok: false, error: "stale" };
  return advance(params.gameId, loaded, (ctx) =>
    applyTimeout(loaded.table, ctx),
  );
}
```

`SubmitError` の `illegal` のコメントを `/** いまはできない操作。期限前の時間切れの申告もこれ */` にする。Task 1 で足した一時的な `resume` の2行は、置き換えで消えていることを確かめる。

- [ ] **Step 4: `/tick` のルートを作る**

先に `node_modules/next/dist/docs/01-app/` でルートハンドラーのページを読み、`RouteContext` の使い方が `actions/route.ts` と同じであることを確かめる。

`src/app/api/games/[id]/tick/route.ts`:

```ts
import {
  isSameOrigin,
  jsonError,
  readJson,
  requireApiViewer,
} from "@/server/api";
import { submitTick } from "@/server/games";
import type { SubmitError } from "@/server/games";
import { isUuid } from "@/server/room-rules";

const STATUS: Record<SubmitError, number> = {
  notFound: 404,
  finished: 409,
  stale: 409,
  invalid: 400,
  illegal: 422,
};

/**
 * 時間切れの申告を受け付ける。本文は { version }。
 * 期限を過ぎたら、画面を開いている誰かが送る。期限はサーバーが自分の時計で確かめる。
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/games/[id]/tick">,
) {
  if (!isSameOrigin(request)) return jsonError("forbidden", 403);
  const viewer = await requireApiViewer();
  if (viewer instanceof Response) return viewer;

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError("notFound", 404);

  const body = (await readJson(request)) as { version?: unknown } | null;
  const result = await submitTick({
    gameId: id,
    userId: viewer.id,
    version: body?.version,
  });
  if (!result.ok) return jsonError(result.error, STATUS[result.error]);
  return Response.json({ version: result.version, view: result.view });
}
```

- [ ] **Step 5: 通ることを確かめる**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: すべて PASS

Run（開発サーバーとローカルのSupabaseが動いている状態で）: `npm run test:play`
Expected: 最後に「すべて成功」。「時間切れの申告」が1回以上。途中で最長35秒ほど止まるのは、操作をやめた人の期限を待っているため。

- [ ] **Step 6: コミット**

```bash
npx prettier --write src/server/games.ts "src/app/api/games/[id]/tick/route.ts" scripts/play-hanchan.mjs
git add src/server/games.ts "src/app/api/games/[id]/tick" scripts/play-hanchan.mjs
git commit -m "feat(api): enforce clocks on the server and accept timeout reports"
```

---

### Task 4: 放置対局の破棄と定期実行

**Files:**

- Create: `supabase/migrations/20261002020000_abandon_stale_games.sql`、`supabase/tests/database/abandon.test.sql`、`src/server/cron-rules.ts`、`src/server/cron-rules.test.ts`、`src/app/api/cron/route.ts`、`.github/workflows/cron.yml`
- Modify: `src/server/database.types.ts`（再生成）、`src/server/games.ts`、`src/server/env.ts`、`.env.example`、`src/app/page.tsx`、`src/app/rooms/[code]/page.tsx`、`src/app/games/[id]/page.tsx`

**Interfaces:**

- Produces（DB）: `public.abandon_stale_games(p_user uuid default null) returns integer`
- Produces（`src/server/games.ts`）: `abandonStaleGames(userId?: string): Promise<number>`（失敗したら例外）
- Produces（`src/server/cron-rules.ts`）: `isCronAuthorized(header: string | null, secret: string | null): boolean`
- Produces（`src/server/env.ts`）: `env.cronSecret: string | null`
- Produces（API）: `POST /api/cron`、ヘッダー `Authorization: Bearer <CRON_SECRET>`、成功は `{ abandoned: number }`、違えば 401

- [ ] **Step 1: DBのテストを書く**

`supabase/tests/database/abandon.test.sql`:

```sql
-- 放置された対局の破棄のテスト。npm run test:db で実行する。
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@example.com');
update public.profiles set approved = true, display_name = left(id::text, 8) || right(id::text, 1);

create temp table ids as select
  '00000000-0000-0000-0000-00000000000a'::uuid as alice,
  '00000000-0000-0000-0000-00000000000b'::uuid as bob,
  '00000000-0000-0000-0000-00000000000c'::uuid as carol,
  '00000000-0000-0000-0000-00000000000d'::uuid as dave;

select public.create_room(alice, 'AAA111') from ids;
select public.join_room(bob, 'AAA111') from ids;
select public.join_room(carol, 'AAA111') from ids;
create temp table room as select id from public.rooms where code = 'AAA111';
create temp table game as
  select public.start_game(room.id, 'waiting', array[alice, bob, carol],
    '{"s":0}', '[{},{},{}]', '[]') as id
  from ids, room;

select is((select public.abandon_stale_games()), 0, '進んでいる対局は破棄しない');
update public.games set updated_at = now() - interval '9 minutes';
select is((select public.abandon_stale_games()), 0, '10分たっていなければ破棄しない');

update public.games set updated_at = now() - interval '11 minutes';
select is(
  (select public.abandon_stale_games(dave) from ids),
  0,
  '参加していない人を指定しても破棄しない'
);
select is(
  (select public.abandon_stale_games(alice) from ids),
  1,
  '参加者を指定すると、その人の放置対局を破棄する'
);
select is((select status from public.games), 'abandoned', '対局が破棄になる');
select is((select status from public.rooms), 'abandoned', 'ルームが破棄になる');
select is((select count(*)::int from public.game_results), 0, '結果は残さない');
select ok(
  not (select public.save_game(game.id, 0, '{"s":1}', '[{},{},{}]', '[]') from game),
  '破棄した対局には保存できない'
);
select is(
  (select public.create_room(alice, 'AAA222')->>'result' from ids),
  'created',
  '破棄のあとは新しいルームを作れる'
);
select is((select public.abandon_stale_games()), 0, '破棄済みの対局は数えない');

select ok(
  not has_function_privilege('authenticated', 'public.abandon_stale_games(uuid)', 'execute'),
  'ログイン中のユーザーは呼べない'
);
select ok(
  not has_function_privilege('anon', 'public.abandon_stale_games(uuid)', 'execute'),
  '未ログインは呼べない'
);

select * from finish();
rollback;
```

- [ ] **Step 2: 失敗することを確かめる**

Run: `npm run test:db`
Expected: `abandon.test.sql` が FAIL（`function public.abandon_stale_games() does not exist`）

- [ ] **Step 3: マイグレーションを書く**

`supabase/migrations/20261002020000_abandon_stale_games.sql`:

```sql
-- 放置された対局の破棄。
-- 対局中のまま、最後の保存から10分たった対局とそのルームを破棄にする。
-- 画面を開いている人がいれば時間切れが申告されて保存が進むので、10分進まないのは3人とも不在のとき。
-- p_user を渡すと、その人が参加している対局だけを対象にする。破棄した対局の数を返す。
-- サーバー（service_role）だけが呼ぶ。
create function public.abandon_stale_games(p_user uuid default null) returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  with stale as (
    update public.games
    set status = 'abandoned', updated_at = now()
    where status = 'playing'
      and updated_at < now() - interval '10 minutes'
      and (p_user is null or p_user = any (player_ids))
    returning room_id
  ),
  closed as (
    update public.rooms
    set status = 'abandoned', updated_at = now()
    where id in (select room_id from stale)
    returning id
  )
  select count(*) into v_count from stale;
  return v_count;
end;
$$;

revoke all on function public.abandon_stale_games(uuid) from public, anon, authenticated;
grant execute on function public.abandon_stale_games(uuid) to service_role;
```

- [ ] **Step 4: DBに反映して、テストと型を通す**

```bash
npm run db:reset
npm run test:db
npm run db:types
```

Expected: `test:db` がすべて PASS。`src/server/database.types.ts` の `Functions` に `abandon_stale_games: { Args: { p_user?: string }; Returns: number }` が増える（差分がそれだけであることを `git diff src/server/database.types.ts` で確かめる）。

- [ ] **Step 5: 秘密の値の照合のテストを書く**

`src/server/cron-rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isCronAuthorized } from "./cron-rules";

describe("isCronAuthorized（定期実行の秘密の値）", () => {
  it("Bearer の値が一致すれば通す", () => {
    expect(isCronAuthorized("Bearer s3cret", "s3cret")).toBe(true);
  });

  it("値が違う、形が違う、ヘッダーがないときは通さない", () => {
    expect(isCronAuthorized("Bearer wrong!", "s3cret")).toBe(false);
    expect(isCronAuthorized("Bearer s3cret-and-more", "s3cret")).toBe(false);
    expect(isCronAuthorized("s3cret", "s3cret")).toBe(false);
    expect(isCronAuthorized(null, "s3cret")).toBe(false);
  });

  it("秘密の値が設定されていなければ、誰も通さない", () => {
    expect(isCronAuthorized("Bearer ", null)).toBe(false);
    expect(isCronAuthorized("Bearer ", "")).toBe(false);
    expect(isCronAuthorized(null, null)).toBe(false);
  });
});
```

Run: `npx vitest run src/server/cron-rules.test.ts`
Expected: FAIL（`./cron-rules` が見つからない）

- [ ] **Step 6: 照合、環境変数、破棄の呼び出し、ルートを書く**

`src/server/cron-rules.ts`:

```ts
import { timingSafeEqual } from "node:crypto";

/**
 * 定期実行の要求に付いてきた Authorization ヘッダーを確かめる。
 * 秘密の値が設定されていなければ、誰も通さない。
 */
export function isCronAuthorized(
  header: string | null,
  secret: string | null,
): boolean {
  if (!secret || header === null) return false;
  const given = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
```

`src/server/env.ts` の `adminEmail` の下に足す:

```ts
  /** 定期実行（GitHub Actions）の秘密の値。設定していなければ null で、定期実行は受け付けない。 */
  get cronSecret(): string | null {
    return process.env.CRON_SECRET || null;
  },
```

`.env.example` の末尾に足す:

```
# 定期実行（GitHub Actions）が /api/cron を呼ぶときの秘密の値。GitHub の Secrets にも同じ値を登録する
CRON_SECRET=
```

`.env.local`（コミットしない）にも `CRON_SECRET=local-cron-secret` を足す。

`src/server/games.ts` の末尾に足す:

```ts
/**
 * 対局中のまま10分進んでいない対局を破棄する。破棄した数を返す。
 * @param userId 渡すと、その人が参加している対局だけを対象にする。
 */
export async function abandonStaleGames(userId?: string): Promise<number> {
  const { data, error } = await createAdminClient().rpc(
    "abandon_stale_games",
    userId ? { p_user: userId } : {},
  );
  if (error) throw new Error("放置された対局を破棄できませんでした");
  return data ?? 0;
}
```

`src/app/api/cron/route.ts`:

```ts
import { jsonError } from "@/server/api";
import { isCronAuthorized } from "@/server/cron-rules";
import { env } from "@/server/env";
import { abandonStaleGames } from "@/server/games";

/**
 * 定期実行（GitHub Actions、1日1回）から呼ばれる。放置された対局を破棄する。
 * Supabase にアクセスするので、無料枠の一時停止（1週間アクセスなし）も防ぐ。
 */
export async function POST(request: Request) {
  const header = request.headers.get("authorization");
  if (!isCronAuthorized(header, env.cronSecret)) {
    return jsonError("unauthorized", 401);
  }
  return Response.json({ abandoned: await abandonStaleGames() });
}
```

- [ ] **Step 7: ページを開いたときに破棄する。破棄された対局を案内する**

破棄に失敗してもページは出したいので、ページでは `.catch(() => 0)` を付ける。

`src/app/page.tsx`: `import { abandonStaleGames } from "@/server/games";` を足し、`const activeCode = ...` の上に足す:

```ts
// 放置された対局に閉じ込められないよう、ここで破棄する
await abandonStaleGames(viewer.id).catch(() => 0);
```

`src/app/rooms/[code]/page.tsx`: 同じ import を足し、`let room = await getRoomDetail(code);` の上に足す:

```ts
await abandonStaleGames(viewer.id).catch(() => 0);
```

`src/app/games/[id]/page.tsx`: import に `Link`（`next/link`）、`Screen` と `buttonClass`（`@/components/screen`）、`abandonStaleGames`（`@/server/games`）を足す。`if (!isUuid(id)) notFound();` の下に足す:

```ts
await abandonStaleGames(viewer.id).catch(() => 0);
```

`games` の `select` を `"room_id, player_ids, status"` にし、`if (!game.data || !row.data) notFound();` の下に足す:

```tsx
if (game.data.status === "abandoned") {
  return (
    <Screen title="対局">
      <p className="text-sm opacity-80">
        この対局は破棄されました（3人とも10分以上操作がありませんでした）。
      </p>
      <Link href="/" className={`${buttonClass} text-center`}>
        ホームへ戻る
      </Link>
    </Screen>
  );
}
```

- [ ] **Step 8: 定期実行のワークフローを書く**

`.github/workflows/cron.yml`:

```yaml
# 1日1回、本番の /api/cron を呼ぶ。放置された対局を破棄し、Supabase の一時停止（1週間アクセスなし）を防ぐ。
# Secrets に CRON_SECRET、Variables に APP_URL（例: https://example.vercel.app）を登録しておく。
# リポジトリに60日間動きがないと、GitHub は定期実行を止める。止まったら Actions の画面から有効に戻す。
name: cron

on:
  schedule:
    # 毎日 03:17（日本時間）
    - cron: "17 18 * * *"
  workflow_dispatch:

permissions: {}

jobs:
  cleanup:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Call /api/cron
        env:
          APP_URL: ${{ vars.APP_URL }}
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
        run: |
          curl --fail-with-body --silent --show-error --max-time 60 \
            -X POST -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron"
```

- [ ] **Step 9: 通ることを確かめる**

Run: `npm run typecheck && npm run lint && npm run test && npm run test:db`
Expected: すべて PASS

開発サーバーを再起動して（`.env.local` を読み直すため）確かめる:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/cron
curl -s -X POST -H "Authorization: Bearer local-cron-secret" http://localhost:3000/api/cron
```

Expected: 1つ目は `401`、2つ目は `{"abandoned":0}`

- [ ] **Step 10: コミット**

```bash
npx prettier --write src/server src/app/api/cron src/app/page.tsx "src/app/rooms/[code]/page.tsx" "src/app/games/[id]/page.tsx" .github/workflows/cron.yml
git add supabase src .github .env.example
git commit -m "feat: abandon games left idle for ten minutes and add a daily cron"
```

---

### Task 5: 対局の画面（残り時間、申告、自動、復帰）

**Files:**

- Create: `src/app/games/[id]/logic/clock.ts`、`src/app/games/[id]/logic/clock.test.ts`、`src/app/games/[id]/use-clock.ts`、`src/app/games/[id]/table/clock-badge.tsx`
- Modify: `src/app/games/[id]/use-game-view.ts`、`src/app/games/[id]/game-client.tsx`、`src/app/games/[id]/page.tsx`、`src/app/games/[id]/table/table-screen.tsx`、`src/app/dev/table/sandbox.tsx`（prop を1つ足すだけ）

**Interfaces:**

- Consumes: Task 1 の `PlayerView`（`deadline`、`serverNow`、`bank`、`auto`）、Task 3 の `POST /api/games/:id/tick` と `serverNow()`
- Produces（`logic/clock.ts`）:
  - `withClockFields(view: PlayerView): PlayerView`
  - `estimateOffset(previous: number | null, receivedAt: number, serverNow: number): number | null`
  - `clockLabel(remainingMs: number, bankMs: number | null): string`
  - `tickDelayMs(seat: Seat): number`
- Produces（`use-clock.ts`）:
  - `useServerTime(snapshot: Snapshot, renderedAt: number): () => number`
  - `useTick(params: { deadline: number | null; version: number; seat: Seat; serverTime: () => number; tick: () => Promise<void> }): void`
- Produces: `TableScreenProps.serverTime: () => number`、`GameClient` の prop `renderedAt: number`

- [ ] **Step 1: 失敗するテストを書く**

`src/app/games/[id]/logic/clock.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { seedOf } from "@/engine/testing";
import { buildView, startTable } from "@/server/table";
import type { PlayerView } from "@/server/table";
import {
  clockLabel,
  estimateOffset,
  tickDelayMs,
  withClockFields,
} from "./clock";

describe("withClockFields（古い画面データの補完）", () => {
  const view = buildView(startTable({ seed: seedOf(1) }).table, 0);

  it("持ち時間の項目がない画面データには、期限なし・自動なしを補う", () => {
    const legacy: Partial<PlayerView> = { ...view };
    delete legacy.deadline;
    delete legacy.serverNow;
    delete legacy.bank;
    delete legacy.auto;
    expect(withClockFields(legacy as PlayerView)).toEqual({
      ...view,
      deadline: null,
      serverNow: 0,
      bank: 0,
      auto: [false, false, false],
    });
  });

  it("項目があれば変えない", () => {
    const timed: PlayerView = {
      ...view,
      deadline: 9_000,
      serverNow: 5_000,
      bank: 12_000,
      auto: [false, true, false],
    };
    expect(withClockFields(timed)).toEqual(timed);
  });
});

describe("estimateOffset（サーバーの時計との差）", () => {
  it("受け取った時刻とサーバーの時刻の差の、最小値を採る", () => {
    expect(estimateOffset(null, 10_500, 10_000)).toBe(500);
    expect(estimateOffset(500, 20_300, 20_000)).toBe(300);
    // 取り直した古い画面データは差が大きく出るので、採らない
    expect(estimateOffset(300, 40_000, 31_000)).toBe(300);
  });

  it("サーバーの時刻のない画面データ（0）は使わない", () => {
    expect(estimateOffset(null, 10_500, 0)).toBeNull();
    expect(estimateOffset(300, 10_500, 0)).toBe(300);
  });
});

describe("clockLabel（残り時間の表示）", () => {
  it("手番では、基本の時間が残っている間はその秒数を出す", () => {
    expect(clockLabel(25_000, 20_000)).toBe("5");
    expect(clockLabel(20_001, 20_000)).toBe("1");
    expect(clockLabel(35_000, 20_000)).toBe("15");
  });

  it("基本の時間が切れたら、持ち時間を + を付けて出す", () => {
    expect(clockLabel(20_000, 20_000)).toBe("+20");
    expect(clockLabel(11_200, 20_000)).toBe("+12");
    expect(clockLabel(3_000, 0)).toBe("3");
  });

  it("手番以外は残り秒数だけ。0より小さくはしない", () => {
    expect(clockLabel(14_100, null)).toBe("15");
    expect(clockLabel(-800, null)).toBe("0");
    expect(clockLabel(-800, 20_000)).toBe("+0");
  });
});

describe("tickDelayMs（申告までの間）", () => {
  it("3人が同時に送らないよう、席でずらす", () => {
    expect([tickDelayMs(0), tickDelayMs(1), tickDelayMs(2)]).toEqual([
      300, 500, 700,
    ]);
  });
});
```

Run: `npx vitest run "src/app/games/[id]/logic/clock.test.ts"`
Expected: FAIL（`./clock` が見つからない）

- [ ] **Step 2: `logic/clock.ts` を書く**

```ts
import type { Seat } from "@/engine";
import type { PlayerView } from "@/server/table";

/**
 * フェーズ8より前に保存された画面データ（終わった対局など）には持ち時間の項目がない。
 * 期限なし、自動なしとして補う。
 */
export function withClockFields(view: PlayerView): PlayerView {
  const raw: Partial<PlayerView> = view;
  return {
    ...view,
    deadline: raw.deadline ?? null,
    serverNow: raw.serverNow ?? 0,
    bank: raw.bank ?? 0,
    auto: raw.auto ?? [false, false, false],
  };
}

/**
 * サーバーの時計との差（自分の時計 − サーバーの時計）を見積もる。
 * 通信の遅れや、取り直した古い画面データでは差が大きく出るので、最小値を採る。
 * @param serverNow サーバーが付けた時刻。0 は「付いていない」で、使わない。
 */
export function estimateOffset(
  previous: number | null,
  receivedAt: number,
  serverNow: number,
): number | null {
  if (serverNow === 0) return previous;
  const sample = receivedAt - serverNow;
  return previous === null ? sample : Math.min(previous, sample);
}

/**
 * 残り時間の表示。
 * @param bankMs 手番のときの自分の持ち時間。手番以外は null。
 *   手番では、基本の時間が残っている間はその秒数、切れたら持ち時間を「+12」の形で出す。
 */
export function clockLabel(remainingMs: number, bankMs: number | null): string {
  const seconds = (ms: number) => Math.max(0, Math.ceil(ms / 1000));
  if (bankMs === null || bankMs === 0) return String(seconds(remainingMs));
  return remainingMs > bankMs
    ? String(seconds(remainingMs - bankMs))
    : `+${seconds(remainingMs)}`;
}

/** 期限を過ぎてから時間切れを申告するまでの間。3人が同時に送らないよう席でずらす。 */
export function tickDelayMs(seat: Seat): number {
  return 300 + seat * 200;
}
```

Run: `npx vitest run "src/app/games/[id]/logic/clock.test.ts"`
Expected: PASS

- [ ] **Step 3: `use-clock.ts` を書く**

`src/app/games/[id]/use-clock.ts`:

```ts
"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Seat } from "@/engine";
import { estimateOffset, tickDelayMs } from "./logic/clock";
import type { Snapshot } from "./use-game-view";

/** 申告が通らなかった（通信の失敗、時計のずれ、画面が裏にある）ときに、もう一度送るまでの間 */
const TICK_RETRY_MS = 2000;

/**
 * サーバーの現在時刻を見積もる関数を返す。残り時間はブラウザの時計ではなく、これで計算する。
 * @param renderedAt サーバーがこのページを描いた時刻。最初の見積もりに使う。
 */
export function useServerTime(
  snapshot: Snapshot,
  renderedAt: number,
): () => number {
  const offset = useRef<number | null>(null);
  useEffect(() => {
    offset.current = estimateOffset(offset.current, Date.now(), renderedAt);
  }, [renderedAt]);
  const { version, view } = snapshot;
  useEffect(() => {
    offset.current = estimateOffset(offset.current, Date.now(), view.serverNow);
  }, [version, view.serverNow]);
  return useCallback(() => Date.now() - (offset.current ?? 0), []);
}

/**
 * 期限を過ぎたら時間切れを申告する。画面データが進むまで、間を置いて送り直す。
 * サーバーが自分の時計で期限を確かめるので、早すぎる申告は拒否されるだけで害はない。
 */
export function useTick(params: {
  deadline: number | null;
  version: number;
  seat: Seat;
  serverTime: () => number;
  tick: () => Promise<void>;
}) {
  const { deadline, version, seat, serverTime, tick } = params;
  useEffect(() => {
    if (deadline === null) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const fire = async () => {
      // 裏に回っている間は送らない。表にいる誰かが送る
      if (document.visibilityState === "visible") await tick();
      if (!stopped) timer = setTimeout(fire, TICK_RETRY_MS);
    };
    timer = setTimeout(
      fire,
      Math.max(0, deadline - serverTime()) + tickDelayMs(seat),
    );
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [deadline, version, seat, serverTime, tick]);
}
```

- [ ] **Step 4: `use-game-view.ts` で項目を補う**

`import { withClockFields } from "./logic/clock";` を足す。

`const [snapshot, setSnapshot] = useState(initial);` を置き換える:

```ts
const [snapshot, setSnapshot] = useState(() => ({
  ...initial,
  view: withClockFields(initial.view),
}));
```

`accept` を置き換える（届いた画面データはすべてここを通る）:

```ts
// 通知は順番どおりに届くとは限らないので、版番号の新しいものだけを採用する
const accept = useCallback((next: Snapshot) => {
  setSnapshot((current) =>
    next.version > current.version
      ? { version: next.version, view: withClockFields(next.view) }
      : current,
  );
}, []);
```

- [ ] **Step 5: `game-client.tsx` で申告を送り、終わった対局への操作では読み込み直す**

import に `import { useServerTime, useTick } from "./use-clock";` を足す。props に `renderedAt: number` を足す（型にも）。

コンポーネントの外に足す:

```ts
/** エラーの応答の種類を読む。 */
async function errorOf(response: Response): Promise<string | null> {
  const json = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return json?.error ?? null;
}
```

`const { version, view } = snapshot;` の下に足す:

```ts
const serverTime = useServerTime(snapshot, renderedAt);

// 終わった（または破棄された）対局に操作や申告を送ったら、ページを読み込み直して結果か案内を出す
const recover = useCallback(
  async (response: Response) => {
    if ((await errorOf(response)) === "finished") window.location.reload();
    else await refetch();
  },
  [refetch],
);

const tick = useCallback(async () => {
  try {
    const response = await fetch(`/api/games/${gameId}/tick`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version }),
    });
    if (response.ok) accept((await response.json()) as Snapshot);
    // 期限前（422）や版番号が古い（409）のは、ほかの人が先に進めたか時計がずれているだけ
    else await recover(response);
  } catch {
    // useTick が間を置いて送り直す
  }
}, [gameId, version, accept, recover]);
useTick({
  deadline: view.deadline,
  version,
  seat: view.seat,
  serverTime,
  tick,
});
```

`send` の中の 409 の分岐を置き換える:

```ts
        } else if (response.status === 409) {
          // 見ていた状態が古かった。取り直せば続けられる
          await recover(response);
        } else {
```

`send` の依存配列を `[gameId, version, accept, refetch, recover]` にする。`<TableScreen ...>` に `serverTime={serverTime}` を足す。

`src/app/games/[id]/page.tsx`: `import { abandonStaleGames, serverNow } from "@/server/games";` にし、`<GameClient ...>` に `renderedAt={serverNow()}` を足す。

- [ ] **Step 6: 残り時間の部品を作る**

`src/app/games/[id]/table/clock-badge.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { clockLabel } from "../logic/clock";

/** 表示を更新する間隔 */
const REFRESH_MS = 200;

/**
 * 自分が待たれているときの残り時間。
 * @param bank 手番のときの自分の持ち時間。手番以外（応答、サイコロ、局の結果）は null。
 * @param serverTime サーバーの現在時刻の見積もり
 */
export function ClockBadge({
  deadline,
  bank,
  serverTime,
}: {
  deadline: number;
  bank: number | null;
  serverTime: () => number;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(serverTime()), REFRESH_MS);
    return () => clearInterval(timer);
  }, [serverTime]);
  if (now === null) return null;

  const label = clockLabel(deadline - now, bank);
  return (
    <span
      aria-label="残り時間"
      className={`rounded border px-2 py-0.5 font-mono text-lg tabular-nums ${
        label.startsWith("+")
          ? "border-amber-300/70 text-amber-200"
          : "border-foreground/40"
      }`}
    >
      {label}
    </span>
  );
}
```

- [ ] **Step 7: `table-screen.tsx` に組み込む**

`TableScreenProps` に足す:

```ts
/** サーバーの現在時刻の見積もり。残り時間の表示に使う */
serverTime: () => number;
```

import に `import { ClockBadge } from "./clock-badge";` を足し、`Table` の引数の分割代入に `serverTime` を足す。

`const dicePlaying = playback.index !== null;` の下に足す:

```tsx
/** 自分が即ツモ切り中 */
const myAuto = view.auto[view.seat];
// 自分が待たれているときだけ、残り時間を出す
const clock =
  view.deadline !== null && view.actions.length > 0 && !myAuto ? (
    <ClockBadge
      deadline={view.deadline}
      bank={view.roundPhase === "awaitTurnAction" ? view.bank : null}
      serverTime={serverTime}
    />
  ) : null;
```

（`myAuto` は下の自動操作の `useEffect` より前で定義する。）

自動操作の `useEffect` の最初の行を `if (busy || mine.staging || myAuto) return;` にし、コメントを `// 前の操作の応答を待っている間は送れないので、返ってきてから送る。即ツモ切り中は、本人が復帰するまで送らない` にする。依存配列に `myAuto` を足す。

`nameTag` の `<span className="max-w-[150px] truncate">{names[seat]}</span>` の下に足す:

```tsx
{
  view.auto[seat] && (
    <span className="shrink-0 rounded bg-amber-400/90 px-1 text-[10px] font-semibold text-black">
      自動
    </span>
  );
}
```

操作の行（`absolute top-[338px] right-3`）の `{waiting && ...}` の下、`<ActionBar` の上に足す:

```tsx
{
  !view.outcome && clock;
}
```

局の結果のモーダルの中、`卓を見る` のボタンの上に足す:

```tsx
{
  clock && <div className="absolute right-[100px] bottom-3">{clock}</div>;
}
```

`Table` の一番外側の `<div>` の最後（`{view.outcome && peeking && (...)}` の下）に足す:

```tsx
{
  myAuto && view.phase === "playing" && (
    <button
      type="button"
      disabled={busy}
      onClick={() => send({ type: "resume", seat: view.seat })}
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 text-xl font-semibold"
    >
      自動ツモ切り中　タップで復帰
    </button>
  );
}
```

`src/app/dev/table/sandbox.tsx` の `<TableScreen ...>` に `serverTime={Date.now}` を足す（Task 6 でそのまま使う）。

- [ ] **Step 8: 通ることを確かめる**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: すべて PASS

lint が `use-clock.ts` や `clock-badge.tsx` の effect で怒る場合は、既存の `use-game-view.ts`（effect の中で ref を書く、`setInterval` を張る）と同じ形になっているかを見直す。ルールを無効にするコメントは足さない。

- [ ] **Step 9: コミット**

```bash
npx prettier --write "src/app/games/[id]" src/app/dev/table/sandbox.tsx
git add "src/app/games/[id]" src/app/dev/table/sandbox.tsx
git commit -m "feat(ui): show the remaining time, report timeouts and resume from auto play"
```

---

### Task 6: 確認用の卓（`/dev/table`）で時計を動かす

**Files:**

- Modify: `src/app/dev/table/sandbox.tsx`

**Interfaces:**

- Consumes: Task 2 の `startClock`、`applyTimed`、`applyTimeout`、`ClockContext`、Task 5 の `TableScreenProps.serverTime`

- [ ] **Step 1: `sandbox.tsx` を時計つきにする**

import を直す:

```ts
import { applyTimed, applyTimeout, startClock } from "@/server/clock";
import type { ClockContext } from "@/server/clock";
import { buildView, startTable } from "@/server/table";
import type {
  DiceResult,
  PlayAction,
  PlayerView,
  TableAction,
  TableState,
} from "@/server/table";
```

`step` を置き換え、その上に足す:

```ts
const context = (now = Date.now()): ClockContext => ({
  now,
  nextSeed: randomSeed,
  pick: (count) => Math.floor(Math.random() * count),
});

/** 時計つきの対局を始める。 */
const freshTable = (seed: string): TableState =>
  startClock(startTable({ seed }).table, Date.now());

function step(table: TableState, action: TableAction): TableState {
  return applyTimed(table, action, context()).table;
}
```

`tenpaiTable` の最後の `return {...}` を `startClock` で包む:

```ts
const table = startTable({ seed }).table;
return startClock(
  {
    ...table,
    game: {
      ...table.game,
      round: startRoundFromDeck(deck, { dealer: ME, seed }).state,
    },
  },
  Date.now(),
);
```

`Sandbox` の最初の状態を `table: freshTable(FIRST_SEED)` に、「最初から」のボタンを `table: freshTable(randomSeed())` にする。

`send` から Task 1 で足した `if (action.type === "resume") return;` を消す（`step` が `resume` を扱える）。

「ほかの2人を少し間を置いて進める」の `useEffect` の下に足す:

```ts
// 期限を過ぎたら、サーバーの代わりに時間切れを処理する
const deadline = table.clock?.deadline ?? null;
useEffect(() => {
  if (deadline === null) return;
  const timer = setTimeout(
    () => update((current) => applyTimeout(current, context()).table),
    Math.max(0, deadline - Date.now()) + 100,
  );
  return () => clearTimeout(timer);
}, [deadline, version, update]);
```

デバッグのボタンを2つ足す（「20手進める」の前）:

```tsx
{
  debug("時間切れ", () =>
    update(
      (t) => applyTimeout(t, context(t.clock?.deadline ?? Date.now())).table,
    ),
  );
}
{
  debug("下家を自動", () =>
    update((t) =>
      t.clock
        ? {
            ...t,
            clock: {
              ...t.clock,
              auto: [t.clock.auto[0], true, t.clock.auto[2]],
            },
          }
        : t,
    ),
  );
}
```

- [ ] **Step 2: 型とテストを通す**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: すべて PASS

- [ ] **Step 3: ブラウザで確かめる**

`npm run dev` を動かして `http://localhost:3000/dev/table` を 844×390 で開く（Playwright の MCP でよい）。次を確かめ、それぞれスクリーンショットを撮る。

1. 自分の手番で、操作の行に残り時間が出る。最初の手番は「15」から数え、0 のあと「+20」から数える。
2. 何もせずに待つと、期限でツモ切りされ、「自動ツモ切り中　タップで復帰」が画面全体に出る。3人とも自動ではないので、ほかの2人は打ち続け、自分の番は即ツモ切りで進む。
3. タップすると覆いが消え、次の自分の手番の残り時間は「5」から始まり、持ち時間（+）は出ない。
4. 「下家を自動」を押すと、上の帯の下家の名前の横に「自動」が出る。
5. 「局の終わりまで」を押すと、局の結果の「卓を見る」の左に残り時間が出て、15秒で次の局へ進む。次の局では持ち時間が戻っている（「5」のあと「+20」）。
6. 「サイコロ」は作り物なので時計は動かない（結果の残り時間だけが進む）。表示が崩れていないことだけ見る。

位置が重なる、読みにくいなどがあれば、`table-screen.tsx` の位置の指定（`right-[100px] bottom-3` など）を直して撮り直す。

- [ ] **Step 4: コミット**

```bash
npx prettier --write src/app/dev/table/sandbox.tsx "src/app/games/[id]/table"
git add src/app/dev/table/sandbox.tsx "src/app/games/[id]/table"
git commit -m "feat(dev): run the clock in the sandbox table"
```

---

### Task 7: 仕様書への反映と、通しの確認

**Files:**

- Modify: `docs/SPEC.md`

- [ ] **Step 1: `docs/SPEC.md` を直す**

「持ち時間の実現（提案）」の3つの箇条書きを、次に置き換える:

```markdown
- サーバーレスには常駐タイマーがないので、期限の時刻を対局の状態（`clock`）に記録し、画面データに入れて3人に送る。
- 期限を過ぎたら、画面を開いている誰かのクライアントが時間切れを申告する（`POST /api/games/:id/tick`）。サーバーは自分の時計で期限を検証してから自動処理する。期限を過ぎていても、申告が処理される前に届いた本人の操作は受け付ける。
- 切断は検知しない。いなくなった人は最初の1回だけ期限いっぱい待たれ、時間切れで即ツモ切りになる。
- 3人とも不在だと対局は進まない。最後の保存から10分たった対局は破棄する（`abandon_stale_games`）。破棄は、参加者がトップ画面、ルーム、対局の画面を開いたときと、1日1回の定期実行で行う。破棄した対局は結果と集計に残さない。
- 時間のルールは `src/server/clock.ts` にある。エンジンは時刻を知らない。
```

「無料枠の制約」の最初の箇条書きを置き換える:

```markdown
- Supabase無料枠は1週間アクセスがないと一時停止する。GitHub Actions（`.github/workflows/cron.yml`）が1日1回 `POST /api/cron` を呼んで防ぐ（確定）。同じ定期実行で放置対局の破棄も行う。`CRON_SECRET` を Vercel の環境変数と GitHub の Secrets に、本番のURLを GitHub の Variables の `APP_URL` に登録する。リポジトリに60日間動きがないと GitHub が定期実行を止めるので、止まったら Actions の画面から有効に戻す。
```

「持ち時間（確定）」の2つの箇条書きの下に足す:

```markdown
フェーズ8で決めた内容（提案）。

| 内容                          | 決めた内容                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 持ち時間の減り方              | 手番で5秒を超えた分だけ20秒から減る。局が変わると3人とも20秒に戻る                                          |
| 対局の最初の手番              | ルームから卓の画面へ移る分として、期限に10秒足す                                                            |
| ポン直後の時間切れ            | ツモ牌がないので、切れる牌のうち手牌の右端を切る                                                            |
| サイコロの出目の自動指定      | サーバーが乱数で選ぶ                                                                                        |
| サイコロの演出中の時間        | 演出の長さ（1振り2.2秒）を、そのあとの期限（次のサイコロの指定、局の結果）に足す                            |
| 即ツモ切りになる条件          | 手番、応答、サイコロの指定の時間切れ。局の結果の15秒ではならない                                            |
| 即ツモ切りの人の扱い          | 手番は即ツモ切り、応答は即スルー、サイコロは即指定、局の結果は確認済み扱い。和了できる形でも和了しない      |
| 即ツモ切りの解除              | 画面の「自動ツモ切り中　タップで復帰」をタップする（`resume` 操作）。その局の持ち時間は使い切ったままになる |
| 3人とも即ツモ切りになったとき | 進行を止める。誰かが復帰すれば再開し、10分進まなければ破棄する                                              |
| 残り時間の表示                | 自分が待たれているときだけ出す。手番は「5」→「+20」。即ツモ切りの人は名前の横に「自動」                     |
| 破棄された対局                | 対局とルームを破棄にし、結果と集計に残さない。牌譜は残す。3人は新しいルームを作れる                         |
```

「対局内の状態」の図の下の `ABANDONED（3人とも不在が10分）` はそのままでよい。

「Realtime Protocol」の箇条書きを直す:

- 「画面データには、…期限の時刻はフェーズ8で足す。」→「画面データには、サーバーが計算した「いま可能な操作の一覧」、期限の時刻、保存したサーバーの時刻、自分の持ち時間、即ツモ切り中の人を含める。クライアントは合法手を自分で判定しない。残り時間は、保存したサーバーの時刻との差から計算する。」
- 「局の結果は3人が「確認」を送ると次の局へ進む（15秒での自動進行はフェーズ8）。」→「局の結果は3人が「確認」を送るか、15秒たつと次の局へ進む。」
- 「時間切れの申告は `POST /api/games/:id/tick`（フェーズ8）。」→「時間切れの申告は `POST /api/games/:id/tick`。期限＋0.3秒＋席×0.2秒で送り、画面データが進むまで2秒ごとに送り直す。即ツモ切りの解除は、操作と同じ `POST /api/games/:id/actions` に `resume` を送る。」

APIの表に2行足す:

```markdown
| `POST /api/games/:id/tick` | 時間切れの申告。本文は版番号だけ |
| `POST /api/cron` | 定期実行。放置対局を破棄する（秘密の値つき）|
```

エラーの説明の「422 いまはできない操作」を「422 いまはできない操作（期限前の時間切れの申告を含む）」にする。

「Database Schema」の関数の一覧（`create_room`、…、`save_game`）に `abandon_stale_games` を足し、`game_secrets.state` の説明に「持ち時間の状態（`clock`）」を足す。

- [ ] **Step 2: 全部を通す**

```bash
npx prettier --write docs/SPEC.md
npm run typecheck && npm run lint && npm run test && npm run test:db && npm run format:check && npm run build
```

Expected: すべて成功

開発サーバーとローカルのSupabaseを動かして: `npm run test:play`
Expected: 「すべて成功」

- [ ] **Step 3: 実際の対局画面をブラウザで確かめる**

`/dev/table` はエンジンをブラウザで動かすので、通信を通した確認にはならない。ローカルで実際の対局を1つ作って確かめる。

1. `scripts/play-hanchan.mjs` と同じやり方（`admin.auth.admin.createUser`、プロフィールの承認、`signInWithPassword`）でテスト用のユーザーを3人作り、API（`POST /api/rooms`、`POST /api/rooms/join`）で対局を始める一時的なスクリプトを、スクラッチパッドのディレクトリに書いて実行する（リポジトリには入れない）。3人分のセッションCookieを出力させる。
2. Playwright で1人分のCookieを入れて `http://localhost:3000/games/<id>` を開く。
3. 自分の手番なら残り時間が出ることを確かめる。何もせずに待ち、期限のあと自分のブラウザが `/tick` を送って（ネットワークの記録で確かめる）、ツモ切りされ、復帰の覆いが出ることを確かめる。
4. タップして復帰できることを確かめる。
5. ほかの2人は操作しないので、やがて3人とも自動になって止まる。DBで `update games set updated_at = now() - interval '11 minutes'` を実行し、画面をタップする。ページが読み込み直されて「この対局は破棄されました」が出ることを確かめる。`http://localhost:3000/` を開いて、新しいルームを作れる状態になっていることを確かめる。
6. 作ったユーザーとルームを消す。

確かめられなかった項目があれば、何を確かめていないかを報告に書く。

- [ ] **Step 4: コミット**

```bash
git add docs/SPEC.md
git commit -m "docs: record the phase 8 clock, timeout and abandonment rules"
```

---

## リリースの手順（ユーザーの確認が必要）

実装とレビューが終わってから、ユーザーに確認して進める。勝手に実行しない。

1. `CRON_SECRET` を決める（`openssl rand -hex 32`）。Vercel の環境変数（Production）と、GitHub の Secrets（`CRON_SECRET`）に登録する。GitHub の Variables に `APP_URL`（本番のURL）を登録する。
2. 本番DBにマイグレーションを当てる: `npx supabase db push --dry-run` で内容を見せてから `npx supabase db push`。関数を1つ足すだけで、表は変わらない。
3. `phase-8-timers` を main にマージして push する（Vercel が本番にデプロイする）。マイグレーションを先に当てる（ページが `abandon_stale_games` を呼ぶため。先にデプロイしても、ページ側は失敗を無視するので壊れはしない）。
4. GitHub の Actions の画面から `cron` を手動で1回実行し、成功することを確かめる。
5. デプロイの時点で進行中の対局は、次に誰かが操作したときから時計が動く。
