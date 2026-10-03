import { describe, expect, it } from "vitest";
import { applyAction, startRoundFromDeck, tileOf } from "@/engine";
import type { Action, Seat } from "@/engine";
import { buildDeck, seedOf } from "@/engine/testing";
import type { DeckSpec } from "@/engine/testing";
import { buildView, startTable } from "@/server/table";
import type { PlayerView, TableState } from "@/server/table";
import {
  callLabel,
  callTextSize,
  detectCalls,
  detectTedashi,
  isJackpotCall,
  isWinCall,
} from "./calls";

/** 親が席0の局を、牌の並びを決めて始める。操作のたびに席2から見た画面データを返す。 */
function scenario(deck: DeckSpec) {
  const base = startTable({ seed: seedOf(1) }).table;
  let table: TableState = {
    ...base,
    game: {
      ...base.game,
      round: startRoundFromDeck(buildDeck(deck), { dealer: 0 }).state,
    },
  };
  const view = (): PlayerView => buildView(table, 2);
  const act = (action: Action): PlayerView => {
    const round = applyAction(table.game.round, action).state;
    table = { ...table, game: { ...table.game, round } };
    return view();
  };
  /** その種類の牌を切る。riichi ならリーチを宣言して切る。 */
  const cut = (
    seat: Seat,
    kind: string,
    riichi = false,
    doubleStake = false,
    open = false,
  ) => {
    const tile = table.game.round.hands[seat].find(
      (id) => tileOf(id).kind === kind,
    );
    if (tile === undefined) throw new Error(`${kind} が手牌にありません`);
    return act(
      riichi
        ? { type: "riichi", seat, tile, doubleStake, ...(open && { open }) }
        : { type: "discard", seat, tile },
    );
  };
  /** その席にいま出ている操作のうち、指定の種類のものを送る（ポン、加槓など）。 */
  const call = (seat: Seat, type: Action["type"]) => {
    const action = buildView(table, seat).actions.find((a) => a.type === type);
    if (!action || action.type === "confirm") {
      throw new Error(`${type} はできません`);
    }
    return act(action);
  };
  return { view, act, cut, call };
}

/** 席1は筒子の刻子3つと66z。席2はばらばら。 */
const OTHERS = ["111222333p 3s 9s 66z", "19m 456789s 12345z"] as const;

describe("detectCalls（発声の検出）", () => {
  it("何も宣言していない打牌では出ない", () => {
    const s = scenario({
      hands: ["123456789p 23s 11z", ...OTHERS],
      live: "7z 1m",
    });
    const before = s.view();
    expect(detectCalls(before, s.cut(0, "7z"))).toEqual([]);
  });

  it("リーチを宣言した人を出す。2倍リーチは別の種類", () => {
    const s = scenario({
      hands: ["123456789p 23s 11z", ...OTHERS],
      live: "7z 9s",
    });
    const before = s.view();
    const afterFirst = s.cut(0, "7z", true);
    expect(detectCalls(before, afterFirst)).toEqual([
      { seat: 0, kind: "riichi" },
    ]);
    // 席1が追いかけて2倍リーチ。すでにリーチしている席0は出さない
    expect(detectCalls(afterFirst, s.cut(1, "3s", true, true))).toEqual([
      { seat: 1, kind: "doubleStakeRiichi" },
    ]);
  });

  it("オープンリーチは別の種類", () => {
    const s = scenario({
      hands: ["123456789p 23s 11z", ...OTHERS],
      live: "7z 9s",
    });
    const before = s.view();
    expect(detectCalls(before, s.cut(0, "7z", true, false, true))).toEqual([
      { seat: 0, kind: "openRiichi" },
    ]);
  });

  it("ツモ和了", () => {
    const s = scenario({
      hands: ["123456789p 23s 11z", ...OTHERS],
      live: "7z 1m 9m 4s",
    });
    s.cut(0, "7z");
    s.cut(1, "1m");
    const before = s.cut(2, "9m");
    const calls = detectCalls(before, s.act({ type: "tsumo", seat: 0 }));
    expect(calls).toEqual([{ seat: 0, kind: "tsumo" }]);
    expect(calls.some(isWinCall)).toBe(true);
    expect(calls.some(isJackpotCall)).toBe(false);
  });

  it("一発ツモは別の種類で、特別な発声にする", () => {
    const s = scenario({
      hands: ["123456789p 23s 11z", ...OTHERS],
      live: "7z 1m 9m 4s",
    });
    s.cut(0, "7z", true);
    s.cut(1, "1m");
    const before = s.cut(2, "9m");
    const calls = detectCalls(before, s.act({ type: "tsumo", seat: 0 }));
    expect(calls).toEqual([{ seat: 0, kind: "ippatsuTsumo" }]);
    expect(calls.some(isWinCall)).toBe(true);
    expect(calls.some(isJackpotCall)).toBe(true);
  });

  it("ロン。宣言牌でのロンは、リーチとロンの両方を出す", () => {
    const s = scenario({
      hands: ["123456789p 24s 11z", ...OTHERS],
      live: "7z 9s",
    });
    const before = s.cut(0, "7z", true);
    // 席1がリーチを宣言して3索を切り、席0がロンする
    const declared = s.cut(1, "3s", true);
    expect(detectCalls(before, declared)).toEqual([
      { seat: 1, kind: "riichi" },
    ]);
    expect(detectCalls(declared, s.act({ type: "ron", seat: 0 }))).toEqual([
      { seat: 0, kind: "ron" },
    ]);
    // 途中の画面データが届かなかったときは、まとめて出す
    expect(detectCalls(before, s.view())).toEqual([
      { seat: 1, kind: "riichi" },
      { seat: 0, kind: "ron" },
    ]);
  });

  it("ポンと加槓", () => {
    // 席0が東を切り、東を2枚持つ席1がポンする。そのあと4枚目の東を引いて加槓する
    const s = scenario({
      hands: [
        "123456789p 234s 1z",
        "11z 19m 147p 268s 234z",
        "19m 258p 147s 23467z",
      ],
      live: "7z 5z 9s 1z",
    });
    const before = s.cut(0, "1z");
    const calls = detectCalls(before, s.call(1, "pon"));
    expect(calls).toEqual([{ seat: 1, kind: "pon" }]);
    expect(calls.some(isWinCall)).toBe(false);

    s.cut(1, "9m");
    s.cut(2, "5z");
    // 席0が切ると、席1が4枚目の東を引く
    const turn = s.cut(0, "9s");
    expect(detectCalls(turn, s.call(1, "kakan"))).toEqual([
      { seat: 1, kind: "kan" },
    ]);
  });

  it("局が変わったときは出さない", () => {
    const s = scenario({
      hands: ["123456789p 23s 11z", ...OTHERS],
      live: "7z 9s",
    });
    const before = s.view();
    const after = { ...s.cut(0, "7z", true), honba: before.honba + 1 };
    expect(detectCalls(before, after)).toEqual([]);
  });
});

describe("detectTedashi（相手の手出しの検出）", () => {
  const deck: DeckSpec = {
    hands: ["123456789p 23s 11z", ...OTHERS],
    live: "7z 1m 9m",
  };

  it("相手が手牌から切ったら、その席を出す", () => {
    const s = scenario(deck);
    const before = s.view();
    // 席0は中を引いている。手牌の東を切る
    expect(detectTedashi(before, s.cut(0, "1z"))).toEqual([0]);
  });

  it("ツモ切りでは出さない", () => {
    const s = scenario(deck);
    const before = s.view();
    expect(detectTedashi(before, s.cut(0, "7z"))).toEqual([]);
  });

  it("自分（席2）の手出しは出さない", () => {
    const s = scenario(deck);
    s.cut(0, "7z");
    const before = s.cut(1, "1m");
    // 席2は9萬を引いている。手牌の東を切る
    expect(detectTedashi(before, s.cut(2, "1z"))).toEqual([]);
  });

  it("打牌のない更新や、局が変わったときは出さない", () => {
    const s = scenario(deck);
    const before = s.view();
    expect(detectTedashi(before, before)).toEqual([]);
    const after = { ...s.cut(0, "1z"), honba: before.honba + 1 };
    expect(detectTedashi(before, after)).toEqual([]);
  });
});

describe("callLabel（発声の文字）", () => {
  const phrases = ["それだ!", null, null];

  it("ロンは、和了した人の決めゼリフを出す", () => {
    expect(callLabel({ seat: 0, kind: "ron" }, phrases)).toBe("それだ!");
  });

  it("決めゼリフがない人のロンは、ロンと出す", () => {
    expect(callLabel({ seat: 1, kind: "ron" }, phrases)).toBe("ロン");
  });

  it("ロン以外の発声は、決めゼリフがあっても変えない", () => {
    expect(callLabel({ seat: 0, kind: "tsumo" }, phrases)).toBe("ツモ");
    expect(callLabel({ seat: 0, kind: "pon" }, phrases)).toBe("ポン");
  });
});

describe("callTextSize（発声の文字の大きさ）", () => {
  it("3文字までは大きく出す", () => {
    expect(callTextSize("ロン")).toBe("text-5xl");
    expect(callTextSize("ツモ!")).toBe("text-5xl");
  });

  it("長いほど小さくして、帯に収める", () => {
    expect(callTextSize("リーチだ")).toBe("text-4xl");
    expect(callTextSize("それロンだ")).toBe("text-4xl");
    expect(callTextSize("オープンリーチ")).toBe("text-3xl");
    expect(callTextSize("あ".repeat(8))).toBe("text-3xl");
  });

  it("絵文字も1文字として数える", () => {
    expect(callTextSize("🀄🀄🀄")).toBe("text-5xl");
  });
});
