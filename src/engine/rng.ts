/**
 * 種から決まる乱数。ChaCha20 の鍵ストリームをそのまま使う。
 * 見えている牌から残りの山を推測されないよう、暗号学的な生成器にしている。
 */
export interface Rng {
  /** 0 以上 2^32 未満の整数 */
  nextUint32(): number;
  /** 0 以上 n 未満の整数（偏りなし） */
  nextInt(n: number): number;
}

const SIGMA = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574] as const;

function rotl(value: number, bits: number): number {
  return (value << bits) | (value >>> (32 - bits));
}

function quarterRound(
  x: Uint32Array,
  a: number,
  b: number,
  c: number,
  d: number,
): void {
  x[a] = x[a]! + x[b]!;
  x[d] = rotl(x[d]! ^ x[a]!, 16);
  x[c] = x[c]! + x[d]!;
  x[b] = rotl(x[b]! ^ x[c]!, 12);
  x[a] = x[a]! + x[b]!;
  x[d] = rotl(x[d]! ^ x[a]!, 8);
  x[c] = x[c]! + x[d]!;
  x[b] = rotl(x[b]! ^ x[c]!, 7);
}

/** ChaCha20 の1ブロック（RFC 8439）。鍵は8ワード、ノンスは3ワード。 */
export function chacha20Block(
  key: Uint32Array,
  counter: number,
  nonce: Uint32Array,
): Uint32Array {
  const initial = Uint32Array.from([...SIGMA, ...key, counter, ...nonce]);
  const x = Uint32Array.from(initial);
  for (let round = 0; round < 10; round++) {
    quarterRound(x, 0, 4, 8, 12);
    quarterRound(x, 1, 5, 9, 13);
    quarterRound(x, 2, 6, 10, 14);
    quarterRound(x, 3, 7, 11, 15);
    quarterRound(x, 0, 5, 10, 15);
    quarterRound(x, 1, 6, 11, 12);
    quarterRound(x, 2, 7, 8, 13);
    quarterRound(x, 3, 4, 9, 14);
  }
  for (let i = 0; i < 16; i++) x[i] = x[i]! + initial[i]!;
  return x;
}

function keyFromSeed(seed: string): Uint32Array {
  if (!/^[0-9a-f]{64}$/i.test(seed)) {
    throw new Error("種は64桁の16進数で指定してください");
  }
  const key = new Uint32Array(8);
  for (let i = 0; i < 32; i++) {
    const byte = parseInt(seed.slice(i * 2, i * 2 + 2), 16);
    key[i >>> 2] = key[i >>> 2]! | (byte << ((i & 3) * 8));
  }
  return key;
}

/**
 * @param seed 64桁の16進数（32バイト）
 * @param stream 同じ種から独立した列を取り出すための番号（牌山とサイコロなど）
 */
export function createRng(seed: string, stream = 0): Rng {
  const key = keyFromSeed(seed);
  const nonce = Uint32Array.from([stream, 0, 0]);
  let counter = 0;
  let block: Uint32Array = new Uint32Array(0);
  let position = 0;

  function nextUint32(): number {
    if (position >= block.length) {
      block = chacha20Block(key, counter++, nonce);
      position = 0;
    }
    return block[position++]!;
  }

  function nextInt(n: number): number {
    if (!Number.isInteger(n) || n <= 0 || n > 2 ** 32) {
      throw new RangeError(`nextInt の引数が不正です: ${n}`);
    }
    // 剰余の偏りを避けるため、端数になる範囲の値は捨てて引き直す
    const limit = 2 ** 32 - (2 ** 32 % n);
    for (;;) {
      const value = nextUint32();
      if (value < limit) return value % n;
    }
  }

  return { nextUint32, nextInt };
}

/** Fisher–Yates。新しい配列を返す。 */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
