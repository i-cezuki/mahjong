# フェーズ7 卓のUIと牌の絵柄 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 文字だけの仮の対局画面を、牌の画像を使った卓の画面（局の結果、サイコロの再生、終局を含む）に作り直す。

**Architecture:** 画面データ `PlayerView` を受け取って描くだけの `TableScreen` を作り、通信は今の `GameClient` に残す。画面に依存しない判断（席の並び、操作の整理、サイコロの再生手順、牌の画像の対応）は純粋な関数に切り出して単体テストを書く。卓は 960×540 の固定レイアウトを画面に合わせて拡大縮小する。

**Tech Stack:** Next.js 16.3.8（App Router）、React 19.2、Tailwind CSS 4、Vitest 4、sharp（画像の生成スクリプトだけ。next に付属）

**Spec:** `docs/superpowers/specs/2026-10-02-phase7-table-ui-design.md`（全体の仕様は `docs/SPEC.md`）

## Global Constraints

- サーバー（`src/server/`、`src/app/api/`）とエンジン（`src/engine/`）は変えない。
- 合法手はクライアントで判定しない。`view.actions` にあるものだけをボタンや牌の操作にする。
- 牌の画像は麻雀王国の牌画2（47×63px、GIF）。横向きはCSSの回転で作る。裏向きはCSSで描く。
- 依存パッケージを増やさない。有料サービスを使わない（Vercel の画像最適化も使わない：`unoptimized`）。
- コードのコメントと画面の文言は日本語。既存のコメントの密度と書き方に合わせる。
- Next.js はこのリポジトリの版に合わせる。書く前に `node_modules/next/dist/docs/` の該当ページを読む（`AGENTS.md`）。
- 持ち時間、効果音、牌が動くアニメーションは作らない。アニメーションはサイコロだけ。
- 各タスクの終わりに `npm run typecheck && npm run lint && npm run test` を通してからコミットする。

## ファイルの構成

| ファイル                                                    | 役割                                                     |
| ----------------------------------------------------------- | -------------------------------------------------------- |
| `scripts/make-tiles.mjs`                                    | 素材を取得し、無い牌を生成して `public/tiles/` に書く    |
| `public/tiles/*.gif`、`*.png`                               | 牌の画像（34種＋特殊牌7枚）                              |
| `src/components/tile-image.ts`（＋test）                    | 牌IDから画像のパスを決める                               |
| `src/components/tile.tsx`                                   | 牌1枚（表、裏、横向き、薄く）                            |
| `src/app/games/[id]/use-game-view.ts`                       | 画面データを最新に保つ（既存のコードを移す）             |
| `src/app/games/[id]/logic/seats.ts`（＋test）               | 自分から見た下家と上家                                   |
| `src/app/games/[id]/logic/actions.ts`（＋test）             | `view.actions` の整理、自動和了と鳴きなし                |
| `src/app/games/[id]/logic/dice-playback.ts`（＋test）       | サイコロの再生手順                                       |
| `src/app/games/[id]/table/stage.tsx`                        | 拡大縮小の枠、縦画面の案内                               |
| `src/app/games/[id]/table/center-panel.tsx`                 | 局、本場、供託、ドラ表示牌、持ち点と風                   |
| `src/app/games/[id]/table/river.tsx`                        | 河                                                       |
| `src/app/games/[id]/table/opponent.tsx`                     | 相手の席（裏向きの手牌、副露、花）                       |
| `src/app/games/[id]/table/melds.tsx`                        | 副露と花の表示（自分と相手で共用）                       |
| `src/app/games/[id]/table/my-hand.tsx`                      | 自分の手牌と2回タップ                                    |
| `src/app/games/[id]/table/action-bar.tsx`                   | ボタン、リーチの牌選び、切り替えボタン                   |
| `src/app/games/[id]/table/round-result.tsx`                 | 局の結果                                                 |
| `src/app/games/[id]/table/dice.tsx`、`use-dice-playback.ts` | サイコロチャンス                                         |
| `src/app/games/[id]/table/game-result.tsx`                  | 終局                                                     |
| `src/app/games/[id]/table/table-screen.tsx`                 | 上の部品を組み立てる。通信はしない                       |
| `src/app/games/[id]/game-client.tsx`                        | 通信と `TableScreen` の呼び出しだけにする                |
| `src/app/dev/table/page.tsx`、`sandbox.tsx`                 | 開発時だけ開ける確認用の卓（エンジンをブラウザで動かす） |

---

### Task 1: 牌の画像

**Files:**

- Create: `scripts/make-tiles.mjs`、`public/tiles/*`、`src/components/tile-image.ts`、`src/components/tile-image.test.ts`、`src/components/tile.tsx`
- Modify: `src/app/page.tsx`（出典のリンク）、`docs/SPEC.md`（UI節の牌の絵柄）

**Interfaces:**

- Produces:
  - `tileImage(id: TileId): string` — 例 `/tiles/5p-red.png`
  - `<Tile id={TileId} width={number} sideways? dimmed? raised? />`、`<TileBack width={number} sideways? />`
  - 牌の縦横比 `TILE_RATIO = 63 / 47`

**素材のファイル名の対応**（`https://mj-king.net/sozai/img/pai2/<名前>_1.gif`、`_1` が正位置の縦向き）

| 種類                | 素材の名前                          |
| ------------------- | ----------------------------------- |
| `1m` `9m`           | `p_ms1` `p_ms9`                     |
| `1p`〜`9p`          | `p_ps1`〜`p_ps9`                    |
| `1s`〜`9s`          | `p_ss1`〜`p_ss9`                    |
| `1z` `2z` `3z` `4z` | `p_ji_e` `p_ji_s` `p_ji_w` `p_ji_n` |
| `5z` `6z` `7z`      | `p_no` `p_ji_h` `p_ji_c`            |

- [ ] **Step 1: 失敗するテストを書く**（`src/components/tile-image.test.ts`）

```ts
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALL_TILES } from "@/engine/tiles";
import { tileImage } from "./tile-image";

describe("tileImage", () => {
  it("112枚すべてに画像ファイルがある", () => {
    for (const tile of ALL_TILES) {
      expect(
        existsSync(`public${tileImage(tile.id)}`),
        tileImage(tile.id),
      ).toBe(true);
    }
  });

  it("赤、金、ポッチ、逆ポッチは通常の牌と別の画像になる", () => {
    const paths = (kind: string) =>
      new Set(
        ALL_TILES.filter((t) => t.kind === kind).map((t) => tileImage(t.id)),
      );
    expect(paths("5p").size).toBe(3);
    expect(paths("5s").size).toBe(3);
    expect(paths("5z").size).toBe(3);
    expect(paths("1p").size).toBe(1);
  });
});
```

- [ ] **Step 2: `npm run test -- tile-image` が失敗することを確かめる**

- [ ] **Step 3: `tile-image.ts` を書く**

```ts
import { tileOf } from "@/engine/tiles";
import type { TileId, TileVariant } from "@/engine/tiles";

/** 素材の牌画像の縦横比（47×63px） */
export const TILE_RATIO = 63 / 47;

const SUFFIX: Record<TileVariant, string> = {
  normal: "",
  red: "-red",
  gold: "-gold",
  pocchi: "-pocchi",
  reversePocchi: "-reverse-pocchi",
};

/** 牌の画像のパス。素材にある牌はGIF、加工して作った牌はPNG。 */
export function tileImage(id: TileId): string {
  const { kind, variant } = tileOf(id);
  if (variant === "normal" && kind !== "1f") return `/tiles/${kind}.gif`;
  return `/tiles/${kind}${SUFFIX[variant]}.png`;
}
```

- [ ] **Step 4: `scripts/make-tiles.mjs` を書いて実行する**

  - 上の対応表の27枚を `public/tiles/<種類>.gif` に保存する（取得は1枚ずつ、すでにあれば取得しない）。
  - sharp で生成する（出力は元の3倍の 141×189px のPNG。拡大は `kernel: "lanczos3"`）:
    - `5p-red` `5s-red`：素材の5を読み、暗い画素（輝度が低く彩度の低い線）を赤 `#c8102e` に置き換える。明るさに応じてアンチエイリアスを保つ（白との混ぜ具合＝元の暗さ）。
    - `5p-gold` `5s-gold`：同じ方法で、赤い画素も含めた絵柄全体を金 `#c9a227` にする。
    - `5z-pocchi`：白牌にSVGの赤い丸（直径は幅の28%、中央）を重ねる。
    - `5z-reverse-pocchi`：同じく青い丸 `#1e5bd8`。
    - `1f`：白牌にSVGで「花」の字（`font-family: serif`、赤紫 `#b0236b`、太字）を重ねる。
  - 実行：`node scripts/make-tiles.mjs`。生成した画像を Read で開いて、絵柄が判別できることを目で確かめる。

- [ ] **Step 5: `npm run test -- tile-image` が通ることを確かめる**

- [ ] **Step 6: `tile.tsx` を書く**

  - `next/image` を `unoptimized` で使う（`node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md`）。`alt` は `tileLabel(id)`。
  - `width` は卓のレイアウト上のpx。高さは `width * TILE_RATIO`。
  - `sideways`：外側の箱を「幅＝牌の高さ、高さ＝牌の幅」にして、中の画像を90度回す。
  - `dimmed`：`opacity-40`。`raised`：上に 10px ずらす。
  - `TileBack`：青い板（`#1f4fbf`、角丸、明るい枠線）。`sideways` も同じ扱い。

- [ ] **Step 7: 出典と仕様書**

  - `src/app/page.tsx` のログアウトの並びの下に、`牌画像：<a href="https://mj-king.net/sozai/">麻雀王国</a>` を小さく置く（`target="_blank" rel="noreferrer"`）。
  - `docs/SPEC.md` の UI 節の「牌の絵柄は自作する…」の行を「牌の絵柄は麻雀王国の麻雀素材（牌画2）を使う。素材に無い牌（赤5、金5、ポッチ、逆ポッチ、花牌）は素材を加工して作る。裏向きは青い無地。」に置き換える。

- [ ] **Step 8: 確認してコミット**（`feat(ui): add tile images from mj-king and a tile component`）

---

### Task 2: 画面に依存しない判断

**Files:**

- Create: `src/app/games/[id]/logic/seats.ts`、`actions.ts`、`dice-playback.ts` と、それぞれの `.test.ts`
- Modify: `vitest.config.ts` は変更不要（`src/**/*.test.ts` に含まれる）

**Interfaces:**

- Produces:

```ts
// seats.ts
export interface SeatLayout {
  self: Seat;
  right: Seat;
  left: Seat;
}
/** 下家（次の手番）が右、上家が左 */
export function seatLayout(self: Seat): SeatLayout;

// actions.ts
export interface ActionMenu {
  /** 切れる牌 */
  discards: TileId[];
  /** リーチして切れる牌（通常と2倍で同じ） */
  riichiTiles: TileId[];
  tsumo: TableAction | null;
  ron: TableAction | null;
  pons: Extract<TableAction, { type: "pon" }>[];
  minkan: TableAction | null;
  ankans: Extract<TableAction, { type: "ankan" }>[];
  kakans: Extract<TableAction, { type: "kakan" }>[];
  pass: TableAction | null;
  confirm: TableAction | null;
  dice: Extract<TableAction, { type: "dice" }>[];
}
export function buildMenu(actions: readonly TableAction[]): ActionMenu;
export interface AutoSettings {
  autoWin: boolean;
  noCall: boolean;
}
/** 自動で送る操作。なければ null。 */
export function autoAction(
  actions: readonly TableAction[],
  settings: AutoSettings,
): TableAction | null;

// dice-playback.ts
export type DiceOutcome = "hit" | "miss" | "double";
export interface DiceStep {
  roll: [number, number];
  outcome: DiceOutcome;
  /** 何回目か（1〜4）。ゾロ目は振り直す回の番号。 */
  attempt: number;
  /** この回までの当たりの回数 */
  hits: number;
}
export const DICE_ATTEMPTS = 4;
export function diceSteps(
  faces: [number, number],
  rolls: readonly [number, number][],
): DiceStep[];
```

- [ ] **Step 1: 失敗するテストを書く**

`seats.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { seatLayout } from "./seats";

describe("seatLayout", () => {
  it("次の手番の人を右、その次の人を左に置く", () => {
    expect(seatLayout(0)).toEqual({ self: 0, right: 1, left: 2 });
    expect(seatLayout(1)).toEqual({ self: 1, right: 2, left: 0 });
    expect(seatLayout(2)).toEqual({ self: 2, right: 0, left: 1 });
  });
});
```

`actions.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { TableAction } from "@/server/table";
import { autoAction, buildMenu } from "./actions";

const seat = 0;
const turn: TableAction[] = [
  { type: "tsumo", seat },
  { type: "discard", seat, tile: 10 },
  { type: "discard", seat, tile: 20 },
  { type: "riichi", seat, tile: 20, doubleStake: false },
  { type: "riichi", seat, tile: 20, doubleStake: true },
  { type: "ankan", seat, kind: "3p" },
  { type: "kakan", seat, tile: 30 },
];
const response: TableAction[] = [
  { type: "ron", seat },
  { type: "pon", seat, tiles: [40, 41] },
  { type: "pon", seat, tiles: [40, 42] },
  { type: "minkan", seat },
  { type: "pass", seat },
];

describe("buildMenu", () => {
  it("手番の操作を種類ごとにまとめる", () => {
    const menu = buildMenu(turn);
    expect(menu.discards).toEqual([10, 20]);
    expect(menu.riichiTiles).toEqual([20]);
    expect(menu.tsumo).toEqual({ type: "tsumo", seat });
    expect(menu.ankans).toHaveLength(1);
    expect(menu.kakans).toHaveLength(1);
    expect(menu.ron).toBeNull();
    expect(menu.pass).toBeNull();
  });

  it("応答の操作をまとめる", () => {
    const menu = buildMenu(response);
    expect(menu.ron).toEqual({ type: "ron", seat });
    expect(menu.pons).toHaveLength(2);
    expect(menu.minkan).toEqual({ type: "minkan", seat });
    expect(menu.pass).toEqual({ type: "pass", seat });
    expect(menu.discards).toEqual([]);
  });

  it("確認とサイコロ", () => {
    expect(buildMenu([{ type: "confirm", seat }]).confirm).not.toBeNull();
    expect(
      buildMenu([{ type: "dice", seat, faces: [1, 2] }]).dice,
    ).toHaveLength(1);
  });
});

describe("autoAction", () => {
  const off = { autoWin: false, noCall: false };

  it("どちらも切ってあれば何も送らない", () => {
    expect(autoAction(turn, off)).toBeNull();
    expect(autoAction(response, off)).toBeNull();
  });

  it("自動和了はツモとロンを送る", () => {
    const on = { autoWin: true, noCall: false };
    expect(autoAction(turn, on)).toEqual({ type: "tsumo", seat });
    expect(autoAction(response, on)).toEqual({ type: "ron", seat });
  });

  it("鳴きなしはポンと大明槓だけの応答をスキップする", () => {
    const on = { autoWin: false, noCall: true };
    const callOnly = response.filter((a) => a.type !== "ron");
    expect(autoAction(callOnly, on)).toEqual({ type: "pass", seat });
  });

  it("鳴きなしでもロンができるときは止まる", () => {
    expect(autoAction(response, { autoWin: false, noCall: true })).toBeNull();
  });

  it("鳴きなしは自分の手番の暗槓や加槓には関係しない", () => {
    expect(autoAction(turn, { autoWin: false, noCall: true })).toBeNull();
  });
});
```

`dice-playback.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { diceSteps } from "./dice-playback";

describe("diceSteps", () => {
  it("順不同で当たりを数える", () => {
    const steps = diceSteps(
      [2, 5],
      [
        [5, 2],
        [1, 3],
        [2, 5],
        [6, 4],
      ],
    );
    expect(steps.map((s) => s.outcome)).toEqual(["hit", "miss", "hit", "miss"]);
    expect(steps.map((s) => s.attempt)).toEqual([1, 2, 3, 4]);
    expect(steps.map((s) => s.hits)).toEqual([1, 1, 2, 2]);
  });

  it("ゾロ目は回数を消費せず、同じ回を振り直す", () => {
    const steps = diceSteps(
      [1, 2],
      [
        [3, 3],
        [1, 2],
        [4, 4],
        [6, 6],
        [2, 3],
        [1, 6],
        [2, 1],
      ],
    );
    expect(steps.map((s) => s.outcome)).toEqual([
      "double",
      "hit",
      "double",
      "double",
      "miss",
      "miss",
      "hit",
    ]);
    expect(steps.map((s) => s.attempt)).toEqual([1, 1, 2, 2, 2, 3, 4]);
    expect(steps.at(-1)!.hits).toBe(2);
  });
});
```

- [ ] **Step 2: `npm run test -- logic` が失敗することを確かめる**

- [ ] **Step 3: 実装を書く**

`seats.ts`

```ts
import type { Seat } from "@/engine";

/** 自分から見た席の並び。下家（次の手番の人）が右、上家が左。 */
export interface SeatLayout {
  self: Seat;
  right: Seat;
  left: Seat;
}

export function seatLayout(self: Seat): SeatLayout {
  return {
    self,
    right: ((self + 1) % 3) as Seat,
    left: ((self + 2) % 3) as Seat,
  };
}
```

`actions.ts`

```ts
import type { TileId } from "@/engine";
import type { TableAction } from "@/server/table";

type Of<T extends TableAction["type"]> = Extract<TableAction, { type: T }>;

/** サーバーから届いた「いま可能な操作」を、画面の部品ごとにまとめたもの。 */
export interface ActionMenu {
  /** 切れる牌 */
  discards: TileId[];
  /** リーチして切れる牌（通常と2倍で同じ） */
  riichiTiles: TileId[];
  tsumo: TableAction | null;
  ron: TableAction | null;
  pons: Of<"pon">[];
  minkan: TableAction | null;
  ankans: Of<"ankan">[];
  kakans: Of<"kakan">[];
  pass: TableAction | null;
  confirm: TableAction | null;
  dice: Of<"dice">[];
}

export function buildMenu(actions: readonly TableAction[]): ActionMenu {
  const all = <T extends TableAction["type"]>(type: T) =>
    actions.filter((a): a is Of<T> => a.type === type);
  const one = (type: TableAction["type"]) =>
    actions.find((a) => a.type === type) ?? null;
  return {
    discards: all("discard").map((a) => a.tile),
    riichiTiles: [...new Set(all("riichi").map((a) => a.tile))],
    tsumo: one("tsumo"),
    ron: one("ron"),
    pons: all("pon"),
    minkan: one("minkan"),
    ankans: all("ankan"),
    kakans: all("kakan"),
    pass: one("pass"),
    confirm: one("confirm"),
    dice: all("dice"),
  };
}

export interface AutoSettings {
  /** ツモとロンを自動で送る */
  autoWin: boolean;
  /** ポンと大明槓しかできない応答を自動でスキップする */
  noCall: boolean;
}

/** 切り替えボタンの設定に従って自動で送る操作。なければ null。 */
export function autoAction(
  actions: readonly TableAction[],
  settings: AutoSettings,
): TableAction | null {
  const menu = buildMenu(actions);
  if (settings.autoWin && (menu.tsumo ?? menu.ron))
    return menu.tsumo ?? menu.ron;
  // ロンができるときは本人に選ばせる
  if (settings.noCall && menu.pass && !menu.ron) return menu.pass;
  return null;
}
```

`dice-playback.ts`

```ts
export type DiceOutcome = "hit" | "miss" | "double";

/** サイコロ1回分の再生内容 */
export interface DiceStep {
  roll: [number, number];
  outcome: DiceOutcome;
  /** 何回目か（1〜4）。ゾロ目は振り直す回の番号。 */
  attempt: number;
  /** この回までの当たりの回数 */
  hits: number;
}

/** 1回のチャンスで振る回数（ゾロ目を除く） */
export const DICE_ATTEMPTS = 4;

/** サーバーが振った出目の並びを、1回ずつ見せる手順に変える。 */
export function diceSteps(
  faces: [number, number],
  rolls: readonly [number, number][],
): DiceStep[] {
  const steps: DiceStep[] = [];
  let attempt = 1;
  let hits = 0;
  for (const roll of rolls) {
    const [a, b] = roll;
    if (a === b) {
      steps.push({ roll, outcome: "double", attempt, hits });
      continue;
    }
    const hit =
      (a === faces[0] && b === faces[1]) || (a === faces[1] && b === faces[0]);
    if (hit) hits++;
    steps.push({ roll, outcome: hit ? "hit" : "miss", attempt, hits });
    attempt++;
  }
  return steps;
}
```

- [ ] **Step 4: `npm run test -- logic` が通ることを確かめる**
- [ ] **Step 5: コミット**（`feat(ui): add seat layout, action menu and dice playback logic`）

---

### Task 3: 卓の画面（対局中）

**Files:**

- Create: `src/app/games/[id]/use-game-view.ts`、`table/stage.tsx`、`table/center-panel.tsx`、`table/river.tsx`、`table/melds.tsx`、`table/opponent.tsx`、`table/my-hand.tsx`、`table/action-bar.tsx`、`table/table-screen.tsx`
- Modify: `src/app/games/[id]/game-client.tsx`（通信と `TableScreen` の呼び出しだけにする）

**Interfaces:**

- Consumes: Task 1 の `Tile`、`TileBack`、Task 2 の `seatLayout`、`buildMenu`、`autoAction`、既存の `displayHand`、`labels.ts`
- Produces:

```ts
// use-game-view.ts（既存の useGameView と Snapshot をそのまま移す）
export interface Snapshot {
  version: number;
  view: PlayerView;
}
export function useGameView(
  gameId: string,
  initial: Snapshot,
): {
  snapshot: Snapshot;
  accept(next: Snapshot): void;
  refetch(): Promise<void>;
};

// table/table-screen.tsx
export function TableScreen(props: {
  view: PlayerView;
  /** 画面データの版番号。牌の選択と自動操作を、更新のたびにやり直すために使う */
  version: number;
  names: string[];
  roomCode: string | null;
  busy: boolean;
  error: string | null;
  send(action: TableAction): void;
  /** 画面を開いた時点ですでに届いていたサイコロの結果の数（再生しない分） */
  shownDice: number;
}): JSX.Element;
```

**レイアウト（960×540 の中の位置。単位はpx）**

| 部品               | 位置                       | 内容                                                                       |
| ------------------ | -------------------------- | -------------------------------------------------------------------------- |
| 上の帯             | y 8〜32                    | 左に上家の名前、中央に「残り N枚」、右に下家の名前                         |
| 上家の席           | x 16〜210、y 44〜370       | 外側に裏向きの手牌（横向き、幅20、縦に並べる）。内側に花と副露（牌の幅24） |
| 上家の河           | x 222〜390、y 44〜196      | 牌の幅28、6枚で折り返し、4段                                               |
| 中央パネル         | x 390〜570、y 44〜196      | 局と本場、供託、ドラ表示牌（幅22）、3人の風と持ち点                        |
| 下家の河           | x 570〜738、y 44〜196      | 上家の河と同じ                                                             |
| 下家の席           | x 750〜944、y 44〜370      | 上家の席を左右反転                                                         |
| 自分の河           | x 396〜564、y 204〜356     | 牌の幅28、6枚で折り返し、4段                                               |
| 切り替えボタン     | x 16〜、y 400〜436         | 自動和了、鳴きなし                                                         |
| 自分の花           | x 250〜、y 400〜           | 牌の幅24                                                                   |
| 操作ボタン         | 右寄せ x 〜944、y 392〜440 | ポン、槓、ロン、ツモ、リーチ、2倍リーチ、スキップ、取り消し                |
| 自分の手牌         | x 16〜、y 452〜532         | 牌の幅54。ツモ牌は 12px 離す                                               |
| 自分の副露         | 右寄せ x 〜944、y 476〜532 | 牌の幅36                                                                   |
| エラーと待ちの表示 | x 396〜564、y 364〜388     | 「その操作はできません」など                                               |

配色は `globals.css` の `--background: #050b1a`、`--foreground: #e6f6ff` を使い、枠線は水色（`#22d3ee` 系）にする。

**部品ごとの仕様**

- `stage.tsx`：`useSyncExternalStore` で `window` の `resize` を購読し、`min(innerWidth / 960, innerHeight / 540)` の倍率で 960×540 の箱を `transform: scale()` する（サーバー側の値は 1）。箱は画面の中央に置く。Tailwind の `portrait:` で卓を隠し、「画面を横にしてください」を出す。
- `center-panel.tsx`：`roundLabel(view.roundIndex, view.honba)`、`供託 N`、ドラ表示牌。3人の行は「風 持ち点」。上家は左、下家は右、自分は下に置く。`view.turn` の人は水色に光らせる（`view.roundPhase === "ended"` のときは光らせない）。`view.riichi[seat]` があればリーチ棒（白い細い棒、2倍は金色）を点数の横に出す。
- `river.tsx`：`discards: Discard[]`。`riichi` は `sideways`、`called` は `dimmed`。`view.lastDiscard` と同じ牌には水色の枠を付ける。
- `melds.tsx`：`MeldState[]` と花。ポンと大明槓と加槓は、鳴いた牌（`tiles` の最後の1枚）を横向きにする。暗槓は両端を裏向きにする。どの牌を横にするかは実装前に `src/engine/round.ts` のポンと槓の処理を読んで、`tiles` の並びを確かめる。
- `opponent.tsx`：`side: "left" | "right"`。`view.handCounts[seat]` 枚の `TileBack`（横向き）を縦に並べる。局が終わって `view.revealed[seat]` があれば、裏向きの代わりに表向きの手牌（幅24）を出す。
- `my-hand.tsx`：`displayHand(view.hand, view.drawn)` の順に並べる。選べる牌（通常は `menu.discards`、リーチの牌選び中は `menu.riichiTiles`）だけをボタンにし、選べない牌は牌選び中だけ暗くする。1回目のタップで `raised`、同じ牌の2回目で `onPick(tile)`。選択中の牌は `{ version, tile }` で持ち、版番号が変わったら無いものとして扱う（effect で消さない）。
- `action-bar.tsx`：`menu` からボタンを出す。
  - ツモ、ロン、スキップ、大明槓：押したら送る。
  - ポン：選択肢が1つならそのまま送る。2つ以上なら、使う2枚の牌を並べたボタンを出す。
  - 槓（暗槓、加槓）：合わせて1つならそのまま送る。2つ以上なら牌を並べたボタンを出す。
  - リーチ、2倍リーチ：`menu.riichiTiles` があるとき出す。押すと牌選びに入り（`riichiMode: "normal" | "double" | null`）、「取り消し」を出す。牌選びで選ばれた牌は `{ type: "riichi", tile, doubleStake }` を送る。
  - 切り替えボタン（自動和了、鳴きなし）：`AutoSettings` を `TableScreen` の state で持つ。
- `table-screen.tsx`：`seatLayout(view.seat)` で席を決めて上の部品を並べる。`autoAction(view.actions, settings)` が操作を返したら、その版番号でまだ送っていなければ送る（`useRef` で最後に送った版番号を覚える。effect の中で `send` を呼ぶ）。
- `game-client.tsx`：`useGameView` を import に変え、`send` と `error`、`busy` を持ち、`TableScreen` を呼ぶだけにする。`shownDice` は `useState(() => initialView.dice.length)` の初期値と、その局の鍵（`roundIndex` と `honba`）を覚えておき、局が変わったら 0 として渡す。

- [ ] **Step 1:** `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` を読み、`"use client"` の境界の書き方がこの版で変わっていないか確かめる。
- [ ] **Step 2:** `use-game-view.ts` に既存の hook を移し、`game-client.tsx` から import する。`npm run typecheck`。
- [ ] **Step 3:** `stage.tsx`、`center-panel.tsx`、`river.tsx`、`melds.tsx`、`opponent.tsx` を書く。
- [ ] **Step 4:** `my-hand.tsx`、`action-bar.tsx`、`table-screen.tsx` を書き、`game-client.tsx` を差し替える。局の結果と終局は、Task 4 までの間は既存の文字の表示を `table-screen.tsx` の中に仮に残さず、Task 4 と続けて作る（Task 3 と 4 は同じコミットにしない。Task 3 の時点では結果の重ね表示が無い状態を許す）。
- [ ] **Step 5:** `npm run typecheck && npm run lint && npm run test` を通す。
- [ ] **Step 6:** コミット（`feat(ui): rebuild the game screen as a table with tile images`）

---

### Task 4: 結果の画面とサイコロ

**Files:**

- Create: `src/app/games/[id]/table/round-result.tsx`、`table/dice.tsx`、`table/use-dice-playback.ts`、`table/game-result.tsx`
- Modify: `src/app/games/[id]/table/table-screen.tsx`、`src/app/globals.css`（サイコロの揺れの keyframes）

**Interfaces:**

- Consumes: Task 2 の `diceSteps`、`DICE_ATTEMPTS`、`buildMenu`
- Produces:

```ts
// use-dice-playback.ts
export interface DicePlayback {
  /** 再生中のチャンス（view.dice の添字）。再生していなければ null */
  index: number | null;
  /** 再生中のチャンスで、いま見せている回（diceSteps の添字） */
  step: number;
  /** 転がっている最中か、止まって結果を見せているか */
  rolling: boolean;
  /** 再生が終わった（または再生しない）チャンスの数 */
  done: number;
}
export function useDicePlayback(
  dice: readonly DiceResult[],
  shown: number,
): DicePlayback;
```

**仕様**

- `use-dice-playback.ts`：`done` の初期値は `shown`。`dice.length > done` なら `index = done` を再生する。1回分は「転がる 1200ms → 結果 1000ms」。最後の回の結果を見せ終えたら `done + 1`。タイマーは `setTimeout` を effect の中で張り、state の更新はタイマーのコールバックの中だけで行う。
- `dice.tsx`：
  - サイコロの面は 3×3 の点で描く（1〜6）。転がっている間は 80ms ごとに乱数の面に変え、CSS の揺れ（`globals.css` に `@keyframes dice-shake`）を付ける。
  - 再生中：指定した出目、`attempt / 4 回目`、ここまでの当たり回数、結果の文字（「当たり！ +N枚」「外れ」「ゾロ目 もう1回」）。N は `Math.abs(chipDeltas[指定した人]) / hits`（当たりが1回以上あるときだけ計算できる。指定した人が受け取る枚数。逆ポッチでは払う枚数）。
  - 出目の指定（`menu.dice` があり、再生中でない）：15個のボタン。ボタンにはサイコロの面を2つ描く。
  - 指定を待っている人以外（`view.diceChance` があり、自分の番でない）：「◯◯が出目を選んでいます」。
  - 再生済みのチャンスは1行にまとめる（「◯◯ 2-5 を指定：当たり1回」と祝儀の移動）。
- `round-result.tsx`：`view.outcome` があるとき、卓の上に半透明の板を重ねる。
  - 和了ごとに：名前、種類（ツモ、ロン（◯◯から）、ポッチ、逆ポッチ、流し役満）、公開された手牌（`view.revealed[seat]`、幅30）と副露、和了牌、役の一覧（`YAKU_LABELS`）とドラの内訳（表ドラ、裏ドラ、赤、金、花。0は出さない）、`N翻` または `役満×N`。
  - 流局：「流局」、テンパイの人の名前と手牌。
  - 裏ドラ表示牌（`outcome.uraIndicators`）。
  - 点棒と祝儀の移動（3人分、符号付き）。
  - サイコロ（`dice.tsx`）。
  - `menu.confirm` があり、サイコロの再生が終わっていれば「確認」ボタン。確認済みの人の名前。サイコロの再生が終わるまでは、サイコロの祝儀を含む表示と確認ボタンを出さない。
- `game-result.tsx`：`view.result` があるとき。順位、名前、最終持ち点、スコア、祝儀。`roomCode` があれば「ルームへ戻る（再戦はこちら）」。
- 終局のときは、最後の局の結果の下に終局を続けて出す（1枚の板の中で縦に並べ、板の中をスクロールできるようにする）。

- [ ] **Step 1:** `use-dice-playback.ts` と `dice.tsx` を書く。
- [ ] **Step 2:** `round-result.tsx`、`game-result.tsx` を書き、`table-screen.tsx` に重ねる。
- [ ] **Step 3:** `npm run typecheck && npm run lint && npm run test` を通す。
- [ ] **Step 4:** コミット（`feat(ui): add round result, dice chance playback and game result`）

---

### Task 5: 確認用の卓と、画面の確認

**Files:**

- Create: `src/app/dev/table/page.tsx`、`src/app/dev/table/sandbox.tsx`
- Modify: `README.md`（構成の説明と、確認用の卓の使い方）

**Interfaces:**

- Consumes: `TableScreen`、`startTable`、`applyTableAction`、`buildView`（`@/server/table`。エンジンだけに依存するのでブラウザでも動く）

**仕様**

- `page.tsx`：`process.env.NODE_ENV !== "development"` なら `notFound()`。本番では開けない。
- `sandbox.tsx`（`"use client"`）：`TableState` を state で持ち、席0を自分として `TableScreen` に `buildView(table, 0)` を渡す。`send` は `applyTableAction` をその場で適用する。ほかの2人は、可能な操作から決まった擬似乱数で選んで自動で進める（スキップを多めに選ぶ）。版番号は操作のたびに1増やす。
- 卓の外（上の隅）に確認用のボタンを置く：「局の終わりまで進める」「終局まで進める」「サイコロを出す」（`view` を上書きして、出目の指定と、指定後の作り物の結果を出す）。
- Playwright（MCP）で `http://localhost:3000/dev/table` を開き、844×390 と 1440×900 でスクリーンショットを撮る。見るもの：
  1. 配牌直後（手牌14枚、ツモ牌が離れている）
  2. 1回目のタップで牌が浮き、2回目で河に出る
  3. 中盤（3人の河、副露、花、リーチ棒）
  4. リーチの牌選び
  5. 局の結果（和了と流局）
  6. サイコロの出目の指定と再生
  7. 終局
  8. 縦画面（390×844）で回転の案内だけが出る
- 崩れや読みにくさを見つけたら、その場で直して撮り直す。

- [ ] **Step 1:** `page.tsx` と `sandbox.tsx` を書く。
- [ ] **Step 2:** `npm run dev` を起動し、上の8項目をスクリーンショットで確かめて直す。
- [ ] **Step 3:** `README.md` の「対局の画面は通信を確かめるための仮のもの」を書き換え、確認用の卓（`/dev/table`、開発時だけ）を書き足す。`docs/SPEC.md` の「フェーズ6で決めた内容」の「対局の画面」の行を、フェーズ7で作り直した旨に直す。
- [ ] **Step 4:** `npm run typecheck && npm run lint && npm run test && npm run build` を通す。
- [ ] **Step 5:** `npm run test:play`（ローカルのSupabaseと開発サーバーが動いている状態）で、APIを通した1半荘が今までどおり進むことを確かめる。
- [ ] **Step 6:** コミット（`feat(ui): add a dev-only sandbox table and update docs`）

---

## 仕様との対応

| 仕様の節              | タスク                           |
| --------------------- | -------------------------------- |
| 1. 牌の画像           | Task 1                           |
| 2. 卓の配置           | Task 3                           |
| 3. 操作               | Task 2（判断）、Task 3（画面）   |
| 4. 結果の画面         | Task 2（サイコロの手順）、Task 4 |
| 5. 部品の分け方       | Task 2〜4                        |
| 6. エラーと取りこぼし | Task 3（既存の仕組みを残す）     |
| 7. 確認の方法         | 各タスクの単体テスト、Task 5     |

## 実装時に変えたこと

- 卓の大きさを 960×540 から 1040×480 にした。スマホの横画面は 16:9 より横長で、16:9 だと左右が余って牌が小さくなるため。Task 3 のレイアウト表の位置は、この大きさに合わせて `table-screen.tsx` で決め直した。
- 相手の席には、局が終わっても公開された手牌を出さない。局の結果の中に出るので重複するため。
- Task 3 と Task 4 は1つのコミットにした。`table-screen.tsx` が結果の部品を import するので、分けると途中のコミットがビルドできないため。
- 確認用の卓に「聴牌」と「ポッチ」のボタンを足した。でたらめに打つだけでは和了もリーチもほとんど起きないため。「ポッチ」はリーチ一発でポッチを引く配牌で、本物のサイコロチャンスになる。
- サイコロの再生中は、上の帯の祝儀の累計を「…」にする。局が終わった時点で累計にサイコロの結果が入るので、そのまま出すと再生より先に結果がわかってしまうため。
