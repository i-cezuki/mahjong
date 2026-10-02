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
