"use client";

import { useEffect, useState } from "react";
import type { DiceResult, PlayerView, TableAction } from "@/server/table";
import type { ActionMenu } from "../logic/actions";
import { DICE_ATTEMPTS, diceSteps } from "../logic/dice-playback";
import type { DicePlayback } from "./use-dice-playback";

/** 3×3 のマス目のうち、点を打つ場所 */
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Die({
  face,
  size,
  shaking = false,
}: {
  face: number;
  size: number;
  shaking?: boolean;
}) {
  const pips = PIPS[face] ?? [];
  return (
    <span
      role="img"
      aria-label={`${face}`}
      className={`grid grid-cols-3 grid-rows-3 rounded-[18%] bg-white shadow ${
        shaking ? "dice-shake" : ""
      }`}
      style={{ width: size, height: size, padding: size * 0.14 }}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className="flex items-center justify-center">
          {pips.includes(i) && (
            <span
              className={`rounded-full ${face === 1 ? "bg-red-600" : "bg-slate-900"}`}
              style={{ width: size * 0.17, height: size * 0.17 }}
            />
          )}
        </span>
      ))}
    </span>
  );
}

const randomFace = () => 1 + Math.floor(Math.random() * 6);

/** 転がっている間、目をでたらめに変え続ける2個のサイコロ */
function RollingDice({ size }: { size: number }) {
  const [faces, setFaces] = useState<[number, number]>([1, 6]);
  useEffect(() => {
    const timer = setInterval(() => setFaces([randomFace(), randomFace()]), 80);
    return () => clearInterval(timer);
  }, []);
  return (
    <>
      <Die face={faces[0]} size={size} shaking />
      <Die face={faces[1]} size={size} shaking />
    </>
  );
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** 再生中のチャンス。1回ずつ転がして、当たり外れを見せる。 */
function Playing({
  result,
  playback,
  name,
}: {
  result: DiceResult;
  playback: DicePlayback;
  name: string;
}) {
  const steps = diceSteps(result.faces, result.rolls);
  const step = steps[playback.step]!;
  const stopped = !playback.rolling;
  // 止まるまでは、この回の結果を数に入れない
  const hits = stopped ? step.hits : (steps[playback.step - 1]?.hits ?? 0);
  // 指定した人が当たり1回で受け取る枚数（逆ポッチでは払うのでマイナス）
  const perHit =
    result.hits > 0 ? result.chipDeltas[result.seat] / result.hits : 0;

  return (
    <div className="flex flex-col items-center gap-2 rounded border border-amber-300/70 bg-amber-500/10 p-3">
      <p className="flex items-center gap-2 text-sm">
        {name}のサイコロチャンス　指定
        <Die face={result.faces[0]} size={22} />
        <Die face={result.faces[1]} size={22} />
      </p>
      <p className="text-sm opacity-80">
        {step.attempt} / {DICE_ATTEMPTS} 回目　当たり {hits}回
      </p>
      <div className="flex h-16 items-center gap-4">
        {stopped ? (
          <>
            <Die face={step.roll[0]} size={60} />
            <Die face={step.roll[1]} size={60} />
          </>
        ) : (
          <RollingDice size={60} />
        )}
      </div>
      <p className="h-8 text-2xl font-bold">
        {stopped &&
          (step.outcome === "hit" ? (
            <span className="text-amber-300">当たり！ {signed(perHit)}枚</span>
          ) : step.outcome === "double" ? (
            <span className="text-cyan-300">ゾロ目　もう1回</span>
          ) : (
            <span className="opacity-60">外れ</span>
          ))}
      </p>
    </div>
  );
}

/** 局の結果の中のサイコロチャンス。再生済みの結果、再生中、出目の指定を出す。 */
export function DiceSection({
  view,
  names,
  menu,
  playback,
  busy,
  send,
}: {
  view: PlayerView;
  names: string[];
  menu: ActionMenu;
  playback: DicePlayback;
  busy: boolean;
  send: (action: TableAction) => void;
}) {
  const playing = playback.index !== null ? view.dice[playback.index] : null;
  const chance = view.diceChance;

  return (
    <>
      {view.dice.slice(0, playback.done).map((result, i) => (
        <p key={i} className="flex flex-wrap items-center gap-x-2 text-sm">
          サイコロ（{names[result.seat]}が
          <Die face={result.faces[0]} size={18} />
          <Die face={result.faces[1]} size={18} />
          を指定）：当たり {result.hits}回
          {result.hits > 0 &&
            `　祝儀 ${names
              .map((n, seat) => `${n} ${signed(result.chipDeltas[seat]!)}`)
              .join("　")}`}
        </p>
      ))}

      {playing && (
        <Playing
          result={playing}
          playback={playback}
          name={names[playing.seat]!}
        />
      )}

      {!playing && chance && menu.dice.length > 0 && (
        <div className="flex flex-col items-center gap-2 rounded border border-amber-300/70 bg-amber-500/10 p-3">
          <p className="text-sm">
            サイコロチャンス：当てる出目を選んでください（残り
            {chance.remaining}回）
          </p>
          <div className="grid grid-cols-5 gap-2">
            {menu.dice.map((action) => (
              <button
                key={action.faces.join("-")}
                type="button"
                disabled={busy}
                onClick={() => send(action)}
                className="flex gap-1 rounded border border-amber-300/60 bg-background/60 p-1.5 hover:bg-amber-400/20 disabled:opacity-50"
              >
                <Die face={action.faces[0]} size={30} />
                <Die face={action.faces[1]} size={30} />
              </button>
            ))}
          </div>
        </div>
      )}

      {!playing && chance && menu.dice.length === 0 && (
        <p className="text-sm text-amber-200">
          {names[chance.seat]}がサイコロの出目を選んでいます
        </p>
      )}
    </>
  );
}
