# フェーズ9 対局履歴と集計 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 終わった対局の一覧と、全員の通算成績（順位、スコア、和了、放銃、リーチ時の良形率、放銃時のシャンテン数など）を、承認済みの全員が見られるようにする。

**Architecture:** 対局が終わったら、牌譜（`game_events`）から3人それぞれの集計値（回数と合計）を純粋な関数で計算して `game_stats` に保存する。成績の画面は `game_results` と `game_stats` を人ごとに足し合わせ、率と平均を出す。計算しそこねた対局と、計算方法を変えたあとの再計算は、1日1回の定期実行が拾う。

**Tech Stack:** Next.js 16.3.8（App Router）、React 19.2、TypeScript strict、Vitest、Supabase（Postgres、pgTAP）

**Spec:** `docs/superpowers/specs/2026-10-02-phase9-history-stats-design.md`（全体の仕様は `docs/SPEC.md`）

## Global Constraints

- 日別の集計、期間や相手での絞り込み、グラフ、リプレイ画面は作らない。
- 表記は「良形」「愚形」。
- 破棄された対局（`games.status = 'abandoned'`）は集計しない。`game_results` は終局した対局にしかないので、自然に入らない。
- 牌譜（`game_events`）と `games` の読み取り権限は変えない。広げるのは `game_results` と、新しい `game_stats` だけ（承認済みなら全員分）。
- `src/stats/` はエンジン（`@/engine`）にだけ依存する。`server-only`、DB、UI を読み込まない。
- エンジンのルール（合法手、点数、祝儀）は変えない。足すのは計算の関数（シャンテン数、待ちの形）と、既存の内部の関数の export だけ。
- `tsconfig.json` は `exactOptionalPropertyTypes` と `noUncheckedIndexedAccess` が有効。
- 依存パッケージを増やさない。有料サービスを使わない。
- コードのコメントと画面の文言は日本語。既存のコメントの密度と書き方に合わせる。コミットメッセージは英語で、末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` を付ける。
- Next.js はこのリポジトリの版に合わせる。ページやルートを書く前に `node_modules/next/dist/docs/01-app/` の該当ページを読む（`AGENTS.md`）。
- ローカルのDBは `npm run db:reset` でリセットしない（ユーザーのデータが消える）。マイグレーションは `npx supabase migration up --local` で足す。
- 各タスクの終わりに `npm run typecheck && npm run lint && npm run test` を通し、変えたファイルに `npx prettier --write` をかけてからコミットする。
- ブランチは `phase-9-history-stats`。本番DBへの適用（`npx supabase db push`）はユーザーが自分で実行する。main へのマージはユーザーの確認を取ってから行う。

## ファイルの構成

| ファイル                                                        | 役割                                                          |
| --------------------------------------------------------------- | ------------------------------------------------------------- |
| `src/engine/agari.ts`                                           | `HAND_KINDS`、`toCounts` の export、`completesRyanmen` の追加 |
| `src/engine/shanten.ts`（新規、＋test）                         | シャンテン数                                                  |
| `src/engine/waits.ts`（新規、＋test）                           | 待ちが良形かどうか                                            |
| `src/engine/yaku.ts`                                            | 両面の判定を `completesRyanmen` に置き換える                  |
| `src/engine/index.ts`                                           | `shanten`、`waits` の export                                  |
| `src/stats/types.ts`（新規）                                    | 集計値の型、版番号                                            |
| `src/stats/analyze.ts`（新規、＋test）                          | 牌譜1対局分から3人の集計値を出す                              |
| `src/stats/summary.ts`（新規、＋test）                          | 足し合わせ、割り算                                            |
| `src/stats/metrics.ts`（新規、＋test）                          | 画面に出す項目の一覧（名前、分類、計算、書式）                |
| `src/lib/datetime.ts`（新規、＋test）                           | 日本時間の日時の表示                                          |
| `supabase/migrations/20261002030000_game_stats.sql`             | `game_stats`、権限、`save_game_stats`、`games_needing_stats`  |
| `supabase/tests/database/stats.test.sql`（新規）                | 上のテスト                                                    |
| `supabase/tests/database/rls.test.sql`                          | `game_results` の権限の変更に合わせる                         |
| `src/server/database.types.ts`                                  | 型の再生成                                                    |
| `src/server/stats.ts`（新規）                                   | 計算と保存、未計算の対局の計算、画面用の読み出し              |
| `src/app/api/games/[id]/actions/route.ts`、`tick/route.ts`      | 終局したら、応答のあとに集計する                              |
| `src/app/api/cron/route.ts`                                     | 未計算の対局を計算する                                        |
| `scripts/play-hanchan.mjs`                                      | 終局後に集計が保存されることの検証、`--keep`                  |
| `src/components/screen.tsx`                                     | 横に広い画面用の `wide`                                       |
| `src/app/history/page.tsx`（新規）                              | 対局履歴                                                      |
| `src/app/stats/page.tsx`、`src/app/stats/[id]/page.tsx`（新規） | 成績の一覧、個人の成績                                        |
| `src/app/page.tsx`                                              | ホームからのリンク                                            |
| `docs/SPEC.md`                                                  | 決めた内容の反映                                              |

---

### Task 1: シャンテン数

**Files:**

- Create: `src/engine/shanten.ts`、`src/engine/shanten.test.ts`
- Modify: `src/engine/agari.ts`（export を2つ足す）、`src/engine/index.ts`

**Interfaces:**

- Produces（`src/engine/agari.ts`）: `export const HAND_KINDS: TileKind[]`、`export function toCounts(kinds: readonly TileKind[]): number[]`（どちらも既存のものを export するだけ）
- Produces（`src/engine/shanten.ts`）:
  - `shantenOfKinds(kinds: readonly TileKind[], meldCount: number): number`
  - `shanten(concealed: readonly TileId[], melds: readonly Meld[]): number`
  - −1 が和了形、0 が聴牌。花牌は数えない。副露（暗槓を含む）があるときは通常形だけ

- [ ] **Step 1: 失敗するテストを書く**

`src/engine/shanten.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { HAND_KINDS, isCompleteHand } from "./agari";
import { createRng } from "./rng";
import { shanten, shantenOfKinds } from "./shanten";
import { seedOf, tiles } from "./testing";
import { kindsOf, rankOf, suitOf } from "./tiles";
import type { TileKind } from "./tiles";

const of = (notation: string) => shanten(tiles(notation), []);

describe("shanten（シャンテン数）", () => {
  it("和了形は −1、聴牌は 0", () => {
    expect(of("123456789p 234s 11z")).toBe(-1);
    expect(of("123456789p 23s 11z")).toBe(0);
    expect(of("123456789p 24s 11z")).toBe(0);
    expect(of("123456789p 234s 1z")).toBe(0);
  });

  it("面子、塔子、雀頭の数から数える", () => {
    // 3面子＋雀頭＋孤立牌2枚
    expect(of("123456789p 29s 11z")).toBe(1);
    // 2面子＋塔子2つ＋雀頭
    expect(of("123456p 23s 78s 11z 7z")).toBe(1);
    // 2面子＋塔子1つ＋雀頭
    expect(of("123456p 23s 9s 11z 67z")).toBe(2);
  });

  it("塔子は面子と合わせて4つまでしか数えない", () => {
    // 塔子5つ＋対子1つ＋孤立牌1枚。対子を雀頭にすると塔子は5つ残るが、数えるのは4つ
    expect(of("12p 45p 78p 12s 45s 11z 7z")).toBe(3);
  });

  it("萬子と字牌は順子にならない", () => {
    // 3面子。1萬と9萬、東と南は塔子にならないので、塔子も雀頭もない
    expect(of("123456789p 19m 12z")).toBe(2);
  });

  it("七対子は対子の数で数える。同じ牌4枚は2対子", () => {
    expect(of("11m 99m 11p 22p 44s 66s 7z")).toBe(0);
    expect(of("1111p 44p 66s 88s 55z 6z")).toBe(0);
    expect(of("11m 99m 11p 22p 4s 6s 8s 5z 7z")).toBe(2);
  });

  it("国士無双は么九牌の種類で数える", () => {
    expect(of("19m 19p 19s 1234567z")).toBe(0);
    expect(of("19m 19p 19s 123456z 5p")).toBe(1);
    expect(of("19m 19p 19s 12345z 55p")).toBe(2);
  });

  it("どの形にも遠い手は、一番近い形で数える", () => {
    // 么九牌が8種類。国士無双まで5
    expect(of("19m 258p 147s 12346z")).toBe(5);
  });

  it("副露しているときは通常形だけ。副露は面子として数える", () => {
    const pon = [{ type: "pon" as const, tiles: tiles("777z") }];
    expect(shanten(tiles("123456p 23s 11z"), pon)).toBe(0);
    expect(shanten(tiles("123456p 234s 11z"), pon)).toBe(-1);
    // 対子4つと孤立牌2枚。副露があるので七対子では数えず、面子1、雀頭1、塔子3
    expect(shanten(tiles("11m 99m 11p 44s 5z 6z"), pon)).toBe(2);
  });

  it("花牌は数えない", () => {
    expect(of("123456789p 23s 11z 1f")).toBe(0);
  });
});

/** 4面子1雀頭から作った、1種類4枚までの14枚。 */
function randomCompleteHand(rng: ReturnType<typeof createRng>): TileKind[] {
  for (;;) {
    const kinds: TileKind[] = [];
    for (let group = 0; group < 4; group++) {
      const kind = HAND_KINDS[rng.nextInt(HAND_KINDS.length)]!;
      const suit = suitOf(kind);
      const sequence =
        (suit === "p" || suit === "s") &&
        rankOf(kind) <= 7 &&
        rng.nextInt(2) === 0;
      if (sequence) {
        const start = rankOf(kind);
        for (let i = 0; i < 3; i++)
          kinds.push(`${start + i}${suit}` as TileKind);
      } else {
        kinds.push(kind, kind, kind);
      }
    }
    const pair = HAND_KINDS[rng.nextInt(HAND_KINDS.length)]!;
    kinds.push(pair, pair);
    if (HAND_KINDS.every((k) => kinds.filter((x) => x === k).length <= 4)) {
      return kinds;
    }
  }
}

const countOf = (kinds: readonly TileKind[], kind: TileKind) =>
  kinds.filter((k) => k === kind).length;

describe("shanten（乱数で作った手牌）", () => {
  it("和了形の判定と一致し、良い牌を引くとちょうど1減る", () => {
    const rng = createRng(seedOf(8), 3);
    let checked = 0;
    for (let n = 0; n < 400; n++) {
      const complete = randomCompleteHand(rng);
      expect(shantenOfKinds(complete, 0)).toBe(-1);

      // 0〜3枚をでたらめな牌に取り替えた14枚
      const hand = [...complete];
      for (let swaps = rng.nextInt(4); swaps > 0; swaps--) {
        const kind = HAND_KINDS[rng.nextInt(HAND_KINDS.length)]!;
        if (countOf(hand, kind) < 4) hand[rng.nextInt(hand.length)] = kind;
      }
      expect(shantenOfKinds(hand, 0) === -1).toBe(isCompleteHand(hand, 0));

      // 1枚抜いた13枚
      const thirteen = [...hand];
      thirteen.splice(rng.nextInt(thirteen.length), 1);
      // 自分で4枚使っている牌の5枚目を待つ形は、引ける牌がないので除く
      if (HAND_KINDS.some((kind) => countOf(thirteen, kind) === 4)) continue;
      const value = shantenOfKinds(thirteen, 0);
      expect(value).toBeGreaterThanOrEqual(0);
      const afterDraw = HAND_KINDS.map((kind) =>
        shantenOfKinds([...thirteen, kind], 0),
      );
      expect(Math.min(...afterDraw)).toBe(value - 1);
      expect(value === 0).toBe(
        HAND_KINDS.some((kind) => isCompleteHand([...thirteen, kind], 0)),
      );
      checked++;
    }
    expect(checked).toBeGreaterThan(200);
  });

  it("kindsOf で牌IDから数えても同じ", () => {
    const ids = tiles("123456789p 29s 11z");
    expect(shanten(ids, [])).toBe(shantenOfKinds(kindsOf(ids), 0));
  });
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npx vitest run src/engine/shanten.test.ts`
Expected: FAIL（`./shanten` が見つからない、`HAND_KINDS` が export されていない）

- [ ] **Step 3: 実装する**

`src/engine/agari.ts`: `const HAND_KINDS = ...` を `export const HAND_KINDS = ...` に、`function toCounts(` を `export function toCounts(` に変える。`toCounts` の上にコメントを足す:

```ts
/** HAND_KINDS の並びで、種類ごとの枚数を数える。花牌は数えない。 */
```

`src/engine/shanten.ts`:

```ts
import { HAND_KINDS, toCounts } from "./agari";
import type { Meld } from "./agari";
import { isYaochu, kindsOf, suitOf } from "./tiles";
import type { TileId, TileKind } from "./tiles";

/*
 * シャンテン数。聴牌までにあと何枚の入れ替えが必要か。−1 が和了形、0 が聴牌。
 * 場に見えている枚数や、自分で4枚使い切っている待ちは考えない。
 */

/** 順子や塔子で隣の牌とつながる色（筒子と索子）。萬子は1と9しかなく、つながらない。 */
function isSequenceSuit(kind: TileKind): boolean {
  const suit = suitOf(kind);
  return suit === "p" || suit === "s";
}

/** 4面子1雀頭の形までのシャンテン数。meldCount は副露と暗槓の数。 */
function standardShanten(counts: number[], meldCount: number): number {
  let best = 8;
  let mentsu = meldCount;
  let taatsu = 0;
  let head = 0;

  /** index の牌から offset 先の牌が、同じ色で手にあるか。 */
  const linked = (index: number, offset: number): boolean => {
    const kind = HAND_KINDS[index]!;
    const other = HAND_KINDS[index + offset];
    return (
      other !== undefined &&
      isSequenceSuit(kind) &&
      suitOf(other) === suitOf(kind) &&
      counts[index + offset]! > 0
    );
  };

  // 種類の小さい方から、面子、雀頭、塔子の取り方をすべて試す
  const search = (from: number): void => {
    let index = from;
    while (index < counts.length && counts[index] === 0) index++;
    if (index === counts.length) {
      // 面子と塔子は合わせて4つまで。雀頭は別に数える
      const blocks = Math.min(taatsu, 4 - mentsu);
      best = Math.min(best, 8 - 2 * mentsu - blocks - head);
      return;
    }

    if (counts[index]! >= 3) {
      counts[index]! -= 3;
      mentsu++;
      search(index);
      mentsu--;
      counts[index]! += 3;
    }
    if (linked(index, 1) && linked(index, 2)) {
      for (let i = 0; i < 3; i++) counts[index + i]!--;
      mentsu++;
      search(index);
      mentsu--;
      for (let i = 0; i < 3; i++) counts[index + i]!++;
    }
    if (head === 0 && counts[index]! >= 2) {
      counts[index]! -= 2;
      head = 1;
      search(index);
      head = 0;
      counts[index]! += 2;
    }
    if (mentsu + taatsu < 4) {
      if (counts[index]! >= 2) {
        counts[index]! -= 2;
        taatsu++;
        search(index);
        taatsu--;
        counts[index]! += 2;
      }
      for (const offset of [1, 2]) {
        if (!linked(index, offset)) continue;
        counts[index]!--;
        counts[index + offset]!--;
        taatsu++;
        search(index);
        taatsu--;
        counts[index]!++;
        counts[index + offset]!++;
      }
    }

    // 残りは孤立牌として使わない
    const rest = counts[index]!;
    counts[index] = 0;
    search(index + 1);
    counts[index] = rest;
  };

  search(0);
  return best;
}

/** 七対子までのシャンテン数。このルールでは同じ牌4枚を2対子と数える。 */
function chiitoitsuShanten(counts: readonly number[]): number {
  const pairs = counts.reduce((sum, count) => sum + Math.floor(count / 2), 0);
  return 6 - pairs;
}

/** 国士無双までのシャンテン数。 */
function kokushiShanten(counts: readonly number[]): number {
  let kinds = 0;
  let pair = 0;
  HAND_KINDS.forEach((kind, index) => {
    if (!isYaochu(kind)) return;
    if (counts[index]! > 0) kinds++;
    if (counts[index]! >= 2) pair = 1;
  });
  return 13 - kinds - pair;
}

/**
 * 種類の並びで渡された門前部分のシャンテン数。
 * 通常形、七対子、国士無双のうち一番小さい値。副露があるときは通常形だけ。
 */
export function shantenOfKinds(
  kinds: readonly TileKind[],
  meldCount: number,
): number {
  const counts = toCounts(kinds);
  const standard = standardShanten(counts, meldCount);
  if (meldCount > 0) return standard;
  return Math.min(standard, chiitoitsuShanten(counts), kokushiShanten(counts));
}

/** 手牌（門前部分）と副露からシャンテン数を出す。花牌は数えない。 */
export function shanten(
  concealed: readonly TileId[],
  melds: readonly Meld[],
): number {
  return shantenOfKinds(kindsOf(concealed), melds.length);
}
```

`src/engine/index.ts` に `export * from "./shanten";` を足す（`agari` の下）。

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run src/engine/shanten.test.ts`
Expected: PASS

手で数えた期待値と合わないテストがあれば、まず手牌の枚数（13枚）と、テストのコメントに書いた面子・塔子・雀頭の数え方を見直す。実装の式（8 − 面子×2 − 塔子 − 雀頭、面子と塔子は合わせて4つまで）は変えない。

- [ ] **Step 5: 全体を確かめてコミット**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: すべて PASS

```bash
npx prettier --write src/engine/agari.ts src/engine/shanten.ts src/engine/shanten.test.ts src/engine/index.ts
git add src/engine
git commit -m "feat(engine): add a shanten calculator"
```

---

### Task 2: 待ちの形（良形か愚形か）

**Files:**

- Create: `src/engine/waits.ts`、`src/engine/waits.test.ts`
- Modify: `src/engine/agari.ts`（`completesRyanmen` を足す）、`src/engine/yaku.ts`（それを使う）、`src/engine/index.ts`

**Interfaces:**

- Produces（`src/engine/agari.ts`）: `completesRyanmen(group: Group, winKind: TileKind): boolean`
- Produces（`src/engine/waits.ts`）: `isGoodWait(concealed: readonly TileId[], melds: readonly Meld[]): boolean`（聴牌でなければ false）

- [ ] **Step 1: 失敗するテストを書く**

`src/engine/waits.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { tiles } from "./testing";
import { isGoodWait } from "./waits";

const good = (notation: string) => isGoodWait(tiles(notation), []);

describe("isGoodWait（待ちが良形か）", () => {
  it("両面を含む待ちは良形", () => {
    // 両面（1索と4索）
    expect(good("123456789p 23s 11z")).toBe(true);
    // 3面張（1、4、7索）
    expect(good("123456p 23456s 11z")).toBe(true);
    // 両面とシャンポンの複合（3334索：2、5索の両面と4索の単騎）
    expect(good("123456789p 3334s")).toBe(true);
  });

  it("両面を含まない待ちは愚形", () => {
    // カンチャン
    expect(good("123456789p 24s 11z")).toBe(false);
    // ペンチャン（12索の3索待ち、89索の7索待ち）
    expect(good("123456789p 12s 11z")).toBe(false);
    expect(good("123456789p 89s 11z")).toBe(false);
    // 単騎
    expect(good("123456789p 234s 1z")).toBe(false);
    // ノベタン（2345索の2、5索待ち。どちらも雀頭になる）
    expect(good("123456789p 2345s")).toBe(false);
    // シャンポン
    expect(good("123456789p 22s 11z")).toBe(false);
    // 七対子
    expect(good("11m 99m 11p 22p 44s 66s 7z")).toBe(false);
    // 国士無双
    expect(good("19m 19p 19s 1234567z")).toBe(false);
  });

  it("聴牌していなければ false", () => {
    expect(good("123456789p 29s 11z")).toBe(false);
  });

  it("副露していても、門前部分の待ちで決める", () => {
    const pon = [{ type: "pon" as const, tiles: tiles("777z") }];
    expect(isGoodWait(tiles("123456p 23s 11z"), pon)).toBe(true);
    expect(isGoodWait(tiles("123456p 24s 11z"), pon)).toBe(false);
  });
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npx vitest run src/engine/waits.test.ts`
Expected: FAIL（`./waits` が見つからない）

- [ ] **Step 3: 実装する**

`src/engine/agari.ts` の `decompose` の下に足す:

```ts
/**
 * 和了牌が、その順子の両面待ちを埋めたか。
 * 順子の端の牌で、反対側がペンチャン（12の3待ち、89の7待ち）でないとき。
 */
export function completesRyanmen(group: Group, winKind: TileKind): boolean {
  if (group.type !== "shuntsu") return false;
  if (suitOf(group.kind) !== suitOf(winKind)) return false;
  const first = rankOf(group.kind);
  const position = rankOf(winKind) - first;
  return (position === 0 && first !== 7) || (position === 2 && first !== 1);
}
```

`src/engine/yaku.ts` の `shapesOf` の中、順子の分岐を置き換える。import に `completesRyanmen` を足す（`./agari` から）。

置き換える前:

```ts
if (suitOf(group.kind) !== suitOf(winKind)) return;
const position = rankOf(winKind) - rankOf(group.kind);
if (position < 0 || position > 2) return;
const first = rankOf(group.kind);
const ryanmen =
  (position === 0 && first !== 7) || (position === 2 && first !== 1);
shapes.push(build(null, ryanmen));
```

置き換えたあと:

```ts
if (suitOf(group.kind) !== suitOf(winKind)) return;
const position = rankOf(winKind) - rankOf(group.kind);
if (position < 0 || position > 2) return;
shapes.push(build(null, completesRyanmen(group, winKind)));
```

`src/engine/waits.ts`:

```ts
import { completesRyanmen, decompose, waitingKinds } from "./agari";
import type { Meld } from "./agari";
import { isFlower, kindsOf } from "./tiles";
import type { TileId } from "./tiles";

/**
 * 待ちが良形か。待ち牌のうち1種類でも、和了形のどれかの読み方で順子の両面を埋める牌があれば良形。
 * カンチャン、ペンチャン、単騎、ノベタン、シャンポン、七対子、国士無双は愚形。聴牌していなければ false。
 * 役の平和と同じ両面の判定を使う。場に見えている枚数は考えない。
 */
export function isGoodWait(
  concealed: readonly TileId[],
  melds: readonly Meld[],
): boolean {
  const hand = concealed.filter((id) => !isFlower(id));
  const kinds = kindsOf(hand);
  const groupCount = 4 - melds.length;
  return waitingKinds(hand, melds).some((wait) =>
    decompose([...kinds, wait], groupCount).some(({ groups }) =>
      groups.some((group) => completesRyanmen(group, wait)),
    ),
  );
}
```

`src/engine/index.ts` に `export * from "./waits";` を足す（`shanten` の下）。

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run src/engine/waits.test.ts src/engine/yaku.test.ts`
Expected: PASS（役のテストも変わらず通る）

- [ ] **Step 5: 全体を確かめてコミット**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: すべて PASS

```bash
npx prettier --write src/engine/agari.ts src/engine/yaku.ts src/engine/waits.ts src/engine/waits.test.ts src/engine/index.ts
git add src/engine
git commit -m "feat(engine): classify waits as good or bad shape"
```

---

### Task 3: 牌譜の分析

**Files:**

- Create: `src/stats/types.ts`、`src/stats/analyze.ts`、`src/stats/analyze.test.ts`
- Modify: `vitest.config.ts` は変えない（`src/**/*.test.ts` に入っている）

**Interfaces:**

- Consumes: Task 1 の `shanten`、Task 2 の `isGoodWait`、エンジンの `waitingKinds`、`isCompleteHand`、`kindsOf`、`isFlower`、`tileOf`、`SEATS`、型 `GameEvent`、`Meld`、`PerSeat`、`Seat`、`TileId`、`RoundOutcome`、`WinRecord`
- Produces（`src/stats/types.ts`）:
  - `STATS_VERSION = 1`
  - `interface GameStats`（下のコードのとおり。すべて数値）
  - `STAT_KEYS: readonly (keyof GameStats)[]`
  - `emptyStats(): GameStats`
- Produces（`src/stats/analyze.ts`）:
  - `type StatsEvent = GameEvent | { type: "seed"; seed: string }`
  - `analyzeGame(events: readonly StatsEvent[]): PerSeat<GameStats>`（牌譜と手牌が合わなければ例外）

- [ ] **Step 1: 型を書く**

`src/stats/types.ts`:

```ts
/**
 * 集計の計算方法の版番号。項目や数え方を変えたら1つ上げる。
 * 定期実行が、古い版で計算した対局を計算し直す。
 */
export const STATS_VERSION = 1;

/**
 * 1対局の1人分の集計値。すべて回数か合計で、率や平均は画面に出すときに計算する。
 * 定義は docs/SPEC.md の「集計」を参照。
 */
export interface GameStats {
  /** 参加した局の数 */
  rounds: number;

  // ---- 和了 ----
  wins: number;
  tsumoWins: number;
  /** 和了で動いた自分の点棒の合計（供託と本場を含む。逆ポッチは負） */
  winPoints: number;
  /** 和了巡目の合計 */
  winTurns: number;

  // ---- 放銃 ----
  dealIns: number;
  dealInPoints: number;
  /** 放銃時のシャンテン数の合計 */
  dealInShanten: number;
  dealInTenpai: number;
  dealInOneAway: number;
  /** 2向聴以上での放銃 */
  dealInFar: number;
  /** 和了者がリーチしていた放銃 */
  dealInToRiichi: number;
  /** 自分がリーチ中だった放銃 */
  dealInWhileRiichi: number;
  /** 自分がポンか大明槓をしていた放銃 */
  dealInWhileOpen: number;

  // ---- リーチ ----
  /** 成立したリーチ */
  riichi: number;
  riichiGood: number;
  riichiWins: number;
  riichiIppatsu: number;
  /** 裏ドラが1枚以上乗った和了 */
  riichiUra: number;
  /** リーチ巡目の合計 */
  riichiTurns: number;
  /** 追いかけリーチ */
  riichiChase: number;
  doubleStake: number;
  doubleStakeWins: number;

  // ---- 副露、流局 ----
  /** ポンか大明槓をした局 */
  callRounds: number;
  draws: number;
  drawTenpai: number;

  // ---- このルール特有 ----
  diceChances: number;
  diceHits: number;
  /** サイコロで動いた自分の祝儀（払った分は負） */
  diceChips: number;
  pocchiWins: number;
  yakuman: number;
  tobiMade: number;
  tobiSuffered: number;
  /** 和了で受け取った祝儀の内訳 */
  chipsRed: number;
  chipsGold: number;
  chipsUra: number;
  chipsIppatsu: number;
  chipsYakuman: number;
}

export const STAT_KEYS = [
  "rounds",
  "wins",
  "tsumoWins",
  "winPoints",
  "winTurns",
  "dealIns",
  "dealInPoints",
  "dealInShanten",
  "dealInTenpai",
  "dealInOneAway",
  "dealInFar",
  "dealInToRiichi",
  "dealInWhileRiichi",
  "dealInWhileOpen",
  "riichi",
  "riichiGood",
  "riichiWins",
  "riichiIppatsu",
  "riichiUra",
  "riichiTurns",
  "riichiChase",
  "doubleStake",
  "doubleStakeWins",
  "callRounds",
  "draws",
  "drawTenpai",
  "diceChances",
  "diceHits",
  "diceChips",
  "pocchiWins",
  "yakuman",
  "tobiMade",
  "tobiSuffered",
  "chipsRed",
  "chipsGold",
  "chipsUra",
  "chipsIppatsu",
  "chipsYakuman",
] as const satisfies readonly (keyof GameStats)[];

export function emptyStats(): GameStats {
  return Object.fromEntries(
    STAT_KEYS.map((key) => [key, 0]),
  ) as unknown as GameStats;
}
```

- [ ] **Step 2: 失敗するテストを書く**

`src/stats/analyze.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  SEATS,
  applyAction,
  createRng,
  startRoundFromDeck,
  tileOf,
} from "@/engine";
import type { Action, RoundOutcome, Seat } from "@/engine";
import { buildDeck, seedOf } from "@/engine/testing";
import type { DeckSpec } from "@/engine/testing";
import { applyTableAction, buildView, startTable } from "@/server/table";
import { analyzeGame } from "./analyze";
import type { StatsEvent } from "./analyze";
import { STAT_KEYS } from "./types";

/** 親が席0の局を、牌の並びを決めて始める。操作を送ると牌譜がたまる。 */
function scenario(deck: DeckSpec) {
  const first = startRoundFromDeck(buildDeck(deck), { dealer: 0 });
  let state = first.state;
  const events: StatsEvent[] = [
    { type: "roundStart", roundIndex: 0, honba: 0, dealer: 0 },
    ...first.events,
  ];
  const act = (action: Action) => {
    const step = applyAction(state, action);
    state = step.state;
    events.push(...step.events);
  };
  /** その種類の牌を切る。riichi ならリーチを宣言して切る。 */
  const cut = (seat: Seat, kind: string, riichi = false) => {
    const tile = state.hands[seat].find((id) => tileOf(id).kind === kind);
    if (tile === undefined) throw new Error(`${kind} が手牌にありません`);
    act(
      riichi
        ? { type: "riichi", seat, tile, doubleStake: false }
        : { type: "discard", seat, tile },
    );
  };
  const outcome = (): RoundOutcome => {
    if (!state.outcome) throw new Error("局が終わっていません");
    return state.outcome;
  };
  return { act, cut, events, outcome };
}

/** 席1は筒子の刻子3つと66z。席2はばらばら。どちらも席0の邪魔をしない。 */
const OTHERS = ["111222333p 3s 9s 66z", "19m 456789s 12345z"] as const;

describe("analyzeGame（リーチと和了）", () => {
  it("良形のリーチ、一発ツモ、裏ドラ", () => {
    // 席0は 23索の両面待ち。裏ドラ表示牌が3索なので、4索が裏ドラ
    const s = scenario({
      hands: ["123456789p 23s 11z", ...OTHERS],
      live: "7z 1m 9m 4s",
      ura: "3s",
    });
    s.cut(0, "7z", true);
    s.cut(1, "1m");
    s.cut(2, "9m");
    s.act({ type: "tsumo", seat: 0 });

    const [a, b, c] = analyzeGame(s.events);
    expect(a).toMatchObject({
      rounds: 1,
      riichi: 1,
      riichiGood: 1,
      riichiTurns: 1,
      riichiChase: 0,
      wins: 1,
      tsumoWins: 1,
      winTurns: 2,
      riichiWins: 1,
      riichiIppatsu: 1,
      riichiUra: 1,
      dealIns: 0,
      callRounds: 0,
      // ツモなので2人から。裏ドラ1枚と一発1枚ずつ
      chipsRed: 0,
      chipsGold: 0,
      chipsUra: 2,
      chipsIppatsu: 2,
      chipsYakuman: 0,
    });
    expect(a.winPoints).toBe(s.outcome().wins[0]!.pointDeltas[0]);
    expect(a.winPoints).toBeGreaterThan(0);
    expect(a.chipsUra + a.chipsIppatsu).toBe(
      s.outcome().wins[0]!.chipDeltas[0],
    );
    for (const other of [b, c]) {
      expect(other).toMatchObject({
        rounds: 1,
        wins: 0,
        dealIns: 0,
        riichi: 0,
      });
    }
  });

  it("愚形のリーチにロン。放銃した人のシャンテン数を数える", () => {
    // 席0は 24索のカンチャン待ち。席1は1萬を引いて3索を切る
    const s = scenario({
      hands: ["123456789p 24s 11z", ...OTHERS],
      live: "7z 1m",
    });
    s.cut(0, "7z", true);
    s.cut(1, "3s");
    s.act({ type: "ron", seat: 0 });

    const [a, b] = analyzeGame(s.events);
    expect(a).toMatchObject({
      riichi: 1,
      riichiGood: 0,
      wins: 1,
      tsumoWins: 0,
      riichiWins: 1,
      riichiIppatsu: 1,
      winTurns: 2,
    });
    // 切ったあとの席1は 111222333p 9s 66z 1m。3面子と雀頭で1向聴
    expect(b).toMatchObject({
      dealIns: 1,
      dealInShanten: 1,
      dealInTenpai: 0,
      dealInOneAway: 1,
      dealInFar: 0,
      dealInToRiichi: 1,
      dealInWhileRiichi: 0,
      dealInWhileOpen: 0,
      riichi: 0,
    });
    // 和了点には自分のリーチ棒（供託1000点）が含まれる
    expect(a.winPoints - b.dealInPoints).toBe(1000);
  });

  it("宣言牌でロンされたリーチは、リーチに数えない", () => {
    // 席1は9索を引いて聴牌し、3索を切ってリーチを宣言する
    const s = scenario({
      hands: ["123456789p 24s 11z", ...OTHERS],
      live: "7z 9s",
    });
    s.cut(0, "7z", true);
    s.cut(1, "3s", true);
    s.act({ type: "ron", seat: 0 });

    const [, b] = analyzeGame(s.events);
    expect(b).toMatchObject({
      riichi: 0,
      riichiTurns: 0,
      dealIns: 1,
      dealInShanten: 0,
      dealInTenpai: 1,
      dealInWhileRiichi: 0,
    });
  });

  it("先にリーチした人がいれば、追いかけリーチ", () => {
    // 席0は両面待ち（1、4索）。席1の3索は通る
    const s = scenario({
      hands: ["123456789p 23s 11z", ...OTHERS],
      live: "7z 9s",
    });
    s.cut(0, "7z", true);
    s.cut(1, "3s", true);

    const [a, b] = analyzeGame(s.events);
    expect(a).toMatchObject({ riichi: 1, riichiGood: 1, riichiChase: 0 });
    // 席1は 9索と發のシャンポン待ち
    expect(b).toMatchObject({
      riichi: 1,
      riichiGood: 0,
      riichiChase: 1,
      riichiTurns: 1,
    });
    // 局が終わっていないので、局数はまだ数えない
    expect(a.rounds).toBe(0);
  });
});

/** 乱数で1半荘を打ち、牌譜を返す。和了できるときは和了する。 */
function autoPlay(seedNumber: number): StatsEvent[] {
  const rng = createRng(seedOf(seedNumber), 11);
  let seedCount = 0;
  const nextSeed = () => seedOf(seedNumber * 1000 + ++seedCount);
  const start = startTable({ seed: nextSeed() });
  let table = start.table;
  const events: StatsEvent[] = [...start.events];
  for (let steps = 0; table.game.phase === "playing"; steps++) {
    if (steps > 20000) throw new Error("対局が終わりません");
    const actions = SEATS.flatMap((seat) => buildView(table, seat).actions);
    const win = actions.find((a) => a.type === "tsumo" || a.type === "ron");
    const action = win ?? actions[rng.nextInt(actions.length)]!;
    const step = applyTableAction(table, action, nextSeed);
    table = step.table;
    events.push(...step.events);
  }
  return events;
}

describe("analyzeGame（自動対局）", () => {
  it("牌譜から手牌を復元でき、合計が牌譜と合う", () => {
    const total = Object.fromEntries(STAT_KEYS.map((key) => [key, 0]));
    for (let n = 1; n <= 8; n++) {
      const events = autoPlay(n);
      // 手牌の復元がずれていれば、リーチや和了のところで例外になる
      const stats = analyzeGame(events);

      const outcomes = events.flatMap((event) =>
        event.type === "roundEnd" ? [event.outcome] : [],
      );
      const wins = outcomes.flatMap((outcome) => outcome.wins);
      const sum = (key: (typeof STAT_KEYS)[number]) =>
        stats.reduce((value, seat) => value + seat[key], 0);

      for (const seat of SEATS) {
        const mine = stats[seat];
        expect(mine.rounds).toBe(outcomes.length);
        expect(mine.wins).toBe(wins.filter((w) => w.seat === seat).length);
        expect(mine.winPoints).toBe(
          wins
            .filter((w) => w.seat === seat)
            .reduce((value, w) => value + w.pointDeltas[seat], 0),
        );
        // 和了で受け取った祝儀の内訳は、牌譜の祝儀の移動と合う
        expect(
          mine.chipsRed +
            mine.chipsGold +
            mine.chipsUra +
            mine.chipsIppatsu +
            mine.chipsYakuman,
        ).toBe(
          wins
            .filter((w) => w.seat === seat && w.chipDeltas[seat] > 0)
            .reduce((value, w) => value + w.chipDeltas[seat], 0),
        );
        expect(mine.dealInTenpai + mine.dealInOneAway + mine.dealInFar).toBe(
          mine.dealIns,
        );
        expect(mine.riichiGood).toBeLessThanOrEqual(mine.riichi);
        expect(mine.riichiWins).toBeLessThanOrEqual(mine.riichi);
        expect(mine.drawTenpai).toBeLessThanOrEqual(mine.draws);
        expect(mine.callRounds).toBeLessThanOrEqual(mine.rounds);
      }
      // ロンされた局の数（ダブロンは1回）
      expect(sum("dealIns")).toBe(
        outcomes.filter((o) => o.wins.some((w) => w.kind === "ron")).length,
      );
      expect(sum("tobiMade")).toBe(sum("tobiSuffered"));
      expect(sum("diceChips")).toBe(0);
      expect(sum("diceChances")).toBe(
        events.filter((event) => event.type === "dice").length,
      );
      for (const key of STAT_KEYS) total[key]! += sum(key);
    }
    // 乱数の対局でも、主な出来事は一通り起きている
    expect(total.riichi).toBeGreaterThan(0);
    expect(total.dealIns).toBeGreaterThan(0);
    expect(total.callRounds).toBeGreaterThan(0);
    expect(total.draws).toBeGreaterThan(0);
  }, 60_000);
});
```

- [ ] **Step 3: テストが失敗することを確かめる**

Run: `npx vitest run src/stats/analyze.test.ts`
Expected: FAIL（`./analyze` が見つからない）

- [ ] **Step 4: `src/stats/analyze.ts` を書く**

```ts
import {
  SEATS,
  isCompleteHand,
  isFlower,
  isGoodWait,
  kindsOf,
  shanten,
  tileOf,
  waitingKinds,
} from "@/engine";
import type {
  GameEvent,
  Meld,
  PerSeat,
  RoundEvent,
  RoundOutcome,
  Seat,
  TileId,
  WinRecord,
} from "@/engine";
import { emptyStats } from "./types";
import type { GameStats } from "./types";

/*
 * 牌譜1対局分から、3人それぞれの集計値を出す。UI、DB、通信には依存しない。
 * 手牌は牌譜の配牌、ツモ、打牌、鳴きをたどって復元する。
 */

/** 牌譜のイベント。seed は直後に始まる局の乱数の種。 */
export type StatsEvent = GameEvent | { type: "seed"; seed: string };

type EventOf<T extends RoundEvent["type"]> = Extract<RoundEvent, { type: T }>;

/** 1局の間だけ持つ状態 */
interface Track {
  /** 門前部分。抜く前の花牌を含むことがある */
  hands: PerSeat<TileId[]>;
  melds: PerSeat<Meld[]>;
  /** 自分が切った牌の枚数 */
  discards: PerSeat<number>;
  /** 成立したリーチ */
  riichi: PerSeat<{ doubleStake: boolean } | null>;
  /** ポンか大明槓をした */
  open: PerSeat<boolean>;
}

const newTrack = (): Track => ({
  hands: [[], [], []],
  melds: [[], [], []],
  discards: [0, 0, 0],
  riichi: [null, null, null],
  open: [false, false, false],
});

const MISMATCH = "牌譜と手牌が合いません";

// 祝儀の枚数（docs/SPEC.md の「祝儀」）。内訳を出すために、エンジンの計算と同じ値を持つ
const GOLD_CHIPS = 2;
const YAKUMAN_TSUMO_CHIPS = 10;
const YAKUMAN_RON_CHIPS = 20;

function remove(track: Track, seat: Seat, tiles: readonly TileId[]): void {
  track.hands[seat] = track.hands[seat].filter((id) => !tiles.includes(id));
}

/** 花牌を除いた門前部分。 */
function concealedOf(track: Track, seat: Seat): TileId[] {
  return track.hands[seat].filter((id) => !isFlower(id));
}

function onKan(track: Track, event: EventOf<"kan">): void {
  const { seat } = event;
  remove(track, seat, event.tiles);
  const melds = track.melds[seat];
  if (event.kanType !== "kakan") {
    melds.push({ type: event.kanType, tiles: [...event.tiles] });
    if (event.kanType === "minkan") track.open[seat] = true;
    return;
  }
  // 加槓は、ポンした面子を槓子に変える
  const kind = tileOf(event.tiles[0]!).kind;
  const index = melds.findIndex(
    (meld) => meld.type === "pon" && tileOf(meld.tiles[0]!).kind === kind,
  );
  if (index < 0) throw new Error(MISMATCH);
  melds[index] = { type: "kakan", tiles: [...event.tiles] };
}

function onRiichi(
  stats: PerSeat<GameStats>,
  track: Track,
  event: EventOf<"riichi">,
): void {
  const { seat } = event;
  const mine = stats[seat];
  const hand = concealedOf(track, seat);
  // リーチは聴牌していないと宣言できない。ここで待ちがなければ、手牌の復元がずれている
  if (waitingKinds(hand, track.melds[seat]).length === 0) {
    throw new Error(MISMATCH);
  }
  mine.riichi++;
  if (isGoodWait(hand, track.melds[seat])) mine.riichiGood++;
  mine.riichiTurns += track.discards[seat];
  if (SEATS.some((other) => other !== seat && track.riichi[other])) {
    mine.riichiChase++;
  }
  if (event.doubleStake) mine.doubleStake++;
  track.riichi[seat] = { doubleStake: event.doubleStake };
}

/** 和了で受け取った祝儀を内訳に分ける。逆ポッチ（払う側）は数えない。 */
function addWinChips(mine: GameStats, win: WinRecord, doubleStake: boolean) {
  const received = win.chipDeltas[win.seat];
  if (received <= 0) return;
  const { result } = win;
  // 流し役満は役満祝儀だけ
  if (!result) {
    mine.chipsYakuman += received;
    return;
  }
  // ツモは2人から、ロンは1人から。2倍リーチは2倍
  const tsumo = win.from === null;
  const unit = (tsumo ? 2 : 1) * (doubleStake ? 2 : 1);
  mine.chipsRed += result.dora.red * unit;
  mine.chipsGold += result.dora.gold * GOLD_CHIPS * unit;
  mine.chipsUra += result.dora.ura * unit;
  if (result.yaku.some((yaku) => yaku.name === "ippatsu")) {
    mine.chipsIppatsu += unit;
  }
  mine.chipsYakuman +=
    result.yakuman * (tsumo ? YAKUMAN_TSUMO_CHIPS : YAKUMAN_RON_CHIPS) * unit;
}

function onWin(stats: PerSeat<GameStats>, track: Track, win: WinRecord): void {
  const { seat } = win;
  const mine = stats[seat];
  const riichi = track.riichi[seat];

  // 手牌の復元が合っているかを、和了形になることで確かめる
  if (win.kind === "tsumo" || win.kind === "ron") {
    const kinds = kindsOf(concealedOf(track, seat));
    if (win.kind === "ron") kinds.push(tileOf(win.winTile!).kind);
    if (!isCompleteHand(kinds, track.melds[seat].length)) {
      throw new Error(MISMATCH);
    }
  }

  mine.wins++;
  mine.winPoints += win.pointDeltas[seat];
  mine.winTurns += track.discards[seat] + 1;
  if (win.kind === "tsumo") mine.tsumoWins++;
  if (win.kind === "pocchi" || win.kind === "reversePocchi") mine.pocchiWins++;
  // 流し役満は result がなく、役満1つとして扱う
  if ((win.result?.yakuman ?? 1) > 0) mine.yakuman++;

  if (riichi) {
    mine.riichiWins++;
    if (win.result?.yaku.some((yaku) => yaku.name === "ippatsu")) {
      mine.riichiIppatsu++;
    }
    if ((win.result?.dora.ura ?? 0) > 0) mine.riichiUra++;
    if (riichi.doubleStake) mine.doubleStakeWins++;
  }
  addWinChips(mine, win, riichi?.doubleStake ?? false);
}

/** ロンされた人の集計。ダブロンは放銃1回で、放銃点は2人分の合計。 */
function onDealIn(
  stats: PerSeat<GameStats>,
  track: Track,
  from: Seat,
  rons: readonly WinRecord[],
): void {
  const mine = stats[from];
  mine.dealIns++;
  for (const win of rons) mine.dealInPoints -= win.pointDeltas[from];

  // 放銃した牌を切ったあとの手牌で数える
  const value = shanten(concealedOf(track, from), track.melds[from]);
  mine.dealInShanten += value;
  if (value <= 0) mine.dealInTenpai++;
  else if (value === 1) mine.dealInOneAway++;
  else mine.dealInFar++;

  if (rons.some((win) => track.riichi[win.seat])) mine.dealInToRiichi++;
  if (track.riichi[from]) mine.dealInWhileRiichi++;
  if (track.open[from]) mine.dealInWhileOpen++;
}

function onRoundEnd(
  stats: PerSeat<GameStats>,
  track: Track,
  outcome: RoundOutcome,
): void {
  for (const seat of SEATS) {
    const mine = stats[seat];
    mine.rounds++;
    if (track.open[seat]) mine.callRounds++;
    if (outcome.type === "exhaustiveDraw") {
      mine.draws++;
      if (outcome.tenpai.includes(seat)) mine.drawTenpai++;
    }
  }

  for (const win of outcome.wins) onWin(stats, track, win);
  for (const from of SEATS) {
    const rons = outcome.wins.filter(
      (win) => win.kind === "ron" && win.from === from,
    );
    if (rons.length > 0) onDealIn(stats, track, from, rons);
  }

  for (const { seat, to } of outcome.tobi) {
    stats[seat].tobiSuffered++;
    stats[to].tobiMade++;
  }
}

/** 牌譜1対局分から、席ごとの集計値を出す。牌譜と手牌が合わなければ例外を投げる。 */
export function analyzeGame(events: readonly StatsEvent[]): PerSeat<GameStats> {
  const stats: PerSeat<GameStats> = [emptyStats(), emptyStats(), emptyStats()];
  let track = newTrack();

  for (const event of events) {
    switch (event.type) {
      case "roundStart":
        track = newTrack();
        break;
      case "deal":
        track.hands = [
          [...event.hands[0]],
          [...event.hands[1]],
          [...event.hands[2]],
        ];
        break;
      case "draw":
        track.hands[event.seat].push(event.tile);
        break;
      case "flower":
        remove(track, event.seat, [event.tile]);
        break;
      case "discard":
        remove(track, event.seat, [event.tile]);
        track.discards[event.seat]++;
        break;
      case "riichi":
        onRiichi(stats, track, event);
        break;
      case "pon":
        remove(track, event.seat, event.tiles);
        track.melds[event.seat].push({ type: "pon", tiles: [...event.tiles] });
        track.open[event.seat] = true;
        break;
      case "kan":
        onKan(track, event);
        break;
      case "roundEnd":
        onRoundEnd(stats, track, event.outcome);
        break;
      case "dice":
        stats[event.seat].diceChances++;
        stats[event.seat].diceHits += event.hits;
        for (const seat of SEATS) {
          stats[seat].diceChips += event.chipDeltas[seat];
        }
        break;
      // seed、dora、gameEnd は集計に使わない
      default:
        break;
    }
  }
  return stats;
}
```

- [ ] **Step 5: 通ることを確かめる**

Run: `npx vitest run src/stats/analyze.test.ts`
Expected: PASS

補足:

- 4つの局の牌の並びは、計画を書くときにエンジンで確かめてある（良形の一発ツモで裏ドラ1枚、カンチャン待ちへの放銃で1向聴、宣言牌でのロン、追いかけリーチ）。
- 自動対局のテストで「牌譜と手牌が合いません」が出たら、手牌の復元（`pon`、`kan`、`flower`）がずれている。`src/engine/round.ts` の該当するイベントの出し方を読んで合わせる。祝儀の内訳が合わないときは、`src/engine/chips.ts` と `settlement.ts` の祝儀の計算を読んで合わせる（テストの期待値は変えない）。
- 最後の「主な出来事は一通り起きている」が、たまたま起きずに落ちる場合は、対局数（8）を増やす。

- [ ] **Step 6: 全体を確かめてコミット**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: すべて PASS

```bash
npx prettier --write src/stats
git add src/stats
git commit -m "feat(stats): analyse a game record into per-player counters"
```

---

### Task 4: 足し合わせと、画面に出す項目

**Files:**

- Create: `src/stats/summary.ts`、`src/stats/summary.test.ts`、`src/stats/metrics.ts`、`src/stats/metrics.test.ts`、`src/lib/datetime.ts`、`src/lib/datetime.test.ts`

**Interfaces:**

- Consumes: Task 3 の `GameStats`、`STAT_KEYS`、`emptyStats`
- Produces（`src/stats/summary.ts`）:
  - `interface PlayerTotals { games: number; rankSum: number; rankCounts: [number, number, number]; score: number; chips: number; points: number; stats: GameStats }`
  - `emptyTotals(): PlayerTotals`
  - `addResult(totals: PlayerTotals, result: { rank: number; points: number; score: number; chips: number }): PlayerTotals`
  - `addStats(a: GameStats, b: Partial<GameStats>): GameStats`
  - `ratio(numerator: number, denominator: number): number | null`
- Produces（`src/stats/metrics.ts`）:
  - `type MetricFormat = "count" | "signed" | "percent" | "decimal" | "round"`
  - `interface Metric { key: string; label: string; group: MetricGroup; main: boolean; format: MetricFormat; value: (totals: PlayerTotals) => number | null }`
  - `METRIC_GROUPS: readonly MetricGroup[]`、`METRICS: readonly Metric[]`
  - `formatMetric(format: MetricFormat, value: number | null): string`
- Produces（`src/lib/datetime.ts`）: `formatJst(iso: string): string`（例: `2026/10/02 21:05`）

- [ ] **Step 1: 失敗するテストを書く**

`src/stats/summary.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { addResult, addStats, emptyTotals, ratio } from "./summary";
import { emptyStats } from "./types";

describe("ratio（割り算）", () => {
  it("0で割るときは null", () => {
    expect(ratio(3, 0)).toBeNull();
    expect(ratio(1, 4)).toBe(0.25);
  });
});

describe("addStats（集計値の足し合わせ）", () => {
  it("項目ごとに足す。元の値は書き換えない", () => {
    const a = { ...emptyStats(), rounds: 10, wins: 3, diceChips: -70 };
    const b = { ...emptyStats(), rounds: 8, wins: 1, diceChips: 140 };
    expect(addStats(a, b)).toMatchObject({
      rounds: 18,
      wins: 4,
      diceChips: 70,
    });
    expect(a.rounds).toBe(10);
  });

  it("古い版の集計値にない項目は0として足す", () => {
    const a = { ...emptyStats(), rounds: 10 };
    expect(addStats(a, { rounds: 5 })).toMatchObject({ rounds: 15, wins: 0 });
  });
});

describe("addResult（半荘の結果の足し合わせ）", () => {
  it("順位、スコア、祝儀、持ち点を足す", () => {
    let totals = emptyTotals();
    totals = addResult(totals, { rank: 1, points: 52000, score: 40, chips: 5 });
    totals = addResult(totals, {
      rank: 3,
      points: 8000,
      score: -30,
      chips: -2,
    });
    expect(totals).toMatchObject({
      games: 2,
      rankSum: 4,
      rankCounts: [1, 0, 1],
      score: 10,
      chips: 3,
      points: 60000,
    });
  });
});
```

`src/stats/metrics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { METRICS, METRIC_GROUPS, formatMetric } from "./metrics";
import { emptyTotals } from "./summary";
import type { PlayerTotals } from "./summary";
import { emptyStats } from "./types";

const metric = (key: string) => {
  const found = METRICS.find((m) => m.key === key);
  if (!found) throw new Error(`項目がありません: ${key}`);
  return found;
};

const totals: PlayerTotals = {
  games: 4,
  rankSum: 7,
  rankCounts: [2, 1, 1],
  score: 35,
  chips: -6,
  points: 130000,
  stats: {
    ...emptyStats(),
    rounds: 40,
    wins: 10,
    tsumoWins: 4,
    winPoints: 80000,
    winTurns: 95,
    dealIns: 5,
    dealInPoints: 40000,
    dealInShanten: 6,
    dealInTenpai: 1,
    dealInOneAway: 2,
    dealInFar: 2,
    dealInToRiichi: 3,
    dealInWhileRiichi: 1,
    dealInWhileOpen: 2,
    riichi: 8,
    riichiGood: 6,
    riichiWins: 4,
    riichiIppatsu: 1,
    riichiUra: 2,
    riichiTurns: 56,
    riichiChase: 2,
    doubleStake: 2,
    doubleStakeWins: 1,
    callRounds: 12,
    draws: 6,
    drawTenpai: 3,
  },
};

describe("METRICS（画面に出す項目）", () => {
  it("キーは重複せず、分類はどれかに入る", () => {
    expect(new Set(METRICS.map((m) => m.key)).size).toBe(METRICS.length);
    for (const m of METRICS) expect(METRIC_GROUPS).toContain(m.group);
  });

  it("率と平均を、仕様の分母で計算する", () => {
    const value = (key: string) => metric(key).value(totals);
    expect(value("avgRank")).toBe(1.75);
    expect(value("firstRate")).toBe(0.5);
    expect(value("avgPoints")).toBe(32500);
    expect(value("winRate")).toBe(0.25);
    expect(value("dealInRate")).toBe(0.125);
    expect(value("riichiRate")).toBe(0.2);
    expect(value("callRate")).toBe(0.3);
    expect(value("tsumoRate")).toBe(0.4);
    expect(value("drawTenpaiRate")).toBe(0.5);
    expect(value("avgWinPoints")).toBe(8000);
    expect(value("avgDealInPoints")).toBe(8000);
    expect(value("avgWinTurn")).toBe(9.5);
    expect(value("riichiGoodRate")).toBe(0.75);
    expect(value("riichiBadRate")).toBe(0.25);
    expect(value("riichiWinRate")).toBe(0.5);
    // リーチ後放銃率はリーチした局で割る
    expect(value("riichiDealInRate")).toBe(0.125);
    // 一発率と裏ドラ率はリーチして和了した局で割る
    expect(value("ippatsuRate")).toBe(0.25);
    expect(value("uraRate")).toBe(0.5);
    expect(value("avgRiichiTurn")).toBe(7);
    expect(value("chaseRate")).toBe(0.25);
    expect(value("doubleStakeWinRate")).toBe(0.5);
    expect(value("avgDealInShanten")).toBe(1.2);
    expect(value("dealInTenpaiRate")).toBe(0.2);
    expect(value("dealInToRiichiRate")).toBe(0.6);
  });

  it("割る数が0なら null", () => {
    const empty = emptyTotals();
    for (const m of METRICS) {
      if (
        m.format === "percent" ||
        m.format === "decimal" ||
        m.format === "round"
      ) {
        expect(m.value(empty)).toBeNull();
      }
    }
  });
});

describe("formatMetric（書式）", () => {
  it("値がなければ —", () => {
    expect(formatMetric("percent", null)).toBe("—");
  });

  it("書式ごとに整える", () => {
    expect(formatMetric("count", 12)).toBe("12");
    expect(formatMetric("signed", 35)).toBe("+35");
    expect(formatMetric("signed", -6)).toBe("-6");
    expect(formatMetric("signed", 0)).toBe("0");
    expect(formatMetric("percent", 0.125)).toBe("12.5%");
    expect(formatMetric("decimal", 1.75)).toBe("1.75");
    expect(formatMetric("round", 8123.4)).toBe("8123");
  });
});
```

`src/lib/datetime.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatJst } from "./datetime";

describe("formatJst（日本時間の日時）", () => {
  it("UTCの時刻を日本時間で出す", () => {
    expect(formatJst("2026-10-02T12:05:00+00:00")).toBe("2026/10/02 21:05");
    // 日付が変わる
    expect(formatJst("2026-12-31T15:30:00Z")).toBe("2027/01/01 00:30");
  });
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npx vitest run src/stats/summary.test.ts src/stats/metrics.test.ts src/lib/datetime.test.ts`
Expected: FAIL（モジュールが見つからない）

- [ ] **Step 3: 実装する**

`src/stats/summary.ts`:

```ts
import { STAT_KEYS, emptyStats } from "./types";
import type { GameStats } from "./types";

/** 1人分の通算。半荘ごとの結果（game_results）と、局ごとの集計値（game_stats）を足したもの。 */
export interface PlayerTotals {
  /** 終わった半荘の数 */
  games: number;
  rankSum: number;
  /** 1位、2位、3位の回数 */
  rankCounts: [number, number, number];
  score: number;
  chips: number;
  /** 最終持ち点の合計 */
  points: number;
  stats: GameStats;
}

export function emptyTotals(): PlayerTotals {
  return {
    games: 0,
    rankSum: 0,
    rankCounts: [0, 0, 0],
    score: 0,
    chips: 0,
    points: 0,
    stats: emptyStats(),
  };
}

/** 0で割るときは null（画面では「—」）。 */
export function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

/** 集計値を項目ごとに足す。古い版で計算した集計値にない項目は0として扱う。 */
export function addStats(a: GameStats, b: Partial<GameStats>): GameStats {
  const sum = { ...a };
  for (const key of STAT_KEYS) sum[key] += b[key] ?? 0;
  return sum;
}

/** 半荘1回の結果を足す。 */
export function addResult(
  totals: PlayerTotals,
  result: { rank: number; points: number; score: number; chips: number },
): PlayerTotals {
  const rankCounts: [number, number, number] = [...totals.rankCounts];
  if (result.rank >= 1 && result.rank <= 3) {
    rankCounts[(result.rank - 1) as 0 | 1 | 2]++;
  }
  return {
    ...totals,
    games: totals.games + 1,
    rankSum: totals.rankSum + result.rank,
    rankCounts,
    score: totals.score + result.score,
    chips: totals.chips + result.chips,
    points: totals.points + result.points,
  };
}
```

`src/stats/metrics.ts`:

```ts
import { ratio } from "./summary";
import type { PlayerTotals } from "./summary";

/*
 * 成績の画面に出す項目。名前、分類、計算、書式をここにまとめる。
 * 定義は docs/SPEC.md の「集計」と同じにする。
 */

export const METRIC_GROUPS = [
  "基本",
  "局ごとの基本",
  "リーチ",
  "放銃",
  "このルール特有",
] as const;
export type MetricGroup = (typeof METRIC_GROUPS)[number];

/** count=整数、signed=符号つきの整数、percent=％（小数第1位）、decimal=小数第2位、round=四捨五入した整数 */
export type MetricFormat = "count" | "signed" | "percent" | "decimal" | "round";

export interface Metric {
  key: string;
  label: string;
  group: MetricGroup;
  /** 全員を並べる一覧にも出す */
  main: boolean;
  format: MetricFormat;
  value: (totals: PlayerTotals) => number | null;
}

type Row = [
  key: string,
  label: string,
  format: MetricFormat,
  main: boolean,
  value: Metric["value"],
];

const group = (name: MetricGroup, rows: Row[]): Metric[] =>
  rows.map(([key, label, format, main, value]) => ({
    key,
    label,
    group: name,
    main,
    format,
    value,
  }));

export const METRICS: readonly Metric[] = [
  ...group("基本", [
    ["games", "対局数", "count", true, (t) => t.games],
    ["avgRank", "平均順位", "decimal", true, (t) => ratio(t.rankSum, t.games)],
    [
      "firstRate",
      "1位率",
      "percent",
      true,
      (t) => ratio(t.rankCounts[0], t.games),
    ],
    [
      "secondRate",
      "2位率",
      "percent",
      true,
      (t) => ratio(t.rankCounts[1], t.games),
    ],
    [
      "thirdRate",
      "3位率",
      "percent",
      true,
      (t) => ratio(t.rankCounts[2], t.games),
    ],
    ["score", "通算スコア", "signed", true, (t) => t.score],
    ["chips", "通算祝儀", "signed", true, (t) => t.chips],
    [
      "avgPoints",
      "平均持ち点",
      "round",
      false,
      (t) => ratio(t.points, t.games),
    ],
  ]),
  ...group("局ごとの基本", [
    ["rounds", "局数", "count", false, (t) => t.stats.rounds],
    [
      "winRate",
      "和了率",
      "percent",
      true,
      (t) => ratio(t.stats.wins, t.stats.rounds),
    ],
    [
      "dealInRate",
      "放銃率",
      "percent",
      true,
      (t) => ratio(t.stats.dealIns, t.stats.rounds),
    ],
    [
      "riichiRate",
      "リーチ率",
      "percent",
      true,
      (t) => ratio(t.stats.riichi, t.stats.rounds),
    ],
    [
      "callRate",
      "副露率",
      "percent",
      true,
      (t) => ratio(t.stats.callRounds, t.stats.rounds),
    ],
    [
      "tsumoRate",
      "ツモ率",
      "percent",
      false,
      (t) => ratio(t.stats.tsumoWins, t.stats.wins),
    ],
    [
      "drawTenpaiRate",
      "流局時聴牌率",
      "percent",
      false,
      (t) => ratio(t.stats.drawTenpai, t.stats.draws),
    ],
    [
      "avgWinPoints",
      "平均和了点",
      "round",
      true,
      (t) => ratio(t.stats.winPoints, t.stats.wins),
    ],
    [
      "avgDealInPoints",
      "平均放銃点",
      "round",
      true,
      (t) => ratio(t.stats.dealInPoints, t.stats.dealIns),
    ],
    [
      "avgWinTurn",
      "平均和了巡目",
      "decimal",
      false,
      (t) => ratio(t.stats.winTurns, t.stats.wins),
    ],
  ]),
  ...group("リーチ", [
    [
      "riichiGoodRate",
      "リーチ時良形率",
      "percent",
      true,
      (t) => ratio(t.stats.riichiGood, t.stats.riichi),
    ],
    [
      "riichiBadRate",
      "リーチ時愚形率",
      "percent",
      false,
      (t) => ratio(t.stats.riichi - t.stats.riichiGood, t.stats.riichi),
    ],
    [
      "riichiWinRate",
      "リーチ後和了率",
      "percent",
      false,
      (t) => ratio(t.stats.riichiWins, t.stats.riichi),
    ],
    [
      "riichiDealInRate",
      "リーチ後放銃率",
      "percent",
      false,
      (t) => ratio(t.stats.dealInWhileRiichi, t.stats.riichi),
    ],
    [
      "ippatsuRate",
      "一発率",
      "percent",
      false,
      (t) => ratio(t.stats.riichiIppatsu, t.stats.riichiWins),
    ],
    [
      "uraRate",
      "裏ドラ率",
      "percent",
      false,
      (t) => ratio(t.stats.riichiUra, t.stats.riichiWins),
    ],
    [
      "avgRiichiTurn",
      "平均リーチ巡目",
      "decimal",
      false,
      (t) => ratio(t.stats.riichiTurns, t.stats.riichi),
    ],
    [
      "chaseRate",
      "追いかけリーチ率",
      "percent",
      false,
      (t) => ratio(t.stats.riichiChase, t.stats.riichi),
    ],
    [
      "doubleStake",
      "2倍リーチの回数",
      "count",
      false,
      (t) => t.stats.doubleStake,
    ],
    [
      "doubleStakeWinRate",
      "2倍リーチ和了率",
      "percent",
      false,
      (t) => ratio(t.stats.doubleStakeWins, t.stats.doubleStake),
    ],
  ]),
  ...group("放銃", [
    [
      "avgDealInShanten",
      "放銃時平均シャンテン数",
      "decimal",
      true,
      (t) => ratio(t.stats.dealInShanten, t.stats.dealIns),
    ],
    [
      "dealInTenpaiRate",
      "聴牌での放銃",
      "percent",
      false,
      (t) => ratio(t.stats.dealInTenpai, t.stats.dealIns),
    ],
    [
      "dealInOneAwayRate",
      "1向聴での放銃",
      "percent",
      false,
      (t) => ratio(t.stats.dealInOneAway, t.stats.dealIns),
    ],
    [
      "dealInFarRate",
      "2向聴以上での放銃",
      "percent",
      false,
      (t) => ratio(t.stats.dealInFar, t.stats.dealIns),
    ],
    [
      "dealInToRiichiRate",
      "リーチ者への放銃",
      "percent",
      false,
      (t) => ratio(t.stats.dealInToRiichi, t.stats.dealIns),
    ],
    [
      "dealInWhileRiichiRate",
      "リーチ中の放銃",
      "percent",
      false,
      (t) => ratio(t.stats.dealInWhileRiichi, t.stats.dealIns),
    ],
    [
      "dealInWhileOpenRate",
      "副露中の放銃",
      "percent",
      false,
      (t) => ratio(t.stats.dealInWhileOpen, t.stats.dealIns),
    ],
  ]),
  ...group("このルール特有", [
    [
      "diceChances",
      "サイコロチャンス",
      "count",
      false,
      (t) => t.stats.diceChances,
    ],
    ["diceHits", "サイコロの当たり", "count", false, (t) => t.stats.diceHits],
    ["diceChips", "サイコロの祝儀", "signed", false, (t) => t.stats.diceChips],
    ["pocchiWins", "ポッチでの和了", "count", false, (t) => t.stats.pocchiWins],
    ["yakuman", "役満", "count", false, (t) => t.stats.yakuman],
    ["tobiMade", "飛ばした回数", "count", false, (t) => t.stats.tobiMade],
    ["tobiSuffered", "飛んだ回数", "count", false, (t) => t.stats.tobiSuffered],
    ["chipsRed", "祝儀：赤", "count", false, (t) => t.stats.chipsRed],
    ["chipsGold", "祝儀：金", "count", false, (t) => t.stats.chipsGold],
    ["chipsUra", "祝儀：裏ドラ", "count", false, (t) => t.stats.chipsUra],
    ["chipsIppatsu", "祝儀：一発", "count", false, (t) => t.stats.chipsIppatsu],
    ["chipsYakuman", "祝儀：役満", "count", false, (t) => t.stats.chipsYakuman],
  ]),
];

export function formatMetric(
  format: MetricFormat,
  value: number | null,
): string {
  if (value === null) return "—";
  switch (format) {
    case "count":
      return String(value);
    case "signed":
      return value > 0 ? `+${value}` : String(value);
    case "percent":
      return `${(value * 100).toFixed(1)}%`;
    case "decimal":
      return value.toFixed(2);
    case "round":
      return String(Math.round(value));
  }
}
```

`src/lib/datetime.ts`:

```ts
const JST = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** 日本時間で「2026/10/02 21:05」の形にする。 */
export function formatJst(iso: string): string {
  const parts = Object.fromEntries(
    JST.formatToParts(new Date(iso)).map((part) => [part.type, part.value]),
  );
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run src/stats src/lib`
Expected: PASS

「リーチ後放銃率」は `dealInWhileRiichi ÷ riichi` で計算する（`GameStats` に別の項目は持たない）。

- [ ] **Step 5: 全体を確かめてコミット**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: すべて PASS

```bash
npx prettier --write src/stats src/lib/datetime.ts src/lib/datetime.test.ts
git add src/stats src/lib
git commit -m "feat(stats): add totals and the list of displayed metrics"
```

---

### Task 5: DB（`game_stats`、権限、関数）

**Files:**

- Create: `supabase/migrations/20261002030000_game_stats.sql`、`supabase/tests/database/stats.test.sql`
- Modify: `supabase/tests/database/rls.test.sql`（1行）、`src/server/database.types.ts`（再生成）

**Interfaces:**

- Produces（DB）:
  - 表 `public.game_stats (game_id uuid, player_id uuid, version integer, stats jsonb, created_at timestamptz)`、主キー `(game_id, player_id)`
  - `public.save_game_stats(p_game uuid, p_version integer, p_stats jsonb) returns boolean`（`p_stats` は席順に並んだ3人分の配列。終局した対局でなければ false）
  - `public.games_needing_stats(p_version integer, p_limit integer) returns setof uuid`
  - `game_results` と `game_stats` は承認済みなら全員分を読める

- [ ] **Step 1: DBのテストを書く**

`supabase/tests/database/stats.test.sql`:

```sql
-- 集計値の保存と、成績の読み取り権限のテスト。npm run test:db で実行する。
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- alice, bob, carol は承認済みで同じ対局の参加者。dave は承認済みの部外者。eve は未承認。
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@example.com'),
  ('00000000-0000-0000-0000-00000000000e', 'eve@example.com');
update public.profiles set approved = true
  where id <> '00000000-0000-0000-0000-00000000000e';

insert into public.rooms (id, code, status, created_by) values
  ('10000000-0000-0000-0000-000000000001', 'ABC234', 'finished',
   '00000000-0000-0000-0000-00000000000a');
-- 席順は carol, alice, bob
insert into public.games (id, room_id, status, player_ids, finished_at) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   'finished',
   array['00000000-0000-0000-0000-00000000000c',
         '00000000-0000-0000-0000-00000000000a',
         '00000000-0000-0000-0000-00000000000b']::uuid[],
   now() - interval '2 hours'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   'playing',
   array['00000000-0000-0000-0000-00000000000a',
         '00000000-0000-0000-0000-00000000000b',
         '00000000-0000-0000-0000-00000000000c']::uuid[],
   null),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
   'abandoned',
   array['00000000-0000-0000-0000-00000000000a',
         '00000000-0000-0000-0000-00000000000b',
         '00000000-0000-0000-0000-00000000000c']::uuid[],
   null);
insert into public.game_results (game_id, player_id, seat, rank, points, score, chips) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 0, 1, 50000, 30, 2),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 1, 2, 30000, 0, 0),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 2, 3, 10000, -30, -2);

-- ---- 計算が必要な対局 ----
select is(
  (select array_agg(id) from public.games_needing_stats(1, 10) as id),
  array['20000000-0000-0000-0000-000000000001']::uuid[],
  '集計値のない終局した対局だけが出る（対局中と破棄は出ない）'
);

-- ---- 保存 ----
select ok(
  public.save_game_stats('20000000-0000-0000-0000-000000000001', 1,
    '[{"rounds":7,"who":"c"},{"rounds":7,"who":"a"},{"rounds":7,"who":"b"}]'),
  '終局した対局の集計値を保存できる'
);
select is((select count(*)::int from public.game_stats), 3, '3人分の行ができる');
select is(
  (select stats->>'who' from public.game_stats
   where player_id = '00000000-0000-0000-0000-00000000000a'),
  'a',
  '集計値は席順どおりに配られる'
);
select is(
  (select count(*)::int from public.games_needing_stats(1, 10)),
  0,
  '保存したあとは出ない'
);
select is(
  (select count(*)::int from public.games_needing_stats(2, 10)),
  1,
  '版番号が上がると、また出る'
);
select ok(
  public.save_game_stats('20000000-0000-0000-0000-000000000001', 2,
    '[{"rounds":8},{"rounds":8},{"rounds":8}]'),
  '保存し直せる'
);
select is((select count(*)::int from public.game_stats), 3, '行は増えずに置き換わる');
select is(
  (select array_agg(distinct version) from public.game_stats),
  array[2],
  '版番号が書き換わる'
);
select ok(
  not public.save_game_stats('20000000-0000-0000-0000-000000000002', 2, '[{},{},{}]'),
  '対局中の対局には保存できない'
);
select ok(
  not public.save_game_stats('20000000-0000-0000-0000-000000000003', 2, '[{},{},{}]'),
  '破棄された対局には保存できない'
);
select ok(
  not public.save_game_stats('20000000-0000-0000-0000-000000000001', 2, '[{},{}]'),
  '3人分でなければ保存しない'
);

-- 指定したユーザーとしてログインした状態にする
create function pg_temp.login(user_id text) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_id, 'role', 'authenticated')::text,
    true
  );
end $$;

-- ---- 承認済みの部外者（dave）----
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select is((select count(*)::int from public.game_stats), 3, '承認済みなら、参加していない対局の集計値も読める');
select is((select count(*)::int from public.game_results), 3, '承認済みなら、参加していない対局の結果も読める');
select throws_ok(
  $$ insert into public.game_stats (game_id, player_id, version, stats)
     values ('20000000-0000-0000-0000-000000000001',
             '00000000-0000-0000-0000-00000000000d', 1, '{}') $$,
  '42501', null, '集計値は直接書けない'
);
select throws_ok(
  $$ update public.game_stats set stats = '{}' $$,
  '42501', null, '集計値は書き換えられない'
);
select throws_ok(
  $$ select public.save_game_stats('20000000-0000-0000-0000-000000000001', 9, '[{},{},{}]') $$,
  '42501', null, '保存する関数は直接呼べない'
);
select throws_ok(
  $$ select * from public.games_needing_stats(1, 10) $$,
  '42501', null, '一覧の関数は直接呼べない'
);

-- ---- 未承認（eve）----
select pg_temp.login('00000000-0000-0000-0000-00000000000e');
select is((select count(*)::int from public.game_stats), 0, '未承認は集計値を読めない');
select is((select count(*)::int from public.game_results), 0, '未承認は結果を読めない');

select * from finish();
rollback;
```

`supabase/tests/database/rls.test.sql` の、部外者（dave）の節の1行を置き換える:

```sql
select is((select count(*)::int from public.game_results), 1, '承認済みなら、参加していない対局の結果も読める');
```

（元は `0, '参加していない対局の結果は読めない'`。`plan(37)` は変わらない。）

- [ ] **Step 2: 失敗することを確かめる**

Run: `npm run test:db`
Expected: `stats.test.sql` が FAIL（関数と表がない）、`rls.test.sql` が1件 FAIL

- [ ] **Step 3: マイグレーションを書く**

`supabase/migrations/20261002030000_game_stats.sql`:

```sql
-- 対局ごと、プレイヤーごとの集計値。牌譜（game_events）から計算して保存する。
-- 成績の画面は、これと game_results を人ごとに足し合わせる。

create table public.game_stats (
  game_id uuid not null references public.games (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  -- 計算方法の版番号（src/stats/types.ts の STATS_VERSION）。古い行は定期実行が計算し直す。
  version integer not null,
  -- 回数と合計（src/stats/types.ts の GameStats）
  stats jsonb not null,
  created_at timestamptz not null default now(),
  primary key (game_id, player_id)
);

create index game_stats_player_id_idx on public.game_stats (player_id);

-- ---- 権限 ----
-- 成績は身内で比べるためのものなので、承認済みなら全員分を読める。書けるのはサーバーだけ。
-- 牌譜（game_events）は今までどおり、その対局の参加者だけ。

revoke all on public.game_stats from anon, authenticated;
grant select on public.game_stats to authenticated;

alter table public.game_stats enable row level security;

create policy "game_stats: 承認済みなら全員分" on public.game_stats
  for select to authenticated
  using ((select public.is_approved()));

drop policy "game_results: 参加した対局" on public.game_results;
create policy "game_results: 承認済みなら全員分" on public.game_results
  for select to authenticated
  using ((select public.is_approved()));

-- ---- 関数 ----

-- 集計値を保存する。p_stats は席順に並んだ3人分。すでにあれば置き換える。
-- 終局した対局でなければ何もせずに false。
create function public.save_game_stats(
  p_game uuid,
  p_version integer,
  p_stats jsonb
) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_players uuid[];
begin
  select player_ids into v_players
  from public.games
  where id = p_game and status = 'finished';
  if not found or jsonb_typeof(p_stats) <> 'array' or jsonb_array_length(p_stats) <> 3 then
    return false;
  end if;

  insert into public.game_stats (game_id, player_id, version, stats)
  select p_game, v_players[s + 1], p_version, p_stats -> s
  from generate_series(0, 2) as s
  on conflict (game_id, player_id)
  do update set version = excluded.version, stats = excluded.stats;
  return true;
end;
$$;

-- 集計値がない、または版番号が違う、終局した対局。古い順。
create function public.games_needing_stats(p_version integer, p_limit integer)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select g.id
  from public.games g
  where g.status = 'finished'
    and (
      select count(*) from public.game_stats s
      where s.game_id = g.id and s.version = p_version
    ) < 3
  order by g.finished_at
  limit p_limit;
$$;

revoke all on function public.save_game_stats(uuid, integer, jsonb) from public, anon, authenticated;
revoke all on function public.games_needing_stats(integer, integer) from public, anon, authenticated;
grant execute on function public.save_game_stats(uuid, integer, jsonb) to service_role;
grant execute on function public.games_needing_stats(integer, integer) to service_role;
```

- [ ] **Step 4: 反映して、テストと型を通す**

```bash
npx supabase migration up --local
npm run test:db
npm run db:types
git diff --stat src/server/database.types.ts
```

Expected: `test:db` がすべて PASS。`database.types.ts` に `game_stats` の表と2つの関数が増える（ほかの差分がないこと）。

- [ ] **Step 5: 全体を確かめてコミット**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: すべて PASS

```bash
npx prettier --write src/server/database.types.ts
git add supabase src/server/database.types.ts
git commit -m "feat(db): store per-game stats and open results to approved users"
```

---

### Task 6: サーバー（計算と保存、定期実行、読み出し）

**Files:**

- Create: `src/server/stats.ts`
- Modify: `src/app/api/games/[id]/actions/route.ts`、`src/app/api/games/[id]/tick/route.ts`、`src/app/api/cron/route.ts`、`scripts/play-hanchan.mjs`

**Interfaces:**

- Consumes: Task 3 の `analyzeGame`、`StatsEvent`、`STATS_VERSION`、Task 4 の `PlayerTotals`、`emptyTotals`、`addResult`、`addStats`、Task 5 のDB
- Produces（`src/server/stats.ts`）:
  - `recordGameStats(gameId: string): Promise<boolean>`（保存できたら true。失敗は例外）
  - `refreshGameStats(limit?: number): Promise<{ computed: number; failed: number }>`
  - `interface Standing { playerId: string; name: string; totals: PlayerTotals }`
  - `loadStandings(): Promise<Standing[]>`（対局数の多い順。1半荘もない人は入れない）
  - `interface HistoryGame { gameId: string; finishedAt: string; players: { playerId: string; name: string; rank: number; points: number; score: number; chips: number }[] }`
  - `loadHistory(limit: number): Promise<{ games: HistoryGame[]; hasMore: boolean }>`
- Produces（API）: `POST /api/cron` の応答が `{ abandoned: number, stats: { computed: number, failed: number } }` になる

- [ ] **Step 1: 検証スクリプトに確認を足す（まだ失敗する）**

`scripts/play-hanchan.mjs`:

先頭のコメントの使い方に1行足す:

```js
//   --keep を付けると、終わったあとにユーザーと対局を消さない（画面の確認用）
```

`const APP_URL = process.argv[2] ?? "http://localhost:3000";` を置き換える:

```js
const ARGS = process.argv.slice(2);
const KEEP = ARGS.includes("--keep");
const APP_URL =
  ARGS.find((arg) => !arg.startsWith("--")) ?? "http://localhost:3000";
```

`main` の `check("部外者は牌譜を読めない", ...)` の下に足す:

```js
// 集計は応答のあとに計算されるので、少し待つ
let statRows = [];
for (let i = 0; i < 50 && statRows.length < 3; i++) {
  await sleep(200);
  const { data } = await outsider.supabase
    .from("game_stats")
    .select("player_id, version, stats")
    .eq("game_id", gameId);
  statRows = data ?? [];
}
check(
  "終局すると3人分の集計値が保存される",
  statRows.length === 3,
  statRows.length,
);
check(
  "集計値の局数は3人とも同じで、1以上",
  statRows.length === 3 &&
    statRows[0].stats.rounds >= 1 &&
    statRows.every((row) => row.stats.rounds === statRows[0].stats.rounds),
);
const { data: outsiderResults } = await outsider.supabase
  .from("game_results")
  .select("rank")
  .eq("game_id", gameId);
check("参加していない人も結果を読める", (outsiderResults ?? []).length === 3);
```

`main` の最後の片付けを `KEEP` で分ける。置き換える前:

```js
// 作ったルーム（対局と結果も一緒に消える）とユーザーを片付ける
for (const player of all) {
  await player.supabase.removeAllChannels();
  await admin.from("rooms").delete().eq("created_by", player.id);
}
for (const player of all) await admin.auth.admin.deleteUser(player.id);
```

置き換えたあと:

```js
for (const player of all) await player.supabase.removeAllChannels();
if (KEEP) {
  console.log("--keep: ユーザーと対局を残しました（次の実行の最初に消えます）");
} else {
  // 作ったルーム（対局と結果も一緒に消える）とユーザーを片付ける
  for (const player of all) {
    await admin.from("rooms").delete().eq("created_by", player.id);
  }
  for (const player of all) await admin.auth.admin.deleteUser(player.id);
}
```

Run（開発サーバーとローカルのSupabaseが動いている状態で）: `npm run test:play`
Expected: 「終局すると3人分の集計値が保存される」が NG（0）。「参加していない人も結果を読める」は ok（Task 5 で権限を広げたため）。

- [ ] **Step 2: `src/server/stats.ts` を書く**

```ts
import "server-only";

import { analyzeGame } from "@/stats/analyze";
import type { StatsEvent } from "@/stats/analyze";
import { addResult, addStats, emptyTotals } from "@/stats/summary";
import type { PlayerTotals } from "@/stats/summary";
import { STATS_VERSION } from "@/stats/types";
import type { GameStats } from "@/stats/types";
import type { Json } from "./database.types";
import { createAdminClient, createSessionClient } from "./supabase";

/** PostgREST が1回に返す行数の上限（supabase/config.toml の max_rows） */
const PAGE = 1000;

/** 全部の行を読む。1回に1000行までしか返らないので、なくなるまで繰り返す。 */
async function readAll<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error || !data) throw new Error("読み込めませんでした");
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

/**
 * 終わった対局の牌譜から集計値を計算して保存する。保存できたら true。
 * 終局していない対局は false。牌譜が壊れていれば例外。
 */
export async function recordGameStats(gameId: string): Promise<boolean> {
  const admin = createAdminClient();
  const rows = await readAll((from, to) =>
    admin
      .from("game_events")
      .select("event")
      .eq("game_id", gameId)
      .order("seq")
      .range(from, to),
  );
  const stats = analyzeGame(
    rows.map((row) => row.event as unknown as StatsEvent),
  );
  const { data, error } = await admin.rpc("save_game_stats", {
    p_game: gameId,
    p_version: STATS_VERSION,
    p_stats: stats as unknown as Json,
  });
  if (error) throw new Error("集計値を保存できませんでした");
  return data ?? false;
}

/**
 * 集計値がない、または古い版で計算した対局を計算する。定期実行から呼ぶ。
 * 1つの対局で失敗しても、ほかの対局は続ける。
 */
export async function refreshGameStats(
  limit = 50,
): Promise<{ computed: number; failed: number }> {
  const { data, error } = await createAdminClient().rpc("games_needing_stats", {
    p_version: STATS_VERSION,
    p_limit: limit,
  });
  if (error) throw new Error("集計の必要な対局を取得できませんでした");

  let computed = 0;
  let failed = 0;
  for (const gameId of data ?? []) {
    try {
      if (await recordGameStats(gameId)) computed++;
      else failed++;
    } catch {
      failed++;
    }
  }
  return { computed, failed };
}

export interface Standing {
  playerId: string;
  name: string;
  totals: PlayerTotals;
}

/**
 * 全員の通算成績。ログイン中のユーザーとして読む（承認済みなら全員分が読める）。
 * 対局数の多い順。1半荘も終えていない人は入れない。
 */
export async function loadStandings(): Promise<Standing[]> {
  const supabase = await createSessionClient();
  const [results, stats, profiles] = await Promise.all([
    readAll((from, to) =>
      supabase
        .from("game_results")
        .select("player_id, rank, points, score, chips")
        .order("game_id")
        .order("player_id")
        .range(from, to),
    ),
    readAll((from, to) =>
      supabase
        .from("game_stats")
        .select("player_id, stats")
        .order("game_id")
        .order("player_id")
        .range(from, to),
    ),
    supabase.from("profiles").select("id, display_name"),
  ]);

  const totals = new Map<string, PlayerTotals>();
  for (const row of results) {
    totals.set(
      row.player_id,
      addResult(totals.get(row.player_id) ?? emptyTotals(), row),
    );
  }
  for (const row of stats) {
    const mine = totals.get(row.player_id);
    if (!mine) continue;
    totals.set(row.player_id, {
      ...mine,
      stats: addStats(mine.stats, row.stats as unknown as Partial<GameStats>),
    });
  }

  const names = new Map(
    (profiles.data ?? []).map((profile) => [profile.id, profile.display_name]),
  );
  return [...totals]
    .map(([playerId, value]) => ({
      playerId,
      name: names.get(playerId) ?? "（不明）",
      totals: value,
    }))
    .sort(
      (a, b) =>
        b.totals.games - a.totals.games || a.name.localeCompare(b.name, "ja"),
    );
}

export interface HistoryGame {
  gameId: string;
  /** 終わった時刻（ISO 8601） */
  finishedAt: string;
  /** 順位の順 */
  players: {
    playerId: string;
    name: string;
    rank: number;
    points: number;
    score: number;
    chips: number;
  }[];
}

/** 終わった対局を新しい順に limit 件。続きがあれば hasMore。 */
export async function loadHistory(
  limit: number,
): Promise<{ games: HistoryGame[]; hasMore: boolean }> {
  const supabase = await createSessionClient();
  // 1対局は3行で、同じ時刻に書かれる。続きがあるかを知るために1行多く読む
  const [results, profiles] = await Promise.all([
    supabase
      .from("game_results")
      .select("game_id, player_id, rank, points, score, chips, created_at")
      .order("created_at", { ascending: false })
      .order("game_id")
      .order("rank")
      .range(0, limit * 3),
    supabase.from("profiles").select("id, display_name"),
  ]);
  if (results.error) throw new Error("対局履歴を読み込めませんでした");

  const names = new Map(
    (profiles.data ?? []).map((profile) => [profile.id, profile.display_name]),
  );
  const games = new Map<string, HistoryGame>();
  for (const row of results.data.slice(0, limit * 3)) {
    const game = games.get(row.game_id) ?? {
      gameId: row.game_id,
      finishedAt: row.created_at,
      players: [],
    };
    game.players.push({
      playerId: row.player_id,
      name: names.get(row.player_id) ?? "（不明）",
      rank: row.rank,
      points: row.points,
      score: row.score,
      chips: row.chips,
    });
    games.set(row.game_id, game);
  }
  return {
    games: [...games.values()],
    hasMore: results.data.length > limit * 3,
  };
}
```

- [ ] **Step 3: 終局したら、応答のあとに集計する**

先に `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` を読む（`after` は応答を返したあとに処理を走らせる）。

`src/app/api/games/[id]/actions/route.ts` と `src/app/api/games/[id]/tick/route.ts` の両方に、同じ変更を入れる。

import に足す:

```ts
import { after } from "next/server";
import { recordGameStats } from "@/server/stats";
```

`if (!result.ok) return jsonError(result.error, STATUS[result.error]);` の下に足す:

```ts
// 終局したら、応答を返したあとに集計値を計算する。失敗しても定期実行が拾う
if (result.view.phase === "ended") {
  after(() => recordGameStats(id).catch(() => undefined));
}
```

- [ ] **Step 4: 定期実行で、未計算の対局を計算する**

`src/app/api/cron/route.ts` を次に置き換える:

```ts
import { jsonError } from "@/server/api";
import { isCronAuthorized } from "@/server/cron-rules";
import { env } from "@/server/env";
import { abandonStaleGames } from "@/server/games";
import { refreshGameStats } from "@/server/stats";

/**
 * 定期実行（GitHub Actions、1日1回）から呼ばれる。
 * 放置された対局を破棄し、集計値のない対局（終局時に失敗した、計算方法を変えた）を計算する。
 * Supabase にアクセスするので、無料枠の一時停止（1週間アクセスなし）も防ぐ。
 */
export async function POST(request: Request) {
  const header = request.headers.get("authorization");
  if (!isCronAuthorized(header, env.cronSecret)) {
    return jsonError("unauthorized", 401);
  }
  const abandoned = await abandonStaleGames();
  const stats = await refreshGameStats();
  return Response.json({ abandoned, stats });
}
```

- [ ] **Step 5: 通ることを確かめる**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: すべて PASS

Run（開発サーバーとローカルのSupabaseが動いている状態で）: `npm run test:play`
Expected: 「すべて成功」（「終局すると3人分の集計値が保存される」を含む）

定期実行の経路も確かめる:

```bash
docker exec supabase_db_mahjong psql -U postgres -At -c "select count(*) from games where status = 'finished'"
curl -s -X POST -H "Authorization: Bearer local-cron-secret" http://localhost:3000/api/cron
```

Expected: `{"abandoned":0,"stats":{"computed":N,"failed":0}}`。`N` は、集計値のまだない終局した対局の数（検証スクリプトは最後に片付けるので、ふつうは 0）。`failed` が 0 でなければ、その対局の牌譜で `analyzeGame` が例外を出しているので、原因を調べる。

- [ ] **Step 6: コミット**

```bash
npx prettier --write src/server/stats.ts src/app/api scripts/play-hanchan.mjs
git add src/server/stats.ts src/app/api scripts/play-hanchan.mjs
git commit -m "feat(server): compute stats when a game ends and in the daily cron"
```

---

### Task 7: 画面（対局履歴、成績、個人の成績）

**Files:**

- Create: `src/app/history/page.tsx`、`src/app/stats/page.tsx`、`src/app/stats/[id]/page.tsx`
- Modify: `src/components/screen.tsx`、`src/app/page.tsx`

**Interfaces:**

- Consumes: Task 6 の `loadStandings`、`loadHistory`、Task 4 の `METRICS`、`METRIC_GROUPS`、`formatMetric`、`formatJst`
- Produces: `Screen` の prop `wide?: boolean`、ページ `/history`（`?n=<件数>`）、`/stats`、`/stats/<プレイヤーのid>`

- [ ] **Step 1: Next.js のドキュメントを読む**

`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` で、`searchParams` と `params` の受け取り方（どちらも Promise）と `PageProps` の使い方を確かめる。既存の `src/app/games/[id]/page.tsx`（`PageProps<"/games/[id]">`）と同じ書き方にする。

- [ ] **Step 2: `Screen` を横に広げられるようにする**

`src/components/screen.tsx` の `Screen` を置き換える:

```tsx
/**
 * ログインや承認待ちなど、中央に1枚のカードを置く画面の枠。
 * @param wide 表を出す画面用に、横幅を広く取る
 */
export function Screen({
  title,
  wide = false,
  children,
}: {
  title: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6">
      <div
        className={`flex w-full flex-col gap-5 rounded-lg border border-foreground/30 p-6 ${
          wide ? "max-w-5xl" : "max-w-sm"
        }`}
      >
        <h1 className="text-xl font-semibold tracking-wide">{title}</h1>
        {children}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: 対局履歴**

`src/app/history/page.tsx`:

```tsx
import Link from "next/link";
import { Screen, subtleButtonClass } from "@/components/screen";
import { formatJst } from "@/lib/datetime";
import { requireApproved } from "@/server/auth";
import { loadHistory } from "@/server/stats";
import { formatMetric } from "@/stats/metrics";

/** 1回に出す件数と、「もっと見る」で増やせる上限 */
const PAGE_SIZE = 50;
const MAX_GAMES = 300;

export default async function HistoryPage({
  searchParams,
}: PageProps<"/history">) {
  await requireApproved();
  const requested = Number((await searchParams).n);
  const limit =
    Number.isInteger(requested) && requested > 0
      ? Math.min(requested, MAX_GAMES)
      : PAGE_SIZE;
  const { games, hasMore } = await loadHistory(limit);

  return (
    <Screen title="対局履歴" wide>
      {games.length === 0 && (
        <p className="text-sm opacity-80">終わった対局はまだありません。</p>
      )}
      <ul className="flex flex-col gap-4">
        {games.map((game) => (
          <li
            key={game.gameId}
            className="rounded border border-foreground/20 p-3"
          >
            <p className="mb-2 text-xs opacity-70">
              {formatJst(game.finishedAt)}
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs opacity-70">
                  <th className="w-10 font-normal">順位</th>
                  <th className="font-normal">名前</th>
                  <th className="text-right font-normal">持ち点</th>
                  <th className="text-right font-normal">スコア</th>
                  <th className="text-right font-normal">祝儀</th>
                </tr>
              </thead>
              <tbody>
                {game.players.map((player) => (
                  <tr key={player.playerId}>
                    <td>{player.rank}</td>
                    <td className="max-w-[10rem] truncate">
                      <Link
                        href={`/stats/${player.playerId}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {player.name}
                      </Link>
                    </td>
                    <td className="text-right tabular-nums">{player.points}</td>
                    <td className="text-right tabular-nums">
                      {formatMetric("signed", player.score)}
                    </td>
                    <td className="text-right tabular-nums">
                      {formatMetric("signed", player.chips)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </li>
        ))}
      </ul>
      {hasMore && limit < MAX_GAMES && (
        <Link
          href={`/history?n=${Math.min(limit + PAGE_SIZE, MAX_GAMES)}`}
          className={subtleButtonClass}
        >
          もっと見る
        </Link>
      )}
      <div className="flex gap-4">
        <Link href="/stats" className={subtleButtonClass}>
          成績
        </Link>
        <Link href="/" className={subtleButtonClass}>
          ホームへ戻る
        </Link>
      </div>
    </Screen>
  );
}
```

- [ ] **Step 4: 成績の一覧**

`src/app/stats/page.tsx`:

```tsx
import Link from "next/link";
import { Screen, subtleButtonClass } from "@/components/screen";
import { requireApproved } from "@/server/auth";
import { loadStandings } from "@/server/stats";
import { METRICS, formatMetric } from "@/stats/metrics";

const MAIN = METRICS.filter((metric) => metric.main);

/** 全員の通算成績を並べる。主な項目だけを出し、名前から個人の成績へ進む。 */
export default async function StatsPage() {
  const viewer = await requireApproved();
  const standings = await loadStandings();

  return (
    <Screen title="成績" wide>
      {standings.length === 0 ? (
        <p className="text-sm opacity-80">終わった対局はまだありません。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-sm whitespace-nowrap">
            <thead>
              <tr className="text-xs opacity-70">
                <th className="sticky left-0 bg-background pr-4 text-left font-normal">
                  名前
                </th>
                {MAIN.map((metric) => (
                  <th key={metric.key} className="px-2 text-right font-normal">
                    {metric.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {standings.map((row) => (
                <tr
                  key={row.playerId}
                  className={row.playerId === viewer.id ? "font-semibold" : ""}
                >
                  <td className="sticky left-0 max-w-[8rem] truncate bg-background pr-4">
                    <Link
                      href={`/stats/${row.playerId}`}
                      className="underline underline-offset-2"
                    >
                      {row.name}
                    </Link>
                  </td>
                  {MAIN.map((metric) => (
                    <td
                      key={metric.key}
                      className="px-2 text-right tabular-nums"
                    >
                      {formatMetric(metric.format, metric.value(row.totals))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs opacity-60">
        名前を押すと、その人の全部の項目が見られます。良形は、リーチの待ちに両面が含まれる形です。
      </p>
      <div className="flex gap-4">
        <Link href="/history" className={subtleButtonClass}>
          対局履歴
        </Link>
        <Link href="/" className={subtleButtonClass}>
          ホームへ戻る
        </Link>
      </div>
    </Screen>
  );
}
```

- [ ] **Step 5: 個人の成績**

`src/app/stats/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { Screen, subtleButtonClass } from "@/components/screen";
import { requireApproved } from "@/server/auth";
import { isUuid } from "@/server/room-rules";
import { loadStandings } from "@/server/stats";
import { METRICS, METRIC_GROUPS, formatMetric } from "@/stats/metrics";

/** 1人分の全部の項目を、分類ごとに出す。 */
export default async function PlayerStatsPage({
  params,
}: PageProps<"/stats/[id]">) {
  await requireApproved();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const standing = (await loadStandings()).find((row) => row.playerId === id);
  if (!standing) notFound();

  return (
    <Screen title={`${standing.name} の成績`} wide>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {METRIC_GROUPS.map((group) => (
          <section key={group} className="flex flex-col gap-2">
            <h2 className="border-b border-foreground/20 pb-1 text-sm font-semibold">
              {group}
            </h2>
            <dl className="flex flex-col gap-1 text-sm">
              {METRICS.filter((metric) => metric.group === group).map(
                (metric) => (
                  <div key={metric.key} className="flex justify-between gap-4">
                    <dt className="opacity-80">{metric.label}</dt>
                    <dd className="tabular-nums">
                      {formatMetric(
                        metric.format,
                        metric.value(standing.totals),
                      )}
                    </dd>
                  </div>
                ),
              )}
            </dl>
          </section>
        ))}
      </div>
      <div className="flex gap-4">
        <Link href="/stats" className={subtleButtonClass}>
          全員の成績
        </Link>
        <Link href="/history" className={subtleButtonClass}>
          対局履歴
        </Link>
        <Link href="/" className={subtleButtonClass}>
          ホームへ戻る
        </Link>
      </div>
    </Screen>
  );
}
```

- [ ] **Step 6: ホームからのリンク**

`src/app/page.tsx` の、承認と ログアウトの `<div className="flex items-center gap-4">` の中の最初に足す:

```tsx
        <Link href="/history" className={subtleButtonClass}>
          対局履歴
        </Link>
        <Link href="/stats" className={subtleButtonClass}>
          成績
        </Link>
```

その `<div>` の `className` を `"flex flex-wrap items-center gap-4"` にする。

- [ ] **Step 7: 型とテストを通す**

Run: `npm run typecheck && npm run lint && npm run test && npm run build`
Expected: すべて成功。ビルドの一覧に `/history`、`/stats`、`/stats/[id]` が出る。

- [ ] **Step 8: ブラウザで確かめる**

1. 対局を残す: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --env-file=.env.local scripts/play-hanchan.mjs --keep`（開発サーバーとローカルのSupabaseが動いている状態で）。
2. 残った検証用のユーザーの1人としてログインした状態を作る。`scripts/play-hanchan.mjs` の `createPlayer` と同じやり方（`signInWithPassword` でセッションCookieを作る）を使う一時的なスクリプトを、スクラッチパッドに書く。メールアドレスは `play-hanchan-0@example.test`、パスワードはスクリプトの `PASSWORD`。
3. Playwright にそのCookieを入れて、次を開いてスクリーンショットを撮る（幅 390 と 1280 の両方）。
   - `http://localhost:3000/`：リンクが2つ出ている。
   - `http://localhost:3000/history`：対局が1件、日本時間の日時、3人の順位と点。
   - `http://localhost:3000/stats`：3人の行。自分の行が太字。幅 390 で横にスクロールでき、名前の列が残る。
   - 名前を押して個人の成績：5つの分類、割る数が0の項目は「—」。
4. 数字を1つ、DBと突き合わせる。例: `docker exec supabase_db_mahjong psql -U postgres -At -c "select stats->>'rounds', stats->>'wins', stats->>'riichi', stats->>'riichiGood' from game_stats"` の値と、個人の成績の局数、和了率、リーチ率、リーチ時良形率が合うこと。
5. 終わったら、もう一度 `npm run test:play`（`--keep` なし）を実行して、検証用のユーザーと対局を消す。

崩れている、読みにくいところがあれば直して撮り直す。

- [ ] **Step 9: コミット**

```bash
npx prettier --write src/components/screen.tsx src/app/history src/app/stats src/app/page.tsx
git add src/components/screen.tsx src/app/history src/app/stats src/app/page.tsx
git commit -m "feat(ui): add the game history and player stats pages"
```

---

### Task 8: 仕様書への反映と、通しの確認

**Files:**

- Modify: `docs/SPEC.md`

- [ ] **Step 1: `docs/SPEC.md` を直す**

「最初のリリースに含めるもの（確定）」の `- 対局履歴、プレイヤー別の通算と日別の集計` を置き換える:

```markdown
- 対局履歴、プレイヤー別の通算の集計（日別の集計は作らない）
```

「Database Schema」の表に1行足す（`game_results` の下）。`game_results` の「クライアントから読める範囲」も直す:

```markdown
| `game_results` | 順位、最終持ち点、スコアの枚数、祝儀の枚数 | 承認済みユーザーは全員分 |
| `game_stats` | 対局ごと、プレイヤーごとの集計値（回数と合計） | 承認済みユーザーは全員分 |
```

関数の一覧に `save_game_stats`、`games_needing_stats` を足す。

「アクセス制御」の箇条書き（`- **アクセス制御**：ルームと対局は参加者だけが読める。…`）を置き換える:

```markdown
- **アクセス制御**：ルームと対局は参加者だけが読める。牌譜は対局終了後に参加者だけが読める。終わった対局の結果と集計値は、承認済みなら全員分を読める（身内で成績を比べるため）。
```

「Realtime Protocol」のAPIの表の `POST /api/cron` の行を置き換える:

```markdown
| `POST /api/cron` | 定期実行。放置対局を破棄し、集計値のない対局を計算する（秘密の値つき） |
```

「画面の一覧」の行はそのまま（対局履歴、集計が入っている）。

「Database Schema」の節の前（「持ち時間（確定）」の節の終わりの `---` の下）に、新しい節を足す:

```markdown
# 対局履歴と集計

フェーズ9で決めた内容。項目と定義はユーザーが確認した。

## 画面

| 画面                     | 内容                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------- |
| 対局履歴 `/history`      | 終わった対局を新しい順に50件ずつ。日時（日本時間）、3人の順位、持ち点、スコア、祝儀 |
| 成績 `/stats`            | 全員の通算成績を並べた表。主な項目だけ                                              |
| 個人の成績 `/stats/<id>` | その人の全項目                                                                      |

破棄された対局は入れない。割る数が0の項目は「—」。

## 作り

- 対局が終わると、牌譜（`game_events`）から3人それぞれの集計値（回数と合計）を計算して `game_stats` に保存する。計算は応答を返したあとに行う。
- 成績の画面は、`game_results` と `game_stats` を人ごとに足し合わせて、率と平均を出す。
- 1日1回の定期実行が、集計値のない対局と、古い版番号（`STATS_VERSION`）で計算した対局を計算する（1回に最大50対局）。項目や数え方を変えたら版番号を上げる。
- 計算は `src/stats/` の純粋な関数で行う。シャンテン数と待ちの形はエンジン（`src/engine/shanten.ts`、`waits.ts`）にある。画面に出す項目の一覧は `src/stats/metrics.ts`。

## 定義

| 項目                                                             | 定義                                                                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 和了率、放銃率、リーチ率、副露率                                 | それぞれの局 ÷ 参加した局数。副露は、ポンか大明槓を1回でもした局（暗槓と加槓だけの局は数えない）                                |
| ツモ率、平均和了点、平均和了巡目                                 | 和了した局で割る。和了点は供託と本場を含む                                                                                      |
| 流局時聴牌率                                                     | 流局で聴牌していた局 ÷ 流局した局                                                                                               |
| 平均放銃点                                                       | 放銃で払った点 ÷ 放銃した局。ダブロンは放銃1回で、2人分の合計                                                                   |
| 放銃                                                             | ロンされた局だけ。ツモられた局、逆ポッチで払った局は数えない                                                                    |
| リーチ                                                           | 成立したリーチだけ。宣言牌でロンされたリーチは数えない                                                                          |
| 良形                                                             | リーチ宣言牌を切ったあとの待ち牌のうち1種類でも、和了形のどれかの読み方で順子の両面を埋める（平和と同じ判定）                   |
| 愚形                                                             | それ以外（カンチャン、ペンチャン、単騎、ノベタン、シャンポン、七対子、国士無双）                                                |
| リーチ後和了率、リーチ後放銃率、追いかけリーチ率、平均リーチ巡目 | リーチした局で割る。追いかけは、自分のリーチの時点でほかの誰かがリーチ済み                                                      |
| 一発率、裏ドラ率                                                 | リーチして和了した局で割る                                                                                                      |
| 放銃時のシャンテン数                                             | 放銃した牌を切ったあとの手牌で数える。通常形、七対子（同じ牌4枚は2対子）、国士無双の最小。0が聴牌。副露しているときは通常形だけ |
| 巡目                                                             | その局で自分が切った牌の枚数。リーチ巡目は宣言牌を含む。和了巡目は切った枚数＋1                                                 |
| ポッチ、逆ポッチ、流し役満                                       | 和了として数える。ツモ率の「ツモ」には入れない                                                                                  |
| 役満                                                             | 役満を和了した回数。流し役満と追加役満を含み、数え役満は含まない                                                                |
| 祝儀の内訳                                                       | 和了で受け取った祝儀を、赤、金、裏ドラ、一発、役満に分けた枚数。飛び賞とサイコロは別に数える                                    |
| サイコロチャンス                                                 | 自分が出目を指定した回数、当たりの回数、サイコロで動いた自分の祝儀（払った分は負）                                              |

---
```

「ディレクトリ（提案）」のコードブロックに1行足す（`server/` の下）:

```text
  stats/       牌譜の分析、集計値の足し合わせ、画面に出す項目
```

- [ ] **Step 2: 全部を通す**

```bash
npx prettier --write docs/SPEC.md
npm run typecheck && npm run lint && npm run test && npm run test:db && npm run build
```

Expected: すべて成功

開発サーバーとローカルのSupabaseを動かして: `npm run test:play`
Expected: 「すべて成功」

- [ ] **Step 3: コミット**

```bash
git add docs/SPEC.md
git commit -m "docs: record the phase 9 history and stats rules"
```

---

## リリースの手順（ユーザーの確認が必要）

1. 本番DBにマイグレーションを当てる。ユーザーが自分で `! npx supabase db push` を実行する（表を1つ足し、`game_results` の読み取りの範囲を広げ、関数を2つ足す）。
2. `phase-9-history-stats` を main にマージして push する（Vercel が本番にデプロイする）。マイグレーションを先に当てる（成績の画面が `game_stats` を読むため）。
3. すでに終わっている対局を計算する。GitHub の Actions で `cron` を手動で実行する（`gh workflow run cron`）。応答の `stats.computed` が終わった対局の数、`stats.failed` が 0 であることを確かめる。50対局より多ければ、0 になるまで繰り返す。
4. 本番の `/history` と `/stats` を開いて確かめる。
