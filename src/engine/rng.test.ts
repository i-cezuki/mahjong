import { describe, expect, it } from "vitest";
import { chacha20Block, createRng, shuffle } from "./rng";

const SEED_A = "00".repeat(32);
const SEED_B = "01" + "00".repeat(31);

describe("ChaCha20", () => {
  it("RFC 8439 2.3.2 のテストベクタと一致する", () => {
    const key = Uint32Array.from([
      0x03020100, 0x07060504, 0x0b0a0908, 0x0f0e0d0c, 0x13121110, 0x17161514,
      0x1b1a1918, 0x1f1e1d1c,
    ]);
    const nonce = Uint32Array.from([0x09000000, 0x4a000000, 0x00000000]);
    expect([...chacha20Block(key, 1, nonce)]).toEqual([
      0xe4e7f110, 0x15593bd1, 0x1fdd0f50, 0xc47120a3, 0xc7f4d1c7, 0x0368c033,
      0x9aaa2204, 0x4e6cd4c3, 0x466482d2, 0x09aa9f07, 0x05d7c214, 0xa2028bd9,
      0xd19c12b5, 0xb94e16de, 0xe883d0cb, 0x4e3c50a2,
    ]);
  });
});

describe("createRng", () => {
  function take(seed: string, count: number, stream?: number): number[] {
    const rng = createRng(seed, stream);
    return Array.from({ length: count }, () => rng.nextUint32());
  }

  it("同じ種なら同じ列になる", () => {
    expect(take(SEED_A, 40)).toEqual(take(SEED_A, 40));
  });

  it("種が違えば列が変わる", () => {
    expect(take(SEED_A, 8)).not.toEqual(take(SEED_B, 8));
  });

  it("同じ種でもストリーム番号が違えば列が変わる", () => {
    expect(take(SEED_A, 8, 0)).not.toEqual(take(SEED_A, 8, 1));
  });

  it("64桁の16進数でない種は拒否する", () => {
    expect(() => createRng("abc")).toThrow();
    expect(() => createRng("zz".repeat(32))).toThrow();
  });

  it("nextInt は 0 以上 n 未満で、偏りがない", () => {
    const rng = createRng(SEED_A);
    const counts = [0, 0, 0];
    for (let i = 0; i < 30000; i++) {
      const value = rng.nextInt(3);
      counts[value] = (counts[value] ?? 0) + 1;
    }
    expect(counts).toHaveLength(3);
    for (const count of counts) {
      expect(count).toBeGreaterThan(9500);
      expect(count).toBeLessThan(10500);
    }
  });

  it("nextInt は正の整数以外を拒否する", () => {
    const rng = createRng(SEED_A);
    expect(() => rng.nextInt(0)).toThrow();
    expect(() => rng.nextInt(1.5)).toThrow();
  });
});

describe("shuffle", () => {
  const items = Array.from({ length: 112 }, (_, i) => i);

  it("並べ替えるだけで要素は増減しない", () => {
    const shuffled = shuffle(items, createRng(SEED_A));
    expect(shuffled).not.toEqual(items);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
  });

  it("元の配列を書き換えない", () => {
    const copy = [...items];
    shuffle(copy, createRng(SEED_A));
    expect(copy).toEqual(items);
  });

  it("同じ種なら同じ並びになる", () => {
    expect(shuffle(items, createRng(SEED_B))).toEqual(
      shuffle(items, createRng(SEED_B)),
    );
  });
});
