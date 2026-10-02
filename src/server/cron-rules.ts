import { timingSafeEqual } from "node:crypto";

/**
 * 定期実行の要求に付いてきた Authorization ヘッダーを確かめる。
 * 秘密の値が設定されていなければ、誰も通さない。
 */
export function isCronAuthorized(
  header: string | null,
  secret: string | null,
): boolean {
  if (!secret || header === null) return false;
  const given = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
