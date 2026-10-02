import { describe, expect, it } from "vitest";
import { isCronAuthorized } from "./cron-rules";

describe("isCronAuthorized（定期実行の秘密の値）", () => {
  it("Bearer の値が一致すれば通す", () => {
    expect(isCronAuthorized("Bearer s3cret", "s3cret")).toBe(true);
  });

  it("値が違う、形が違う、ヘッダーがないときは通さない", () => {
    expect(isCronAuthorized("Bearer wrong!", "s3cret")).toBe(false);
    expect(isCronAuthorized("Bearer s3cret-and-more", "s3cret")).toBe(false);
    expect(isCronAuthorized("s3cret", "s3cret")).toBe(false);
    expect(isCronAuthorized(null, "s3cret")).toBe(false);
  });

  it("秘密の値が設定されていなければ、誰も通さない", () => {
    expect(isCronAuthorized("Bearer ", null)).toBe(false);
    expect(isCronAuthorized("Bearer ", "")).toBe(false);
    expect(isCronAuthorized(null, null)).toBe(false);
  });
});
