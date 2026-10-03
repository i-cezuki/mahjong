import { describe, expect, it } from "vitest";
import type { TableAction } from "@/server/table";
import { autoAction, buildMenu, tsumogiriAction } from "./actions";

const seat = 0;
const turn: TableAction[] = [
  { type: "tsumo", seat },
  { type: "discard", seat, tile: 10 },
  { type: "discard", seat, tile: 20 },
  { type: "riichi", seat, tile: 20, doubleStake: false },
  { type: "riichi", seat, tile: 20, doubleStake: true },
  { type: "riichi", seat, tile: 20, doubleStake: false, open: true },
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
    expect(menu.doubleRiichiTiles).toEqual([20]);
    expect(menu.openRiichiTiles).toEqual([20]);
    expect(menu.tsumo).toEqual({ type: "tsumo", seat });
    expect(menu.ankans).toHaveLength(1);
    expect(menu.kakans).toHaveLength(1);
    expect(menu.ron).toBeNull();
    expect(menu.pass).toBeNull();
  });

  it("2倍リーチを使ったあとは、通常のリーチの牌だけになる", () => {
    const menu = buildMenu(
      turn.filter((a) => !(a.type === "riichi" && a.doubleStake)),
    );
    expect(menu.riichiTiles).toEqual([20]);
    expect(menu.doubleRiichiTiles).toEqual([]);
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
    expect(autoAction(turn, off, false)).toBeNull();
    expect(autoAction(response, off, false)).toBeNull();
  });

  it("自動和了はツモとロンを送る", () => {
    const on = { autoWin: true, noCall: false };
    expect(autoAction(turn, on, false)).toEqual({ type: "tsumo", seat });
    expect(autoAction(response, on, false)).toEqual({ type: "ron", seat });
  });

  it("鳴きなしはポンと大明槓だけの応答をスキップする", () => {
    const on = { autoWin: false, noCall: true };
    const callOnly = response.filter((a) => a.type !== "ron");
    expect(autoAction(callOnly, on, false)).toEqual({ type: "pass", seat });
  });

  it("鳴きなしでもロンができるときは止まる", () => {
    expect(
      autoAction(response, { autoWin: false, noCall: true }, false),
    ).toBeNull();
  });

  it("鳴きなしは自分の手番の暗槓や加槓には関係しない", () => {
    expect(
      autoAction(turn, { autoWin: false, noCall: true }, false),
    ).toBeNull();
  });

  describe("リーチ後", () => {
    const off = { autoWin: false, noCall: false };
    const drawOnly: TableAction[] = [{ type: "discard", seat, tile: 50 }];

    it("和了牌でなければツモ切りする", () => {
      expect(autoAction(drawOnly, off, true)).toEqual(drawOnly[0]);
    });

    it("和了牌を引いたら止まる", () => {
      const winning: TableAction[] = [{ type: "tsumo", seat }, ...drawOnly];
      expect(autoAction(winning, off, true)).toBeNull();
    });

    it("和了牌を引いて自動和了が入っていればツモを送る", () => {
      const winning: TableAction[] = [{ type: "tsumo", seat }, ...drawOnly];
      expect(
        autoAction(winning, { autoWin: true, noCall: false }, true),
      ).toEqual({ type: "tsumo", seat });
    });

    it("暗槓ができるときは止まる", () => {
      const withKan: TableAction[] = [
        ...drawOnly,
        { type: "ankan", seat, kind: "3p" },
      ];
      expect(autoAction(withKan, off, true)).toBeNull();
    });

    it("リーチしていなければ、切れる牌が1枚でもツモ切りしない", () => {
      expect(autoAction(drawOnly, off, false)).toBeNull();
    });

    it("ロンの応答では何も切らない", () => {
      expect(autoAction(response, off, true)).toBeNull();
    });
  });
});

describe("tsumogiriAction", () => {
  it("ツモ牌を切る操作を返す", () => {
    expect(tsumogiriAction(turn, 20)).toEqual({
      type: "discard",
      seat,
      tile: 20,
    });
  });

  it("ツモ牌がない（ポンの直後）ときは返さない", () => {
    expect(tsumogiriAction(turn, null)).toBeNull();
  });

  it("ツモ牌が切れないとき（自分の手番でない、応答待ち）は返さない", () => {
    expect(tsumogiriAction(turn, 99)).toBeNull();
    expect(tsumogiriAction(response, 20)).toBeNull();
    expect(tsumogiriAction([], 20)).toBeNull();
  });
});
