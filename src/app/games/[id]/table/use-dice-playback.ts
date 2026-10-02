"use client";

import { useEffect, useState } from "react";
import { DICE_ROLL_MS, DICE_SHOW_MS } from "@/lib/timing";
import type { DiceResult } from "@/server/table";

export interface DicePlayback {
  /** 再生中のチャンス（dice の添字）。再生していなければ null */
  index: number | null;
  /** 再生中のチャンスで、いま見せている回（diceSteps の添字） */
  step: number;
  /** 転がっている最中か、止まって結果を見せているか */
  rolling: boolean;
  /** 再生が終わった（または再生しない）チャンスの数 */
  done: number;
}

/**
 * 届いたサイコロの結果を、1回ずつ順番に見せる。
 * @param shown 画面を開いた時点ですでに届いていた結果の数。これは再生しない。
 */
export function useDicePlayback(
  dice: readonly DiceResult[],
  shown: number,
): DicePlayback {
  const [position, setPosition] = useState({
    done: shown,
    step: 0,
    rolling: true,
  });
  const current = dice[position.done];
  const steps = current ? current.rolls.length : 0;

  useEffect(() => {
    if (steps === 0) return;
    const timer = setTimeout(
      () =>
        setPosition((p) => {
          if (p.rolling) return { ...p, rolling: false };
          if (p.step + 1 < steps) {
            return { done: p.done, step: p.step + 1, rolling: true };
          }
          return { done: p.done + 1, step: 0, rolling: true };
        }),
      position.rolling ? DICE_ROLL_MS : DICE_SHOW_MS,
    );
    return () => clearTimeout(timer);
  }, [position, steps]);

  return {
    index: current ? position.done : null,
    step: position.step,
    rolling: position.rolling,
    done: Math.min(position.done, dice.length),
  };
}
