"use client";

import { useEffect, useRef, useState } from "react";
import type { Seat, TileId } from "@/engine";
import type { PlayerView, TableAction } from "@/server/table";
import { autoAction, buildMenu } from "../logic/actions";
import type { AutoSettings } from "../logic/actions";
import { seatLayout } from "../logic/seats";
import { ActionBar, Toggles } from "./action-bar";
import type { PickMode } from "./action-bar";
import { CenterPanel } from "./center-panel";
import { GameResult } from "./game-result";
import { Flowers, Melds } from "./melds";
import { MyHand } from "./my-hand";
import { Opponent } from "./opponent";
import { River } from "./river";
import { RoundResult, signed } from "./round-result";
import { Stage } from "./stage";
import { useDicePlayback } from "./use-dice-playback";
import { useFlowerReveal } from "./use-flower-reveal";
import { WallPanel } from "./wall";

export interface TableScreenProps {
  view: PlayerView;
  /** 画面データの版番号。牌の選択と自動操作を、更新のたびにやり直すために使う */
  version: number;
  names: string[];
  roomCode: string | null;
  busy: boolean;
  error: string | null;
  send: (action: TableAction) => void;
  /** 画面を開いた時点ですでに届いていたサイコロの結果の数（再生しない分） */
  shownDice: number;
}

const peekButton =
  "h-8 rounded border border-foreground/40 bg-background/90 px-3 text-xs hover:bg-foreground/10";

/** リーチ後のツモ切りまでの間。引いた牌を見せるために待つ。 */
const TSUMOGIRI_DELAY_MS = 700;

/** 版番号と一緒に覚えておき、画面データが更新されたら無かったことにする値 */
interface Pinned<T> {
  version: number;
  value: T;
}

function Table({
  view,
  version,
  names,
  roomCode,
  busy,
  error,
  send,
  shownDice,
  settings,
  onSettings,
}: TableScreenProps & {
  settings: AutoSettings;
  onSettings: (settings: AutoSettings) => void;
}) {
  const layout = seatLayout(view.seat);
  // 花牌を見せている間は、補充牌がまだ手に来ていない扱いにして操作を出さない
  const mine = useFlowerReveal(view);
  const menu = buildMenu(mine.staging ? [] : view.actions);
  const playback = useDicePlayback(view.dice, shownDice);
  const dicePlaying = playback.index !== null;

  const [pinnedTile, setPinnedTile] = useState<Pinned<TileId> | null>(null);
  const [pinnedMode, setPinnedMode] = useState<Pinned<PickMode> | null>(null);
  const selected = pinnedTile?.version === version ? pinnedTile.value : null;
  const mode = pinnedMode?.version === version ? pinnedMode.value : null;
  /** 局の結果を閉じて卓を見ている */
  const [peeking, setPeeking] = useState(false);

  // 自動和了、鳴きなし、リーチ後のツモ切り。同じ版番号には1回しか送らない
  const inRiichi = view.riichi[view.seat] !== null;
  const autoSent = useRef(-1);
  useEffect(() => {
    // 前の操作の応答を待っている間は送れないので、返ってきてから送る
    if (busy || mine.staging) return;
    const action = autoAction(view.actions, settings, inRiichi);
    if (!action || autoSent.current === version) return;
    const fire = () => {
      autoSent.current = version;
      send(action);
    };
    if (action.type !== "discard") {
      fire();
      return;
    }
    // ツモ切りは、引いた牌が見えるように少し待ってから切る
    const timer = setTimeout(fire, TSUMOGIRI_DELAY_MS);
    return () => clearTimeout(timer);
  }, [view.actions, settings, inRiichi, version, busy, mine.staging, send]);

  const riichi = mode === "riichi" || mode === "doubleRiichi";
  const pickable =
    mode === "doubleRiichi"
      ? menu.doubleRiichiTiles
      : mode === "riichi"
        ? menu.riichiTiles
        : menu.discards;

  function tap(tile: TileId) {
    if (busy) return;
    if (tile !== selected) {
      setPinnedTile({ version, value: tile });
      return;
    }
    send(
      riichi
        ? {
            type: "riichi",
            seat: view.seat,
            tile,
            doubleStake: mode === "doubleRiichi",
          }
        : { type: "discard", seat: view.seat, tile },
    );
  }

  const lastDiscard = (seat: Seat) =>
    view.lastDiscard?.seat === seat ? view.lastDiscard.tile : null;

  /** 上の帯に出す、相手の名前と祝儀 */
  const nameTag = (seat: Seat) => (
    <span
      className={`flex items-baseline gap-2 ${
        view.turn === seat && view.roundPhase !== "ended"
          ? "font-semibold text-cyan-300"
          : ""
      }`}
    >
      <span className="max-w-[150px] truncate">{names[seat]}</span>
      <span className="shrink-0 text-xs opacity-70">{chips(seat)}</span>
    </span>
  );
  // サイコロの再生が終わるまで、結果を含む累計は見せない
  const chips = (seat: Seat) =>
    `祝儀 ${dicePlaying ? "…" : signed(view.chips[seat])}`;

  const waiting =
    view.phase === "playing" && view.actions.length === 0 && !view.outcome;

  return (
    <div className="relative h-full w-full text-sm">
      <div className="absolute top-1.5 right-3 left-3 flex h-6 items-center justify-between">
        {nameTag(layout.left)}
        {nameTag(layout.right)}
      </div>

      <div className="absolute top-0.5 left-1/2 -translate-x-1/2">
        <WallPanel view={view} />
      </div>

      <div className="absolute top-[44px] left-3 h-[310px] w-[224px]">
        <Opponent
          side="left"
          handCount={view.handCounts[layout.left]}
          melds={view.melds[layout.left]}
          flowers={view.flowers[layout.left]}
        />
      </div>
      <div className="absolute top-[44px] right-3 h-[310px] w-[224px]">
        <Opponent
          side="right"
          handCount={view.handCounts[layout.right]}
          melds={view.melds[layout.right]}
          flowers={view.flowers[layout.right]}
        />
      </div>

      {/* 相手の河は縦に並ぶ。6枚分の高さにそろえ、上家は上から、下家は下から並べる */}
      <div className="absolute top-[44px] left-[244px] h-[168px] w-[180px]">
        <River
          discards={view.rivers[layout.left]}
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
          discards={view.rivers[layout.right]}
          width={28}
          highlight={lastDiscard(layout.right)}
          facing="right"
        />
      </div>
      <div className="absolute top-[202px] left-[436px] w-[180px]">
        <River
          discards={view.rivers[layout.self]}
          width={28}
          highlight={lastDiscard(layout.self)}
          facing="self"
        />
      </div>

      <div className="absolute top-[354px] left-4 flex items-center gap-3">
        <Toggles settings={settings} onChange={onSettings} />
        <span className="text-xs opacity-70">{chips(layout.self)}</span>
        <Flowers flowers={mine.flowers} width={24} />
      </div>
      <div className="absolute top-[352px] right-3 flex items-center gap-3">
        {error && (
          <p role="alert" className="text-rose-300">
            {error}
          </p>
        )}
        {waiting && <p className="opacity-50">ほかの人を待っています</p>}
        <ActionBar
          menu={menu}
          hand={view.hand}
          mode={mode}
          busy={busy}
          onMode={(next) => setPinnedMode(next && { version, value: next })}
          send={send}
        />
      </div>

      <div className="absolute bottom-2 left-4">
        <MyHand
          hand={mine.hand}
          drawn={mine.drawn}
          pickable={pickable}
          dimOthers={riichi}
          selected={selected}
          onTap={tap}
        />
      </div>
      <div className="absolute right-3 bottom-2">
        <Melds melds={view.melds[layout.self]} width={36} />
      </div>

      {view.outcome && !peeking && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/55">
          <div className="relative flex max-h-[452px] w-[760px] flex-col gap-3 overflow-y-auto rounded-lg border border-cyan-400/70 bg-[#07122b] p-4">
            <RoundResult
              view={view}
              names={names}
              menu={menu}
              playback={playback}
              busy={busy}
              send={send}
            />
            {view.result && !dicePlaying && (
              <GameResult
                result={view.result}
                names={names}
                roomCode={roomCode}
              />
            )}
            <button
              type="button"
              onClick={() => setPeeking(true)}
              className={`absolute right-3 bottom-3 ${peekButton}`}
            >
              卓を見る
            </button>
          </div>
        </div>
      )}
      {view.outcome && peeking && (
        <button
          type="button"
          onClick={() => setPeeking(false)}
          className={`absolute top-[358px] right-3 ${peekButton}`}
        >
          結果に戻る
        </button>
      )}
    </div>
  );
}

/** 対局の画面。画面データを描くだけで、通信はしない。 */
export function TableScreen(props: TableScreenProps) {
  // 切り替えボタンは局をまたいで保つ。それ以外の状態は局ごとに作り直す
  const [settings, setSettings] = useState<AutoSettings>({
    autoWin: false,
    noCall: false,
  });
  return (
    <Stage>
      <Table
        key={`${props.view.roundIndex}-${props.view.honba}`}
        {...props}
        settings={settings}
        onSettings={setSettings}
      />
    </Stage>
  );
}
