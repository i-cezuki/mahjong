import { describe, expect, it } from "vitest";
import { seedOf } from "@/engine/testing";
import { buildView, startTable } from "@/server/table";
import type { PlayerView } from "@/server/table";
import {
  clockLabel,
  estimateOffset,
  tickDelayMs,
  withClockFields,
} from "./clock";

describe("withClockFields（古い画面データの補完）", () => {
  const view = buildView(startTable({ seed: seedOf(1) }).table, 0);

  it("持ち時間の項目がない画面データには、期限なし・自動なしを補う", () => {
    const legacy: Partial<PlayerView> = { ...view };
    delete legacy.deadline;
    delete legacy.serverNow;
    delete legacy.bank;
    delete legacy.auto;
    expect(withClockFields(legacy as PlayerView)).toEqual({
      ...view,
      deadline: null,
      serverNow: 0,
      bank: 0,
      auto: [false, false, false],
    });
  });

  it("項目があれば変えない", () => {
    const timed: PlayerView = {
      ...view,
      deadline: 9_000,
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

describe("clockLabel（残り時間の表示）", () => {
  it("手番では、基本の時間が残っている間はその秒数を出す", () => {
    expect(clockLabel(25_000, 20_000)).toBe("5");
    expect(clockLabel(20_001, 20_000)).toBe("1");
    expect(clockLabel(35_000, 20_000)).toBe("15");
  });

  it("基本の時間が切れたら、持ち時間を + を付けて出す", () => {
    expect(clockLabel(20_000, 20_000)).toBe("+20");
    expect(clockLabel(11_200, 20_000)).toBe("+12");
    expect(clockLabel(3_000, 0)).toBe("3");
  });

  it("手番以外は残り秒数だけ。0より小さくはしない", () => {
    expect(clockLabel(14_100, null)).toBe("15");
    expect(clockLabel(-800, null)).toBe("0");
    expect(clockLabel(-800, 20_000)).toBe("+0");
  });
});

describe("tickDelayMs（申告までの間）", () => {
  it("3人が同時に送らないよう、席でずらす", () => {
    expect([tickDelayMs(0), tickDelayMs(1), tickDelayMs(2)]).toEqual([
      300, 500, 700,
    ]);
  });
});
