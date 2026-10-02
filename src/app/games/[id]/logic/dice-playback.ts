export type DiceOutcome = "hit" | "miss" | "double";

/** サイコロ1回分の再生内容 */
export interface DiceStep {
  roll: [number, number];
  outcome: DiceOutcome;
  /** 何回目か（1〜4）。ゾロ目は振り直す回の番号。 */
  attempt: number;
  /** この回までの当たりの回数 */
  hits: number;
}

/** 1回のチャンスで振る回数（ゾロ目を除く） */
export const DICE_ATTEMPTS = 4;

/** サーバーが振った出目の並びを、1回ずつ見せる手順に変える。 */
export function diceSteps(
  faces: readonly [number, number],
  rolls: readonly (readonly [number, number])[],
): DiceStep[] {
  const steps: DiceStep[] = [];
  let attempt = 1;
  let hits = 0;
  for (const [a, b] of rolls) {
    if (a === b) {
      steps.push({ roll: [a, b], outcome: "double", attempt, hits });
      continue;
    }
    const hit =
      (a === faces[0] && b === faces[1]) || (a === faces[1] && b === faces[0]);
    if (hit) hits++;
    steps.push({ roll: [a, b], outcome: hit ? "hit" : "miss", attempt, hits });
    attempt++;
  }
  return steps;
}
