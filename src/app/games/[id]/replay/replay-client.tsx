"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { displayHand } from "@/components/hand-order";
import { roundLabel } from "@/components/labels";
import type { Seat } from "@/engine";
import type { TableEvent } from "@/server/table";
import { buildMenu } from "../logic/actions";
import { buildReplay, captionText, frameView } from "../logic/replay";
import { seatLayout } from "../logic/seats";
import { CenterPanel } from "../table/center-panel";
import { GameResult } from "../table/game-result";
import { Flowers, Melds } from "../table/melds";
import { MyHand } from "../table/my-hand";
import { Opponent } from "../table/opponent";
import { River } from "../table/river";
import { RoundResult, signed } from "../table/round-result";
import { Stage } from "../table/stage";
import { WallPanel } from "../table/wall";

/** 自動再生で1手を見せる時間 */
const STEP_MS = 700;
/** 自動再生で局の結果を見せる時間 */
const RESULT_MS = 5000;

const NO_ACTIONS = buildMenu([]);
const noop = () => {};

const controlButton =
  "h-8 min-w-9 rounded border border-foreground/40 bg-background/90 px-2 text-xs hover:bg-foreground/10 disabled:opacity-40";

/** 牌譜の再生。3人の手牌を表向きにして、1手ずつ進める。 */
export function ReplayClient({
  events,
  names,
  initialSeat,
}: {
  events: TableEvent[];
  names: string[];
  /** 手前に置く席。見ている人が打った席 */
  initialSeat: Seat;
}) {
  const { frames, rounds } = useMemo(() => buildReplay(events), [events]);
  const [index, setIndex] = useState(0);
  const [seat, setSeat] = useState<Seat>(initialSeat);
  const [playing, setPlaying] = useState(false);
  /** 局の結果を閉じて卓を見ているコマ */
  const [peeked, setPeeked] = useState<number | null>(null);

  const last = frames.length - 1;
  const frame = frames[index];
  /** 手で動かす。自動再生は止める */
  const go = (next: number) => {
    setPlaying(false);
    setIndex(Math.max(0, Math.min(last, next)));
  };

  // 自動再生。局の結果は演出が終わるまで長めに見せる。最後まで行ったら止まる
  const running = playing && index < last;
  useEffect(() => {
    if (!running || !frame) return;
    const timer = setTimeout(
      () => setIndex(index + 1),
      frame.outcome ? RESULT_MS : STEP_MS,
    );
    return () => clearTimeout(timer);
  }, [running, index, frame]);

  // キーボードの左右で1手ずつ動かす
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // 局の選択にフォーカスがあるときは、矢印キーは選択肢を動かす
      if (event.target instanceof HTMLSelectElement) return;
      const step =
        event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (step === 0) return;
      setPlaying(false);
      setIndex((i) => Math.max(0, Math.min(last, i + step)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last]);

  if (!frame) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm opacity-80">この対局の牌譜はありません。</p>
        <Link href="/history" className="text-sm underline opacity-70">
          対局履歴へ
        </Link>
      </main>
    );
  }

  const view = frameView(frame, seat);
  const layout = seatLayout(seat);
  const round = rounds[frame.round]!;
  const nextRound = rounds[frame.round + 1];
  const peeking = peeked === index;

  const hand = (s: Seat) =>
    displayHand(frame.hands[s], frame.turn === s ? frame.drawn : null);
  const lastDiscard = (s: Seat) =>
    frame.lastDiscard?.seat === s ? frame.lastDiscard.tile : null;
  const nameTag = (s: Seat) => (
    <span
      className={`flex items-baseline gap-2 ${
        frame.turn === s && !frame.outcome ? "font-semibold text-cyan-300" : ""
      }`}
    >
      <span className="max-w-[150px] truncate">{names[s]}</span>
      <span className="shrink-0 text-xs opacity-70">
        祝儀 {signed(frame.chips[s])}
      </span>
    </span>
  );

  return (
    <Stage>
      <div className="relative h-full w-full text-sm">
        <div className="absolute top-1.5 right-3 left-3 flex h-6 items-center justify-between">
          {nameTag(layout.left)}
          {nameTag(layout.right)}
        </div>

        <div className="absolute top-0.5 left-1/2 -translate-x-1/2">
          <WallPanel view={view} />
        </div>

        {(["left", "right"] as const).map((side) => {
          const s = layout[side];
          return (
            <div
              key={side}
              className={`absolute top-[44px] h-[310px] w-[224px] ${
                side === "left" ? "left-3" : "right-3"
              }`}
            >
              <Opponent
                side={side}
                seat={s}
                handCount={frame.hands[s].length}
                openHand={hand(s)}
                melds={frame.melds[s]}
                flowers={frame.flowers[s]}
              />
            </div>
          );
        })}

        <div className="absolute top-[44px] left-[244px] h-[168px] w-[180px]">
          <River
            discards={frame.rivers[layout.left]}
            width={28}
            highlight={lastDiscard(layout.left)}
            facing="left"
          />
        </div>
        <div className="absolute top-[44px] left-[430px] h-[152px] w-[180px]">
          <CenterPanel view={view} layout={layout} />
        </div>
        <div className="absolute top-[44px] left-[616px] h-[168px] w-[180px]">
          <River
            discards={frame.rivers[layout.right]}
            width={28}
            highlight={lastDiscard(layout.right)}
            facing="right"
          />
        </div>
        <div className="absolute top-[202px] left-[436px] w-[180px]">
          <River
            discards={frame.rivers[layout.self]}
            width={28}
            highlight={lastDiscard(layout.self)}
            facing="self"
          />
        </div>

        <div className="absolute top-[340px] left-4 flex items-center gap-3">
          {nameTag(layout.self)}
          <Flowers flowers={frame.flowers[layout.self]} width={24} />
        </div>

        {/* 再生の操作 */}
        <div className="absolute top-[338px] right-3 flex items-center gap-1.5">
          <span className="mr-2 max-w-[260px] truncate text-xs">
            {captionText(frame.caption, names)}
          </span>
          <select
            value={frame.round}
            onChange={(event) => go(rounds[Number(event.target.value)]!.start)}
            className="h-8 rounded border border-foreground/40 bg-background px-1 text-xs"
            aria-label="局"
          >
            {rounds.map((r, i) => (
              <option key={i} value={i}>
                {roundLabel(r.roundIndex, r.honba)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={controlButton}
            disabled={index === round.start && frame.round === 0}
            onClick={() =>
              go(
                index > round.start
                  ? round.start
                  : (rounds[frame.round - 1]?.start ?? 0),
              )
            }
            aria-label="前の局"
          >
            ◀◀
          </button>
          <button
            type="button"
            className={controlButton}
            disabled={index === 0}
            onClick={() => go(index - 1)}
            aria-label="1手戻る"
          >
            ◀
          </button>
          <button
            type="button"
            className={`${controlButton} w-14`}
            onClick={() => setPlaying(!running)}
          >
            {running ? "停止" : "再生"}
          </button>
          <button
            type="button"
            className={controlButton}
            disabled={index === last}
            onClick={() => go(index + 1)}
            aria-label="1手進む"
          >
            ▶
          </button>
          <button
            type="button"
            className={controlButton}
            disabled={!nextRound}
            onClick={() => nextRound && go(nextRound.start)}
            aria-label="次の局"
          >
            ▶▶
          </button>
          <button
            type="button"
            className={controlButton}
            onClick={() => setSeat(((seat + 1) % 3) as Seat)}
          >
            視点
          </button>
          <Link href="/history" className={`${controlButton} leading-8`}>
            閉じる
          </Link>
        </div>

        <div className="absolute bottom-1 left-4">
          <MyHand
            hand={frame.hands[layout.self]}
            drawn={view.drawn}
            pickable={[]}
            dimOthers={false}
            selected={null}
            onTap={noop}
            onSlide={noop}
          />
        </div>
        <div className="absolute right-3 bottom-1">
          <Melds
            melds={frame.melds[layout.self]}
            seat={layout.self}
            width={36}
          />
        </div>

        {frame.outcome && !peeking && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/55">
            <div className="relative flex max-h-[452px] w-[760px] flex-col gap-3 overflow-y-auto rounded-lg border border-cyan-400/70 bg-[#07122b] p-4">
              <RoundResult
                key={index}
                view={view}
                names={names}
                menu={NO_ACTIONS}
                playback={{
                  index: null,
                  step: 0,
                  rolling: false,
                  done: frame.dice.length,
                }}
                busy
                send={noop}
              >
                {frame.result && (
                  <GameResult
                    result={frame.result}
                    names={names}
                    roomCode={null}
                  />
                )}
              </RoundResult>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className={controlButton}
                  onClick={() => setPeeked(index)}
                >
                  卓を見る
                </button>
                {index < last && (
                  <button
                    type="button"
                    className={controlButton}
                    onClick={() => go(index + 1)}
                  >
                    次の局へ
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        {frame.outcome && peeking && (
          <button
            type="button"
            onClick={() => setPeeked(null)}
            className={`absolute top-[300px] right-3 ${controlButton}`}
          >
            結果に戻る
          </button>
        )}
      </div>
    </Stage>
  );
}
