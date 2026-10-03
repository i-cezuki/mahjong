import { describe, expect, it } from "vitest";
import type { MeldType } from "./agari";
import { tileAllocator } from "./testing";
import { evaluateWin } from "./yaku";
import type { WinInput, WinResult } from "./yaku";

type Options = Partial<
  Pick<
    WinInput,
    | "tsumo"
    | "seatWind"
    | "roundWind"
    | "riichi"
    | "openRiichi"
    | "ippatsu"
    | "lastTile"
    | "rinshan"
    | "firstTurn"
  >
> & {
  melds?: [MeldType, string][];
  flowers?: number;
  dora?: string;
  ura?: string;
};

/** 既定は南家（子）、東場、ロン。4z（北）は役のつかない牌として使う。 */
function win(
  concealed: string,
  winTile: string,
  options: Options = {},
): WinResult | null {
  const t = tileAllocator();
  const { melds = [], flowers = 0, dora = "", ura = "", ...rest } = options;
  return evaluateWin({
    tsumo: false,
    seatWind: "2z",
    roundWind: "1z",
    ...rest,
    concealed: t(concealed),
    winTile: t(winTile)[0]!,
    melds: melds.map(([type, notation]) => ({ type, tiles: t(notation) })),
    flowers: t("1f".repeat(flowers)),
    doraIndicators: t(dora),
    uraIndicators: t(ura),
  });
}

function names(result: WinResult | null): string[] {
  return (result?.yaku ?? []).map((yaku) => yaku.name).sort();
}

/** 役がない門前の手（123p 456p 789s 111s＋北単騎） */
const PLAIN = ["123p456p789s111s4z", "4z"] as const;

describe("和了の成立", () => {
  it("和了形でなければ null", () => {
    expect(win("123p456p789s111s4z", "3z", { riichi: "riichi" })).toBeNull();
  });

  it("役がなければ null", () => {
    expect(win(...PLAIN)).toBeNull();
  });

  it("ドラだけでは和了できない", () => {
    expect(win(...PLAIN, { dora: "3z", flowers: 2 })).toBeNull();
  });

  it("枚数が合わなければ例外", () => {
    expect(() => win("123p456p789s111s", "4z")).toThrow();
  });
});

describe("1翻の役", () => {
  it("門前清自摸", () => {
    const result = win(...PLAIN, { tsumo: true });
    expect(names(result)).toEqual(["menzenTsumo"]);
    expect(result?.han).toBe(1);
  });

  it("リーチ（ドラがあればリーチのみ役満にならない）", () => {
    const result = win(...PLAIN, { riichi: "riichi", dora: "3z" });
    expect(names(result)).toEqual(["riichi"]);
    expect(result?.han).toBe(3);
    expect(result?.yakuman).toBe(0);
  });

  it("オープンリーチはリーチに1翻を足す", () => {
    const result = win(...PLAIN, {
      riichi: "riichi",
      openRiichi: true,
      dora: "3z",
    });
    expect(names(result)).toEqual(["openRiichi", "riichi"]);
    expect(result?.han).toBe(4);
  });

  it("ダブルリーチのオープンは3翻", () => {
    const result = win(...PLAIN, { riichi: "doubleRiichi", openRiichi: true });
    expect(names(result)).toEqual(["doubleRiichi", "openRiichi"]);
    expect(result?.han).toBe(3);
  });

  it("一発", () => {
    const result = win(...PLAIN, { riichi: "riichi", ippatsu: true });
    expect(names(result)).toEqual(["ippatsu", "riichi"]);
    expect(result?.han).toBe(2);
  });

  it("断么九", () => {
    expect(names(win("234p456p234s678s5s", "5s"))).toEqual(["tanyao"]);
  });

  it("喰いタン", () => {
    const result = win("456p234s678s5s", "5s", { melds: [["pon", "222p"]] });
    expect(names(result)).toEqual(["tanyao"]);
  });

  it("平和（両面待ち、役牌でない雀頭）", () => {
    expect(names(win("123p456p789s33z23s", "4s"))).toEqual(["pinfu"]);
    expect(names(win("123p456p789s33z23s", "1s"))).toEqual(["pinfu"]);
  });

  it("平和はツモでも付く", () => {
    const result = win("123p456p789s33z23s", "4s", { tsumo: true });
    expect(names(result)).toEqual(["menzenTsumo", "pinfu"]);
  });

  it("辺張、嵌張、単騎は平和にならない", () => {
    expect(win("123p456p789s44z12s", "3s")).toBeNull();
    expect(win("123p456s234s44z89p", "7p")).toBeNull();
    expect(win("123p456p789s44z13s", "2s")).toBeNull();
    expect(win("123p456p789s234s4z", "4z")).toBeNull();
  });

  it("雀頭が役牌なら平和にならない。客風なら平和", () => {
    expect(win("123p456p789s22z23s", "4s")).toBeNull();
    expect(win("123p456p789s11z23s", "4s")).toBeNull();
    expect(win("123p456p789s55z23s", "4s")).toBeNull();
    expect(names(win("123p456p789s33z23s", "4s"))).toEqual(["pinfu"]);
  });

  it("一盃口は門前のみ", () => {
    expect(names(win("223344p789s111s4z", "4z"))).toEqual(["iipeikou"]);
    expect(win("223344p789s4z", "4z", { melds: [["pon", "111s"]] })).toBeNull();
  });

  it.each([
    ["555z", "haku"],
    ["666z", "hatsu"],
    ["777z", "chun"],
    ["444z", "pei"],
    ["222z", "seatWind"],
    ["111z", "roundWind"],
  ])("役牌 %s", (pon, name) => {
    const result = win("123p456p789s3z", "3z", { melds: [["pon", pon]] });
    expect(names(result)).toEqual([name]);
    expect(result?.han).toBe(1);
  });

  it("東場の親の東は2翻", () => {
    const result = win("123p456p789s4z", "4z", {
      melds: [["pon", "111z"]],
      seatWind: "1z",
    });
    expect(names(result)).toEqual(["roundWind", "seatWind"]);
    expect(result?.han).toBe(2);
  });

  it("自風でも場風でもない風は役にならない", () => {
    expect(
      win("123p456p789s4z", "4z", { melds: [["pon", "333z"]] }),
    ).toBeNull();
    expect(
      names(
        win("123p456p789s4z", "4z", {
          melds: [["pon", "333z"]],
          seatWind: "3z",
        }),
      ),
    ).toEqual(["seatWind"]);
  });

  it("嶺上開花", () => {
    const result = win("123p456p789s4z", "4z", {
      melds: [["minkan", "1111s"]],
      tsumo: true,
      rinshan: true,
    });
    expect(names(result)).toEqual(["rinshan"]);
  });

  it("海底はツモ、河底はロン", () => {
    expect(names(win(...PLAIN, { tsumo: true, lastTile: true }))).toEqual([
      "haitei",
      "menzenTsumo",
    ]);
    expect(names(win(...PLAIN, { lastTile: true }))).toEqual(["houtei"]);
  });
});

describe("2翻以上の役", () => {
  it("ダブルリーチ", () => {
    const result = win(...PLAIN, { riichi: "doubleRiichi" });
    expect(names(result)).toEqual(["doubleRiichi"]);
    expect(result?.han).toBe(2);
  });

  it("七対子", () => {
    const result = win("1199m2288p3377s4z", "4z");
    expect(names(result)).toEqual(["chiitoitsu"]);
    expect(result?.han).toBe(2);
  });

  it("4枚使いの七対子", () => {
    const result = win("1111m2288p3377s4z", "4z");
    expect(names(result)).toEqual(["chiitoitsu"]);
    expect(result?.han).toBe(2);
  });

  it("対々和", () => {
    const result = win("333s333z4z", "4z", {
      melds: [
        ["pon", "222p"],
        ["pon", "888s"],
      ],
    });
    expect(names(result)).toEqual(["toitoi"]);
    expect(result?.han).toBe(2);
  });

  it("三暗刻", () => {
    expect(names(win("111p333p777s456s4z", "4z"))).toEqual(["sanankou"]);
  });

  it("ロンで完成した刻子は暗刻に数えない", () => {
    expect(win("111p333p77s456s44z", "7s")).toBeNull();
    expect(names(win("111p333p77s456s44z", "7s", { tsumo: true }))).toEqual([
      "menzenTsumo",
      "sanankou",
    ]);
  });

  it("ロン牌を順子で使えるなら刻子は暗刻のまま", () => {
    expect(names(win("111p333p66s678s44z", "6s"))).toEqual(["sanankou"]);
  });

  it("三槓子", () => {
    const result = win("234p4z", "4z", {
      melds: [
        ["ankan", "1111p"],
        ["minkan", "9999s"],
        ["kakan", "3333z"],
      ],
    });
    expect(names(result)).toEqual(["sankantsu"]);
  });

  it("三色同刻（1か9のみ）", () => {
    const result = win("111s456p4z", "4z", {
      melds: [
        ["pon", "111m"],
        ["pon", "111p"],
      ],
    });
    expect(names(result)).toEqual(["sanshokuDoukou"]);
  });

  it("混老頭", () => {
    const result = win("999s333z4z", "4z", {
      melds: [
        ["pon", "111m"],
        ["pon", "999p"],
      ],
    });
    expect(names(result)).toEqual(["honroutou", "toitoi"]);
    expect(result?.han).toBe(4);
  });

  it("七対子の混老頭", () => {
    const result = win("1199m1199p1199s4z", "4z");
    expect(names(result)).toEqual(["chiitoitsu", "honroutou"]);
  });

  it("小三元", () => {
    const result = win("77z123p45s", "6s", {
      melds: [
        ["pon", "555z"],
        ["pon", "666z"],
      ],
    });
    expect(names(result)).toEqual(["haku", "hatsu", "shousangen"]);
    expect(result?.han).toBe(4);
  });

  it("混全帯么九（門前2翻、鳴いて1翻）", () => {
    const closed = win("123p789p123s333z9s", "9s");
    expect(names(closed)).toEqual(["chanta"]);
    expect(closed?.han).toBe(2);
    const open = win("123p789p123s9s", "9s", { melds: [["pon", "333z"]] });
    expect(names(open)).toEqual(["chanta"]);
    expect(open?.han).toBe(1);
  });

  it("純全帯么九（門前3翻、鳴いて2翻）", () => {
    const closed = win("123p789p123s999s1p", "1p");
    expect(names(closed)).toEqual(["junchan"]);
    expect(closed?.han).toBe(3);
    const open = win("123p789p123s1p", "1p", { melds: [["pon", "999s"]] });
    expect(names(open)).toEqual(["junchan"]);
    expect(open?.han).toBe(2);
  });

  it("一気通貫（門前2翻、鳴いて1翻）", () => {
    const closed = win("123456789p234s4z", "4z");
    expect(names(closed)).toEqual(["ittsu"]);
    expect(closed?.han).toBe(2);
    const open = win("123456789p4z", "4z", { melds: [["pon", "222s"]] });
    expect(names(open)).toEqual(["ittsu"]);
    expect(open?.han).toBe(1);
  });

  it("混一色（門前3翻、鳴いて2翻）", () => {
    const closed = win("123p345p678p333z4z", "4z");
    expect(names(closed)).toEqual(["honitsu"]);
    expect(closed?.han).toBe(3);
    const open = win("123p345p678p4z", "4z", { melds: [["pon", "333z"]] });
    expect(names(open)).toEqual(["honitsu"]);
    expect(open?.han).toBe(2);
  });

  it("二盃口（七対子より高い方を取る）", () => {
    const result = win("223344p667788s4z", "4z");
    expect(names(result)).toEqual(["ryanpeikou"]);
    expect(result?.han).toBe(3);
  });

  it("清一色（門前6翻、鳴いて5翻）", () => {
    const closed = win("123p345p678p999p2p", "2p");
    expect(names(closed)).toEqual(["chinitsu"]);
    expect(closed?.han).toBe(6);
    const open = win("123p345p678p2p", "2p", { melds: [["pon", "999p"]] });
    expect(names(open)).toEqual(["chinitsu"]);
    expect(open?.han).toBe(5);
  });
});

describe("ドラ", () => {
  const TANYAO = ["234p456p234s678s", "5s"] as const;

  it("表ドラは表示牌の次の牌", () => {
    const result = win("234p456p234s678s5s", "5s", { dora: "1p4s" });
    expect(result?.dora).toEqual({
      dora: 3,
      ura: 0,
      red: 0,
      gold: 0,
      flower: 0,
    });
    expect(result?.han).toBe(4);
  });

  it("赤と金は1翻ずつ", () => {
    const result = win("234p4r5p6p234s678s5s", "g5s");
    expect(result?.dora).toEqual({
      dora: 0,
      ura: 0,
      red: 1,
      gold: 1,
      flower: 0,
    });
    expect(result?.han).toBe(3);
  });

  it("副露した牌のドラと赤も数える", () => {
    const result = win("234p234s678s8s", "8s", {
      melds: [["pon", "5r5g5p"]],
      dora: "4p",
    });
    expect(result?.dora).toEqual({
      dora: 3,
      ura: 0,
      red: 1,
      gold: 1,
      flower: 0,
    });
  });

  it("抜いた花牌は1枚1翻", () => {
    const result = win(`${TANYAO[0]}5s`, TANYAO[1], { flowers: 3 });
    expect(result?.dora.flower).toBe(3);
    expect(result?.han).toBe(4);
  });

  it("ドラ表示牌が花牌なら、抜いた花牌がドラにもなる", () => {
    const result = win(`${TANYAO[0]}5s`, TANYAO[1], { flowers: 2, dora: "1f" });
    expect(result?.dora).toEqual({
      dora: 2,
      ura: 0,
      red: 0,
      gold: 0,
      flower: 2,
    });
    expect(result?.han).toBe(5);
  });

  it("裏ドラはリーチしたときだけ数える", () => {
    expect(win(`${TANYAO[0]}5s`, TANYAO[1], { ura: "1p" })?.dora.ura).toBe(0);
    const result = win(`${TANYAO[0]}5s`, TANYAO[1], {
      riichi: "riichi",
      ura: "1p",
    });
    expect(result?.dora.ura).toBe(1);
    expect(result?.han).toBe(3);
  });

  it("裏ドラ表示牌が花牌の場合も抜いた花牌に乗る", () => {
    const result = win(`${TANYAO[0]}5s`, TANYAO[1], {
      riichi: "riichi",
      flowers: 1,
      ura: "1f",
    });
    expect(result?.dora).toEqual({
      dora: 0,
      ura: 1,
      red: 0,
      gold: 0,
      flower: 1,
    });
  });

  it("槓ドラは表示牌ごとに数える", () => {
    const result = win(`${TANYAO[0]}5s`, TANYAO[1], { dora: "1p1p" });
    expect(result?.dora.dora).toBe(2);
  });

  it("13翻以上は数え役満（役満の数には入れない）", () => {
    // 清一色6＋断么九1＋リーチ1＋ドラ（表示牌1p×3で2pが3枚×3=9）
    const result = win("222p345p678p345p8p", "8p", {
      riichi: "riichi",
      dora: "1p1p1p",
    });
    expect(result?.han).toBeGreaterThanOrEqual(13);
    expect(result?.yakuman).toBe(0);
  });
});

describe("役満", () => {
  function expectYakuman(result: WinResult | null, expected: string[]): void {
    expect(names(result)).toEqual([...expected].sort());
    expect(result?.yakuman).toBe(expected.length);
  }

  it("国士無双", () => {
    expectYakuman(win("19m19p19s1234567z", "1m"), ["kokushi"]);
  });

  it("四暗刻（ツモ、または単騎のロン）", () => {
    expectYakuman(win("111p333p777s99s44z", "9s", { tsumo: true }), [
      "suuankou",
    ]);
    expectYakuman(win("111p333p777s999s4z", "4z"), ["suuankou"]);
  });

  it("シャンポンのロンは四暗刻にならない", () => {
    const result = win("111p333p777s99s44z", "9s");
    expect(names(result)).toEqual(["sanankou", "toitoi"]);
    expect(result?.yakuman).toBe(0);
  });

  it("大三元", () => {
    const result = win("777z123p4z", "4z", {
      melds: [
        ["pon", "555z"],
        ["pon", "666z"],
      ],
    });
    expectYakuman(result, ["daisangen"]);
  });

  it("小四喜", () => {
    const result = win("333z44z12p", "3p", {
      melds: [
        ["pon", "111z"],
        ["pon", "222z"],
      ],
    });
    expectYakuman(result, ["shousuushii"]);
  });

  it("大四喜", () => {
    const result = win("444z9p", "9p", {
      melds: [
        ["pon", "111z"],
        ["pon", "222z"],
        ["pon", "333z"],
      ],
    });
    expectYakuman(result, ["daisuushii"]);
  });

  it("字一色", () => {
    const result = win("111z444z3z", "3z", {
      melds: [
        ["pon", "555z"],
        ["pon", "666z"],
      ],
    });
    expectYakuman(result, ["tsuuiisou"]);
  });

  it("七対子の字一色", () => {
    expectYakuman(win("1122334455667z", "7z"), ["tsuuiisou"]);
  });

  it("清老頭", () => {
    const result = win("111s999s1p", "1p", {
      melds: [
        ["pon", "111m"],
        ["pon", "999p"],
      ],
    });
    expectYakuman(result, ["chinroutou"]);
  });

  it("緑一色", () => {
    expectYakuman(win("223344s666s888s6z", "6z"), ["ryuuiisou"]);
  });

  it("九蓮宝燈", () => {
    expectYakuman(win("1112345678999p", "5p"), ["chuuren"]);
    expectYakuman(win("1112345678999s", "9s"), ["chuuren"]);
  });

  it("四槓子", () => {
    const result = win("3z", "3z", {
      melds: [
        ["minkan", "2222p"],
        ["minkan", "8888s"],
        ["kakan", "4444z"],
        ["minkan", "3333p"],
      ],
    });
    expectYakuman(result, ["suukantsu"]);
  });

  it("天和は親の第一ツモ、地和は子の第一ツモ", () => {
    expectYakuman(
      win(...PLAIN, { tsumo: true, firstTurn: true, seatWind: "1z" }),
      ["tenhou"],
    );
    expectYakuman(win(...PLAIN, { tsumo: true, firstTurn: true }), ["chiihou"]);
  });

  it("人和はない", () => {
    expect(win(...PLAIN, { firstTurn: true })).toBeNull();
  });

  it("役満は複合する", () => {
    expectYakuman(win("111z222z555z666z7z", "7z", { tsumo: true }), [
      "suuankou",
      "tsuuiisou",
    ]);
    const result = win("444z5z", "5z", {
      melds: [
        ["pon", "111z"],
        ["pon", "222z"],
        ["pon", "333z"],
      ],
    });
    expectYakuman(result, ["daisuushii", "tsuuiisou"]);
  });

  it("役満のときも赤、金、裏ドラの枚数は数える", () => {
    const result = win("111p333p777sr5sg5s5s4z", "4z", {
      riichi: "riichi",
      ura: "2p",
    });
    expect(result?.yakuman).toBe(1);
    expect(result?.dora).toEqual({
      dora: 0,
      ura: 3,
      red: 1,
      gold: 1,
      flower: 0,
    });
  });
});

describe("追加役満", () => {
  it("萬子の混一色（鳴いても役満）", () => {
    const result = win("999m333z5z", "5z", {
      melds: [
        ["pon", "111m"],
        ["pon", "444z"],
      ],
    });
    expect(names(result)).toEqual(["manzuHonitsu"]);
    expect(result?.yakuman).toBe(1);
  });

  it("七対子でも萬子の混一色", () => {
    const result = win("1199m11223344z5z", "5z");
    expect(names(result)).toEqual(["manzuHonitsu"]);
    expect(result?.yakuman).toBe(1);
  });

  it("萬子があっても筒子や索子が混ざれば役満ではない", () => {
    const result = win("999m999s9p", "9p", {
      melds: [
        ["pon", "111m"],
        ["pon", "333z"],
      ],
    });
    expect(result?.yakuman).toBe(0);
    expect(names(result)).toEqual(["honroutou", "toitoi"]);
  });

  it("清一色七対子", () => {
    const result = win("1122446677889p", "9p");
    expect(names(result)).toEqual(["chinitsuChiitoitsu"]);
    expect(result?.yakuman).toBe(1);
  });

  it("二盃口の形でも清一色七対子として役満", () => {
    const result = win("112233446677p8p", "8p");
    expect(names(result)).toEqual(["chinitsuChiitoitsu"]);
    expect(result?.yakuman).toBe(1);
  });

  it("4枚使いでも清一色七対子として役満", () => {
    const result = win("1111224466778p", "8p");
    expect(names(result)).toEqual(["chinitsuChiitoitsu"]);
    expect(result?.yakuman).toBe(1);
  });

  it("字牌が混ざった七対子は役満ではない", () => {
    const result = win("11224466778p44z", "8p");
    expect(result?.yakuman).toBe(0);
    expect(names(result)).toEqual(["chiitoitsu", "honitsu"]);
  });

  describe("リーチのみ", () => {
    it("リーチ以外の役もドラもないロンは役満", () => {
      const result = win(...PLAIN, { riichi: "riichi", dora: "1z", ura: "1z" });
      expect(names(result)).toEqual(["riichiOnly"]);
      expect(result?.yakuman).toBe(1);
    });

    it.each<[string, Options]>([
      ["ツモ", { tsumo: true }],
      ["一発", { ippatsu: true }],
      ["河底", { lastTile: true }],
      ["表ドラ", { dora: "3z" }],
      ["裏ドラ", { ura: "3z" }],
      ["花牌", { flowers: 1 }],
    ])("%s が付いたら不成立", (_, options) => {
      const result = win(...PLAIN, { riichi: "riichi", ...options });
      expect(result?.yakuman).toBe(0);
      expect(names(result)).toContain("riichi");
    });

    it("オープンリーチは不成立", () => {
      const result = win(...PLAIN, { riichi: "riichi", openRiichi: true });
      expect(result?.yakuman).toBe(0);
      expect(result?.han).toBe(2);
    });

    it("ダブルリーチは不成立", () => {
      const result = win(...PLAIN, { riichi: "doubleRiichi" });
      expect(result?.yakuman).toBe(0);
    });

    it("赤や金があれば不成立", () => {
      const result = win("123p4r5p6p789s111s4z", "4z", { riichi: "riichi" });
      expect(result?.yakuman).toBe(0);
      expect(result?.han).toBe(2);
    });
  });
});
