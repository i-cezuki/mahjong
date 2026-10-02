"use client";

import { useCallback, useEffect, useState } from "react";
import { TableScreen } from "@/app/games/[id]/table/table-screen";
import { startRoundFromDeck } from "@/engine";
import type { Seat } from "@/engine";
import { buildDeck } from "@/engine/testing";
import { applyTimed, applyTimeout, startClock } from "@/server/clock";
import type { ClockContext } from "@/server/clock";
import { buildView, startTable } from "@/server/table";
import type {
  DiceResult,
  PlayAction,
  PlayerView,
  TableAction,
  TableState,
} from "@/server/table";

/*
 * サーバーを通さずに、エンジンをブラウザで動かして卓の画面を確かめる。
 * 席0が自分で、ほかの2人は可能な操作からでたらめに選ぶ。
 */

const ME: Seat = 0;
const NAMES = ["じぶん", "しもちゃ", "かみちゃ"];
const FIRST_SEED = "07".repeat(32);
const BOT_DELAY_MS = 350;

function randomSeed(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const pick = <T,>(items: readonly T[]): T =>
  items[Math.floor(Math.random() * items.length)]!;

/** 自動で打つ人の操作。和了できれば和了し、鳴きはたまにだけする。 */
function botAction(actions: readonly PlayAction[]): PlayAction {
  const of = (type: PlayAction["type"]) =>
    actions.filter((a) => a.type === type);
  const win = [...of("tsumo"), ...of("ron"), ...of("confirm")];
  if (win.length > 0) return win[0]!;
  const pass = of("pass")[0];
  if (pass) return Math.random() < 0.6 ? pass : pick(actions);
  const riichi = of("riichi");
  if (riichi.length > 0 && Math.random() < 0.7) return pick(riichi);
  const kans = [...of("ankan"), ...of("kakan")];
  if (kans.length > 0 && Math.random() < 0.5) return pick(kans);
  const discards = of("discard");
  return discards.length > 0 ? pick(discards) : pick(actions);
}

const context = (now = Date.now()): ClockContext => ({
  now,
  nextSeed: randomSeed,
  pick: (count) => Math.floor(Math.random() * count),
});

/** 時計つきの対局を始める。 */
const freshTable = (seed: string): TableState =>
  startClock(startTable({ seed }).table, Date.now());

function step(table: TableState, action: TableAction): TableState {
  return applyTimed(table, action, context()).table;
}

/** 条件を満たすまで、3人とも自動で進める。 */
function fastForward(
  table: TableState,
  done: (table: TableState) => boolean,
): TableState {
  let current = table;
  for (let i = 0; i < 5000 && !done(current); i++) {
    const seat = ([0, 1, 2] as const).find(
      (s) => buildView(current, s).actions.length > 0,
    );
    if (seat === undefined) break;
    current = step(current, botAction(buildView(current, seat).actions));
  }
  return current;
}

/**
 * 自分が配牌で聴牌している局を作る。最初のツモで中を切ってリーチでき、
 * 次のツモで `nextDraw` を引く（ポッチなら一発で、本物のサイコロチャンスになる）。
 */
function tenpaiTable(nextDraw: string, firstDraw = "7z"): TableState {
  const seed = randomSeed();
  const deck = buildDeck({
    hands: [
      "123456789p 234s 5s",
      "19m 147p 268s 12346z",
      "19m 258p 147s 12346z",
    ],
    live: `${firstDraw} 3p 3s ${nextDraw}`,
    dora: "4s",
    ura: "8p",
  });
  const table = startTable({ seed }).table;
  return startClock(
    {
      ...table,
      game: {
        ...table.game,
        round: startRoundFromDeck(deck, { dealer: ME, seed }).state,
      },
    },
    Date.now(),
  );
}

/** 作り物のサイコロチャンス。エンジンではめったに起きないので、画面データを上書きして出す。 */
type Fake = { stage: "choose" } | { stage: "result"; result: DiceResult };

function fakeDice(faces: [number, number]): DiceResult {
  const rolls: [number, number][] = [];
  let hits = 0;
  for (let attempts = 0; attempts < 4;) {
    // 当たりも見たいので、3回に1回は指定した出目にする
    const roll: [number, number] =
      Math.random() < 0.34
        ? [faces[1], faces[0]]
        : [
            1 + Math.floor(Math.random() * 6),
            1 + Math.floor(Math.random() * 6),
          ];
    rolls.push(roll);
    if (roll[0] === roll[1]) continue;
    attempts++;
    if (roll.includes(faces[0]) && roll.includes(faces[1])) hits++;
  }
  return {
    seat: ME,
    faces,
    rolls,
    hits,
    chipDeltas: [140 * hits, -70 * hits, -70 * hits],
  };
}

function withFake(view: PlayerView, fake: Fake | null): PlayerView {
  if (!fake || !view.outcome) return view;
  if (fake.stage === "choose") {
    const faces: [number, number][] = [];
    for (let a = 1; a <= 6; a++) {
      for (let b = a + 1; b <= 6; b++) faces.push([a, b]);
    }
    return {
      ...view,
      roundPhase: "diceChance",
      diceChance: { seat: ME, remaining: 1 },
      actions: faces.map((f) => ({ type: "dice", seat: ME, faces: f })),
    };
  }
  return { ...view, dice: [fake.result] };
}

export function Sandbox() {
  const [{ table, version }, setState] = useState(() => ({
    table: freshTable(FIRST_SEED),
    version: 1,
  }));
  const [fake, setFake] = useState<Fake | null>(null);
  /** 場面を切り替えた回数。卓を作り直して、前の場面の状態を持ち越さない */
  const [scene, setScene] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const update = useCallback((change: (table: TableState) => TableState) => {
    setState((current) => {
      try {
        return { table: change(current.table), version: current.version + 1 };
      } catch {
        return current;
      }
    });
  }, []);

  const send = useCallback(
    (action: TableAction) => {
      setError(null);
      if (action.type === "dice" && fake?.stage === "choose") {
        setFake({ stage: "result", result: fakeDice(action.faces) });
        setState((current) => ({ ...current, version: current.version + 1 }));
        return;
      }
      if (action.type === "confirm") setFake(null);
      update((current) => step(current, action));
    },
    [fake, update],
  );

  // ほかの2人を少し間を置いて進める
  useEffect(() => {
    const bot = ([1, 2] as const).find(
      (seat) => buildView(table, seat).actions.length > 0,
    );
    if (bot === undefined) return;
    const timer = setTimeout(
      () =>
        update((current) =>
          step(current, botAction(buildView(current, bot).actions)),
        ),
      BOT_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [table, update]);

  // 期限を過ぎたら、サーバーの代わりに時間切れを処理する
  const deadline = table.clock?.deadline ?? null;
  useEffect(() => {
    if (deadline === null) return;
    const timer = setTimeout(
      () => update((current) => applyTimeout(current, context()).table),
      Math.max(0, deadline - Date.now()) + 100,
    );
    return () => clearTimeout(timer);
  }, [deadline, version, update]);

  const debug = (label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-foreground/40 bg-background/90 px-2 py-0.5"
    >
      {label}
    </button>
  );
  const roundOver = (t: TableState) =>
    t.game.phase === "ended" || t.game.round.phase === "ended";

  return (
    <>
      <TableScreen
        key={scene}
        view={withFake(buildView(table, ME), fake)}
        version={version}
        names={NAMES}
        roomCode={null}
        busy={false}
        error={error}
        send={send}
        shownDice={0}
        serverTime={Date.now}
      />
      <div className="fixed right-0 bottom-0 z-50 flex gap-1 text-[10px] opacity-60 hover:opacity-100">
        {debug("時間切れ", () =>
          update(
            (t) =>
              applyTimeout(t, context(t.clock?.deadline ?? Date.now())).table,
          ),
        )}
        {debug("下家を自動", () =>
          update((t) =>
            t.clock
              ? {
                  ...t,
                  clock: {
                    ...t.clock,
                    auto: [t.clock.auto[0], true, t.clock.auto[2]],
                  },
                }
              : t,
          ),
        )}
        {debug("20手進める", () =>
          update((t) => {
            let n = 0;
            return fastForward(t, (c) => n++ >= 20 || roundOver(c));
          }),
        )}
        {debug("局の終わりまで", () =>
          update((t) => fastForward(t, roundOver)),
        )}
        {debug("終局まで", () =>
          update((t) => fastForward(t, (c) => c.game.phase === "ended")),
        )}
        {debug("サイコロ", () => {
          if (!table.game.round.outcome) {
            setError("局が終わってから押してください");
            return;
          }
          setFake({ stage: "choose" });
          setState((current) => ({ ...current, version: current.version + 1 }));
        })}
        {debug("聴牌", () => {
          setFake(null);
          setScene((n) => n + 1);
          update(() => tenpaiTable("r5s"));
        })}
        {debug("聴牌（引けない）", () => {
          setFake(null);
          setScene((n) => n + 1);
          update(() => tenpaiTable("4z"));
        })}
        {debug("花牌", () => {
          setFake(null);
          setScene((n) => n + 1);
          update(() => tenpaiTable("1f"));
        })}
        {debug("ポッチ", () => {
          setFake(null);
          setScene((n) => n + 1);
          update(() => tenpaiTable("o5z"));
        })}
        {debug("最初から", () => {
          setFake(null);
          setScene((n) => n + 1);
          setState((current) => ({
            table: freshTable(randomSeed()),
            version: current.version + 1,
          }));
        })}
      </div>
    </>
  );
}
