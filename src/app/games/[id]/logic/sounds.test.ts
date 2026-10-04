import { describe, expect, it } from "vitest";
import { seedOf } from "@/engine/testing";
import { buildView, startTable } from "@/server/table";
import type { PlayerView } from "@/server/table";
import { detectSound } from "./sounds";

const base = buildView(startTable({ seed: seedOf(1) }).table, 0);

/** 席1の河に1枚足した画面データ */
const discarded = (view: PlayerView): PlayerView => ({
  ...view,
  rivers: [view.rivers[0], [{ tile: 0, tsumogiri: false }], view.rivers[2]],
});

describe("detectSound（鳴らす音）", () => {
  it("何も変わらなければ鳴らさない", () => {
    expect(detectSound(base, base)).toBeNull();
  });

  it("誰かの河が増えたら打牌の音", () => {
    expect(detectSound(base, discarded(base))).toBe("discard");
  });

  it("リーチの宣言は、打牌の音の代わりにリーチの音", () => {
    const after = discarded(base);
    expect(
      detectSound(base, {
        ...after,
        riichi: [null, { doubleStake: true }, null],
      }),
    ).toBe("riichi");
  });

  it("鳴きはポンとカンで分ける", () => {
    const meld = (type: "pon" | "daiminkan") => ({
      ...base,
      melds: [[], [{ type, tiles: [0, 1, 2], from: 0 as const }], []],
    }) as unknown as PlayerView;
    expect(detectSound(base, meld("pon"))).toBe("pon");
    expect(detectSound(base, meld("daiminkan"))).toBe("kan");
  });

  it("宣言牌でのロンは、リーチよりロンを鳴らす", () => {
    const declared = discarded(base);
    const after = {
      ...declared,
      riichi: [null, { doubleStake: false }, null],
      outcome: { wins: [{ seat: 0, kind: "ron", result: null }] },
    } as unknown as PlayerView;
    expect(detectSound(base, after)).toBe("ron");
  });

  it("ツモ和了とポッチはツモの音", () => {
    const won = (kind: string) =>
      ({
        ...base,
        outcome: { wins: [{ seat: 0, kind, result: { yaku: [] } }] },
      }) as unknown as PlayerView;
    expect(detectSound(base, won("tsumo"))).toBe("tsumo");
    expect(detectSound(base, won("pocchi"))).toBe("tsumo");
  });

  it("局が変わったときは鳴らさない", () => {
    expect(
      detectSound(base, { ...discarded(base), roundIndex: base.roundIndex + 1 }),
    ).toBeNull();
  });
});
