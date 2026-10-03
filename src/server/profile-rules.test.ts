import { describe, expect, it } from "vitest";
import {
  isAdminEmail,
  parseDisplayName,
  parseRonPhrase,
} from "./profile-rules";

describe("parseDisplayName（表示名の検証）", () => {
  it("前後の空白を取り除いて受け付ける", () => {
    expect(parseDisplayName("  たろう ")).toEqual({ ok: true, name: "たろう" });
  });

  it("全角と半角の違いをそろえる", () => {
    expect(parseDisplayName("ＡＢＣ１２３")).toEqual({
      ok: true,
      name: "ABC123",
    });
  });

  it("12文字まで。絵文字も1文字として数える", () => {
    expect(parseDisplayName("あ".repeat(12)).ok).toBe(true);
    expect(parseDisplayName("あ".repeat(13)).ok).toBe(false);
    expect(parseDisplayName("🀄".repeat(12)).ok).toBe(true);
  });

  it("空や空白だけは受け付けない", () => {
    expect(parseDisplayName("").ok).toBe(false);
    expect(parseDisplayName("   ").ok).toBe(false);
  });

  it("改行や制御文字は受け付けない", () => {
    expect(parseDisplayName("たろ\nう").ok).toBe(false);
    expect(parseDisplayName("たろ\u0000う").ok).toBe(false);
  });

  it("文字列以外は受け付けない", () => {
    expect(parseDisplayName(null).ok).toBe(false);
    expect(parseDisplayName(undefined).ok).toBe(false);
  });

  it("断るときは理由を返す", () => {
    const result = parseDisplayName("あ".repeat(13));
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });
});

describe("isAdminEmail（管理者の判定）", () => {
  it("大文字小文字と前後の空白を無視して比べる", () => {
    expect(isAdminEmail("Admin@Example.com", " admin@example.com ")).toBe(true);
  });

  it("違うアドレスは管理者ではない", () => {
    expect(isAdminEmail("other@example.com", "admin@example.com")).toBe(false);
  });

  it("どちらかが未設定なら管理者ではない", () => {
    expect(isAdminEmail(undefined, "admin@example.com")).toBe(false);
    expect(isAdminEmail("admin@example.com", undefined)).toBe(false);
    expect(isAdminEmail("", "")).toBe(false);
  });
});

describe("parseRonPhrase（ロンの決めゼリフの検証）", () => {
  it("前後の空白を取り除き、全角と半角をそろえて受け付ける", () => {
    expect(parseRonPhrase(" それだ！ ")).toEqual({
      ok: true,
      phrase: "それだ!",
    });
  });

  it("空や空白だけは、設定なし（ロンに戻す）として受け付ける", () => {
    expect(parseRonPhrase("")).toEqual({ ok: true, phrase: null });
    expect(parseRonPhrase("   ")).toEqual({ ok: true, phrase: null });
    expect(parseRonPhrase(null)).toEqual({ ok: true, phrase: null });
  });

  it("8文字まで。絵文字も1文字として数える", () => {
    expect(parseRonPhrase("あ".repeat(8)).ok).toBe(true);
    expect(parseRonPhrase("あ".repeat(9)).ok).toBe(false);
    expect(parseRonPhrase("🀄".repeat(8)).ok).toBe(true);
  });

  it("改行や制御文字は受け付けない", () => {
    expect(parseRonPhrase("ロ\nン").ok).toBe(false);
  });
});
