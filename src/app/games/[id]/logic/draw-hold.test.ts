import { describe, expect, it } from "vitest";
import { seedOf } from "@/engine/testing";
import { applyTableAction, buildView, startTable } from "@/server/table";
import type { PlayerView } from "@/server/table";
import { heldView, isDrawHeld } from "./draw-hold";

/** 席0が切って、席1がツモった前後の画面データ */
function discarded() {
  const { table } = startTable({ seed: seedOf(3) });
  const discard = buildView(table, 0).actions.find(
    (a) => a.type === "discard",
  )!;
  const after = applyTableAction(table, discard, () => seedOf(9)).table;
  return {
    before: (seat: 0 | 1 | 2) => buildView(table, seat),
    after: (seat: 0 | 1 | 2) => buildView(after, seat),
  };
}

const timed = (view: PlayerView, startedAt: number): PlayerView => ({
  ...view,
  serverNow: 1_000,
  startedAt,
});

describe("isDrawHeld（ツモを見せる前か）", () => {
  const { after } = discarded();

  it("待ちの開始が保存時刻より後ろで、まだその時刻になっていなければ見せない", () => {
    const view = timed(after(1), 1_800);
    expect(isDrawHeld(view, 1_200)).toBe(true);
    expect(isDrawHeld(view, 1_800)).toBe(false);
  });

  it("待ちの開始が保存時刻と同じ（ポンのあとなど）なら見せる", () => {
    expect(isDrawHeld(timed(after(1), 1_000), 900)).toBe(false);
  });
});

describe("heldView（ツモを見せる前の画面データ）", () => {
  const { before, after } = discarded();

  it("ツモった本人には、ツモ牌と操作を出さず、手牌は前のまま", () => {
    const view = heldView(before(1), after(1));
    expect(after(1).drawn).not.toBeNull();
    expect(view.drawn).toBeNull();
    expect(view.actions).toEqual([]);
    expect(view.hand).toEqual(before(1).hand);
    expect(view.wallCount).toBe(before(1).wallCount);
    expect(view.turn).toBe(1);
  });

  it("ほかの人には、打牌は見せて、山の残りとツモった人の枚数は前のまま", () => {
    const view = heldView(before(2), after(2));
    expect(view.rivers).toEqual(after(2).rivers);
    expect(view.hand).toEqual(after(2).hand);
    expect(view.wallCount).toBe(before(2).wallCount);
    expect(view.handCounts[1]).toBe(before(2).handCounts[1]);
    expect(view.handCounts[0]).toBe(after(2).handCounts[0]);
  });
});
