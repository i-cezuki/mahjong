/** 見間違えやすい文字（0とO、1とIとL）を除いた31文字 */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;
const CODE_PATTERN = /^[A-Z0-9]{6}$/;

/**
 * ルームコードを作る。
 * @param randomInt 0以上 max 未満の整数を返す乱数
 */
export function generateRoomCode(randomInt: (max: number) => number): string {
  return Array.from(
    { length: ROOM_CODE_LENGTH },
    () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]!,
  ).join("");
}

/** 入力されたルームコードを整える。形がおかしければ null。 */
export function parseRoomCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.normalize("NFKC").replace(/\s/g, "").toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(input: unknown): input is string {
  return typeof input === "string" && UUID_PATTERN.test(input);
}

/** 並び順をかき混ぜた新しい配列を返す。席順を決めるのに使う。 */
export function shuffled<T>(
  items: readonly T[],
  randomInt: (max: number) => number,
): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
