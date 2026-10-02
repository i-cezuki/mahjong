import { createRng } from "./rng";

const ROLLS_PER_CHANCE = 4;
/** 牌山（ストリーム0）と重ならないよう、サイコロは1番以降を使う */
const DICE_STREAM_BASE = 1;

function isValidFaces(faces: readonly [number, number]): boolean {
  return (
    faces.every((face) => Number.isInteger(face) && face >= 1 && face <= 6) &&
    faces[0] !== faces[1]
  );
}

/** ゾロ目以外の出目の組（順不同）。15通り。 */
export function diceFaceChoices(): [number, number][] {
  const result: [number, number][] = [];
  for (let a = 1; a <= 6; a++) {
    for (let b = a + 1; b <= 6; b++) result.push([a, b]);
  }
  return result;
}

/**
 * サイコロチャンス1回分を振る。2個のサイコロを4回振り、ゾロ目は回数に数えない。
 * @param index その局で何回目のチャンスか（0始まり）
 */
export function rollDiceChance(
  seed: string,
  index: number,
  faces: readonly [number, number],
): { rolls: [number, number][]; hits: number } {
  if (!isValidFaces(faces)) {
    throw new RangeError(`出目の指定が不正です: ${faces.join(",")}`);
  }
  const rng = createRng(seed, DICE_STREAM_BASE + index);
  const rolls: [number, number][] = [];
  let counted = 0;
  let hits = 0;
  while (counted < ROLLS_PER_CHANCE) {
    const a = rng.nextInt(6) + 1;
    const b = rng.nextInt(6) + 1;
    rolls.push([a, b]);
    if (a === b) continue;
    counted++;
    if (
      (a === faces[0] && b === faces[1]) ||
      (a === faces[1] && b === faces[0])
    ) {
      hits++;
    }
  }
  return { rolls, hits };
}
