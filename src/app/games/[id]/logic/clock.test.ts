import { describe, expect, it } from "vitest";
import { seedOf } from "@/engine/testing";
import { buildView, startTable } from "@/server/table";
import type { PlayerView } from "@/server/table";
import {
  clockDisplay,
  estimateOffset,
  tickDelayMs,
  withClockFields,
} from "./clock";

describe("withClockFields（古い画面データの補完）", () => {
  const view = buildView(startTable({ seed: seedOf(1) }).table, 0);

  it("持ち時間の項目がない画面データには、期限なし・自動なしを補う", () => {
    const legacy: Partial<PlayerView> = { ...view };
    delete legacy.deadline;
    delete legacy.myDeadline;
    delete legacy.startedAt;
    delete legacy.serverNow;
    delete legacy.bank;
    delete legacy.auto;
    delete legacy.canThink;
    delete legacy.thinking;
    expect(withClockFields(legacy as PlayerView)).toEqual({
      ...view,
      deadline: null,
      myDeadline: null,
      startedAt: null,
      serverNow: 0,
      bank: 0,
      auto: [false, false, false],
      canThink: false,
      thinking: false,
    });
  });

  it("席ごとの期限がない画面データでは、自分が待たれていれば共通の期限を自分の期限にする", () => {
    const legacy: Partial<PlayerView> = { ...view, deadline: 9_000 };
    delete legacy.myDeadline;
    delete legacy.startedAt;
    expect(view.actions.length).toBeGreaterThan(0);
    expect(withClockFields(legacy as PlayerView).myDeadline).toBe(9_000);
    const other = buildView(startTable({ seed: seedOf(1) }).table, 1);
    const legacyOther: Partial<PlayerView> = { ...other, deadline: 9_000 };
    delete legacyOther.myDeadline;
    expect(withClockFields(legacyOther as PlayerView).myDeadline).toBeNull();
  });

  it("項目があれば変えない", () => {
    const timed: PlayerView = {
      ...view,
      deadline: 9_000,
      myDeadline: 9_000,
      startedAt: 4_000,
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

describe("clockDisplay（残り時間の表示）", () => {
  const base = (seconds: number) => ({ seconds, stage: "base" });
  const think = (seconds: number) => ({ seconds, stage: "think" });
  const reserve = (seconds: number) => ({ seconds, stage: "reserve" });

  it("基本の時間が残っている間は 5→1 と数える", () => {
    expect(clockDisplay(25_000, 20_000)).toEqual(base(5));
    expect(clockDisplay(22_400, 20_000)).toEqual(base(3));
    expect(clockDisplay(20_001, 20_000)).toEqual(base(1));
    // 最初の手番は基本の時間に10秒足してある
    expect(clockDisplay(35_000, 20_000)).toEqual(base(15));
  });

  it("基本の時間が切れたら、長考として持ち時間を 20→ と数える", () => {
    expect(clockDisplay(20_000, 20_000)).toEqual(reserve(20));
    expect(clockDisplay(19_000, 20_000)).toEqual(reserve(19));
    expect(clockDisplay(11_200, 17_000)).toEqual(reserve(12));
  });

  it("持ち時間がなければ、基本の5秒だけを数える", () => {
    expect(clockDisplay(3_000, 0)).toEqual(base(3));
  });

  it("サイコロの指定と局の結果は残り秒数だけ。0より小さくはしない", () => {
    expect(clockDisplay(14_100, null)).toEqual(base(15));
    expect(clockDisplay(-800, null)).toEqual(base(0));
    expect(clockDisplay(-800, 20_000)).toEqual(reserve(0));
  });

  it("長考ボタンを押したら、30秒を 30→ と数え、切れたら持ち時間を数える", () => {
    expect(clockDisplay(50_000, 20_000, true)).toEqual(think(30));
    expect(clockDisplay(20_001, 20_000, true)).toEqual(think(1));
    expect(clockDisplay(20_000, 20_000, true)).toEqual(reserve(20));
    expect(clockDisplay(30_000, 0, true)).toEqual(think(30));
  });

  it("残り時間は期限とサーバー時刻の差だけで決まり、開き直しても戻らない", () => {
    const deadline = 100_000;
    // 待ちの開始から10秒後に開いた画面も、ずっと開いていた画面も同じ表示になる
    const serverNow = 90_000;
    expect(clockDisplay(deadline - serverNow, 17_000)).toEqual(reserve(10));
  });
});

describe("tickDelayMs（申告までの間）", () => {
  it("3人が同時に送らないよう、席でずらす", () => {
    expect([tickDelayMs(0), tickDelayMs(1), tickDelayMs(2)]).toEqual([
      300, 500, 700,
    ]);
  });
});
