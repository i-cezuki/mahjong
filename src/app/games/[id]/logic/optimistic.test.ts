import { describe, expect, it } from "vitest";
import { startRoundFromDeck, tileOf } from "@/engine";
import { buildDeck, seedOf } from "@/engine/testing";
import { applyTableAction, buildView, startTable } from "@/server/table";
import type { PlayAction, TableState } from "@/server/table";
import { optimisticView } from "./optimistic";

const nextSeed = () => seedOf(9);

/** サーバーが同じ操作を適用したあとの、本人の画面データ。 */
function serverView(table: TableState, action: PlayAction) {
  return buildView(
    applyTableAction(table, action, nextSeed).table,
    action.seat,
  );
}

/** 席0が配牌で聴牌していて、中を引いた局。リーチできる。 */
function tenpaiTable(): TableState {
  const base = startTable({ seed: seedOf(1) }).table;
  const round = startRoundFromDeck(
    buildDeck({
      hands: [
        "123456789p 23s 11z",
        "111222333p 3s 9s 66z",
        "19m 456789s 12345z",
      ],
      live: "7z 9s",
    }),
    { dealer: 0 },
  ).state;
  return { ...base, game: { ...base.game, round } };
}

describe("optimisticView（操作の先取り表示）", () => {
  it("打牌は、手牌と河がサーバーの結果と同じになる", () => {
    const { table } = startTable({ seed: seedOf(3) });
    const view = buildView(table, 0);
    for (const action of view.actions) {
      if (action.type !== "discard") continue;
      const guess = optimisticView(view, action);
      const real = serverView(table, action);
      expect(guess).not.toBeNull();
      expect(guess!.hand).toEqual(real.hand);
      expect(guess!.drawn).toBeNull();
      expect(guess!.rivers[0]).toEqual(real.rivers[0]);
      // 次の人のツモはサーバーの結果を待つ。自分の枚数だけ合っていればよい
      expect(guess!.handCounts[0]).toBe(real.handCounts[0]);
      // 応答が返るまで、次の操作はさせない
      expect(guess!.actions).toEqual([]);
      expect(guess!.deadline).toBeNull();
    }
  });

  it("リーチは、宣言牌を横向きに置いて、リーチの状態にする", () => {
    const table = tenpaiTable();
    const view = buildView(table, 0);
    const action = view.actions.find(
      (a) =>
        a.type === "riichi" && !a.doubleStake && tileOf(a.tile).kind === "7z",
    )!;
    const guess = optimisticView(view, action)!;
    const real = serverView(table, action as PlayAction);
    expect(guess.hand).toEqual(real.hand);
    expect(guess.rivers[0]).toEqual(real.rivers[0]);
    expect(guess.riichi[0]).toEqual({ doubleStake: false });
    expect(guess.riichi).toEqual(real.riichi);
  });

  it("スキップは、ボタンを消すだけ", () => {
    const table = tenpaiTable();
    const view = buildView(table, 0);
    const guess = optimisticView(view, { type: "pass", seat: 0 })!;
    expect(guess).toEqual({ ...view, actions: [], deadline: null });
  });

  it("局の結果の確認は、自分を確認済みにする", () => {
    const table = tenpaiTable();
    const view = buildView(table, 0);
    const guess = optimisticView(view, { type: "confirm", seat: 0 })!;
    expect(guess.confirmed).toEqual([true, false, false]);
    expect(guess.actions).toEqual([]);
  });

  it("結果がサーバーでないと決まらない操作は、先取りしない", () => {
    const view = buildView(tenpaiTable(), 0);
    expect(optimisticView(view, { type: "tsumo", seat: 0 })).toBeNull();
    expect(optimisticView(view, { type: "ron", seat: 0 })).toBeNull();
    expect(optimisticView(view, { type: "minkan", seat: 0 })).toBeNull();
    expect(optimisticView(view, { type: "resume", seat: 0 })).toBeNull();
    expect(
      optimisticView(view, { type: "dice", seat: 0, faces: [1, 2] }),
    ).toBeNull();
  });

  it("元の画面データを書き換えない", () => {
    const { table } = startTable({ seed: seedOf(3) });
    const view = buildView(table, 0);
    const before = structuredClone(view);
    optimisticView(
      view,
      view.actions.find((a) => a.type === "discard")!,
    );
    expect(view).toEqual(before);
  });
});
