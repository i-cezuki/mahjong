"use client";

import { useEffect, useRef, useState } from "react";
import type { Seat, TileId } from "@/engine";
import type { PlayerView, TableAction } from "@/server/table";
import { autoAction, buildMenu, tsumogiriAction } from "../logic/actions";
import type { AutoSettings } from "../logic/actions";
import { isDoubleTap } from "../logic/double-tap";
import type { Tap } from "../logic/double-tap";
import { seatLayout } from "../logic/seats";
import { ActionBar, Toggles } from "./action-bar";
import { CallCutin } from "./call-cutin";
import { isRiichiMode } from "./action-bar";
import type { PickMode } from "./action-bar";
import { CenterPanel } from "./center-panel";
import { ClockBadge } from "./clock-badge";
import { GameResult } from "./game-result";
import { Flowers, Melds } from "./melds";
import { MyHand } from "./my-hand";
import { Opponent } from "./opponent";
import { River } from "./river";
import { RoundResult, signed } from "./round-result";
import { Stage } from "./stage";
import { TedashiBubble } from "./tedashi-bubble";
import { useCalls, useTedashi } from "./use-calls";
import { useDicePlayback } from "./use-dice-playback";
import { useFlowerReveal } from "./use-flower-reveal";
import { WallPanel } from "./wall";

export interface TableScreenProps {
  /** 終局のあとに牌譜へ案内する。開発用の卓のように対局がなければ省く */
  gameId?: string;
  view: PlayerView;
  /** 画面データの版番号。牌の選択と自動操作を、更新のたびにやり直すために使う */
  version: number;
  names: string[];
  /** 席ごとのロンの決めゼリフ。設定なしは null */
  ronPhrases: readonly (string | null)[];
  roomCode: string | null;
  busy: boolean;
  error: string | null;
  send: (action: TableAction) => void;
  /** 画面を開いた時点ですでに届いていたサイコロの結果の数（再生しない分） */
  shownDice: number;
  /** サーバーの現在時刻の見積もり。残り時間の表示に使う */
  serverTime: () => number;
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
  gameId,
  view,
  version,
  names,
  ronPhrases,
  roomCode,
  busy,
  error,
  send,
  shownDice,
  serverTime,
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
  // リーチ、鳴き、和了の発声。和了の発声の間は、局の結果を出すのを待つ
  const { calls, resultHeld } = useCalls(view, version);
  // 相手が手牌から切ったときの「手出し」
  const tedashi = useTedashi(view, version);

  /** 自分が即ツモ切り中 */
  const myAuto = view.auto[view.seat];
  // 自分が待たれているときだけ、残り時間を出す
  const clock =
    view.myDeadline !== null && view.actions.length > 0 && !myAuto ? (
      <ClockBadge
        deadline={view.myDeadline}
        bank={
          view.roundPhase === "awaitTurnAction" ||
          view.roundPhase === "awaitResponses"
            ? view.bank
            : null
        }
        serverTime={serverTime}
      />
    ) : null;

  const [pinnedTile, setPinnedTile] = useState<Pinned<TileId> | null>(null);
  const [pinnedMode, setPinnedMode] = useState<Pinned<PickMode> | null>(null);
  const mode = pinnedMode?.version === version ? pinnedMode.value : null;
  // 自分の番でないときに浮かせた牌。ほかの人が切っても下げず、自分の番が来るか局が変わるまで残す
  const deal = `${view.roundIndex}:${view.honba}`;
  const [heldTile, setHeldTile] = useState<{
    deal: string;
    value: TileId;
  } | null>(null);
  /** 局の結果を閉じて卓を見ている */
  const [peeking, setPeeking] = useState(false);

  // 自動和了、鳴きなし、リーチ後のツモ切り。同じ版番号には1回しか送らない
  const inRiichi = view.riichi[view.seat] !== null;
  const autoSent = useRef(-1);
  useEffect(() => {
    // 前の操作の応答を待っている間は送れないので、返ってきてから送る。即ツモ切り中は、本人が復帰するまで送らない
    if (busy || mine.staging || myAuto) return;
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
  }, [
    view.actions,
    settings,
    inRiichi,
    version,
    busy,
    mine.staging,
    myAuto,
    send,
  ]);

  // 手牌やボタン以外の同じ場所を素早く2回タップしたら、ツモ牌をそのまま切る。
  // 卓の外の余白でも効くように、画面全体のタップを見る
  const canTsumogiri = !busy && !mine.staging && mode === null && !view.outcome;
  const tsumogiri = canTsumogiri
    ? tsumogiriAction(view.actions, view.drawn)
    : null;
  const lastTap = useRef<Tap | null>(null);
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const onControl =
        event.target instanceof Element &&
        event.target.closest("button, a") !== null;
      const tap = { time: event.timeStamp, x: event.clientX, y: event.clientY };
      const quick = isDoubleTap(lastTap.current, tap);
      // ボタンのタップと、ツモ切りに使った2回目のタップは、次の1回目に数えない
      lastTap.current = onControl || quick ? null : tap;
      if (!onControl && quick && tsumogiri) send(tsumogiri);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [tsumogiri, send]);

  const riichi = isRiichiMode(mode);
  const pickable =
    mode === "doubleRiichi"
      ? menu.doubleRiichiTiles
      : mode === "openRiichi"
        ? menu.openRiichiTiles
        : mode === "riichi"
          ? menu.riichiTiles
          : menu.discards;
  /** いま切れる牌が無い。手牌のどれでも浮かせるだけはできる */
  const offTurn = pickable.length === 0;
  // 自分の番が来たら下げる。1回のタップで切ってしまわないように
  if (!offTurn && heldTile) setHeldTile(null);
  const held =
    offTurn && heldTile?.deal === deal && mine.hand.includes(heldTile.value)
      ? heldTile.value
      : null;
  const selected =
    (pinnedTile?.version === version ? pinnedTile.value : null) ?? held;

  /** 指を滑らせて乗った牌を浮かせる。切るのはタップだけ */
  function slide(tile: TileId) {
    if (offTurn) setHeldTile({ deal, value: tile });
    else setPinnedTile({ version, value: tile });
  }

  function tap(tile: TileId) {
    if (offTurn) {
      // 同じ牌をもう一度タップしたら下げる
      setHeldTile(tile === held ? null : { deal, value: tile });
      return;
    }
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
            ...(mode === "openRiichi" && { open: true }),
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
      {view.auto[seat] && (
        <span className="shrink-0 rounded bg-amber-400/90 px-1 text-[10px] font-semibold text-black">
          自動
        </span>
      )}
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
          seat={layout.left}
          handCount={view.handCounts[layout.left]}
          openHand={view.openHands[layout.left]}
          melds={view.melds[layout.left]}
          flowers={view.flowers[layout.left]}
        />
      </div>
      <div className="absolute top-[44px] right-3 h-[310px] w-[224px]">
        <Opponent
          side="right"
          seat={layout.right}
          handCount={view.handCounts[layout.right]}
          openHand={view.openHands[layout.right]}
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

      <div className="absolute top-[340px] left-4 flex items-center gap-3">
        <Toggles settings={settings} onChange={onSettings} />
        <span className="text-xs opacity-70">{chips(layout.self)}</span>
        <Flowers flowers={mine.flowers} width={24} />
      </div>
      <div className="absolute top-[338px] right-3 flex items-center gap-3">
        {error && (
          <p role="alert" className="text-rose-300">
            {error}
          </p>
        )}
        {waiting && <p className="opacity-50">ほかの人を待っています</p>}
        {!view.outcome && clock}
        <ActionBar
          menu={menu}
          hand={view.hand}
          mode={mode}
          busy={busy}
          onMode={(next) => setPinnedMode(next && { version, value: next })}
          send={send}
        />
      </div>

      <div className="absolute bottom-1 left-4">
        <MyHand
          hand={mine.hand}
          drawn={mine.drawn}
          pickable={offTurn ? mine.hand : pickable}
          dimOthers={riichi}
          selected={selected}
          onTap={tap}
          onSlide={slide}
        />
      </div>
      <div className="absolute right-3 bottom-1">
        <Melds melds={view.melds[layout.self]} seat={layout.self} width={36} />
      </div>

      {/* 卓を見ている間も消さずに隠す。戻ったときに役の演出をやり直さない */}
      {view.outcome && !resultHeld && (
        <div
          className={`absolute inset-0 flex items-center justify-center bg-black/55 ${peeking ? "hidden" : ""}`}
        >
          <div className="relative flex max-h-[452px] w-[760px] flex-col gap-3 overflow-y-auto rounded-lg border border-cyan-400/70 bg-[#07122b] p-4">
            <RoundResult
              view={view}
              names={names}
              menu={menu}
              playback={playback}
              busy={busy}
              send={send}
            >
              {view.result && !dicePlaying && (
                <GameResult
                  result={view.result}
                  names={names}
                  roomCode={roomCode}
                  replayHref={gameId ? `/games/${gameId}/replay` : null}
                />
              )}
            </RoundResult>
            {clock && (
              <div className="absolute right-[100px] bottom-3">{clock}</div>
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
          className={`absolute top-[344px] right-3 ${peekButton}`}
        >
          結果に戻る
        </button>
      )}
      <TedashiBubble seats={tedashi} layout={layout} />
      <CallCutin
        calls={calls}
        layout={layout}
        names={names}
        ronPhrases={ronPhrases}
      />
      {myAuto && view.phase === "playing" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => send({ type: "resume", seat: view.seat })}
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 text-xl font-semibold"
        >
          自動ツモ切り中　タップで復帰
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
