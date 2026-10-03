import { useEffect, useState } from "react";
import { limitLabel, YAKU_LABELS } from "@/components/labels";
import { Tile, TileBack } from "@/components/tile";
import { doraKind, tileOf } from "@/engine";
import type { Seat, TileId, TileKind, WinRecord } from "@/engine";
import type { PlayerView, TableAction } from "@/server/table";
import type { ActionMenu } from "../logic/actions";
import { revealItems, revealSchedule } from "../logic/win-reveal";
import { DiceSection } from "./dice";
import { Melds } from "./melds";
import type { DicePlayback } from "./use-dice-playback";

const SEATS: readonly Seat[] = [0, 1, 2];

const WIN_KINDS: Record<WinRecord["kind"], string> = {
  tsumo: "ツモ",
  ron: "ロン",
  pocchi: "ポッチ",
  reversePocchi: "逆ポッチ",
  nagashi: "流し役満",
};

const BONUS_LABELS = {
  dora: "ドラ",
  red: "赤",
  gold: "金",
  flower: "花",
} as const;

/** 裏ドラの演出の段階。めくる前、めくって光らせている、役が確定した */
type UraStage = "hidden" | "flipped" | "settled";

/** 内訳の演出の進み具合 */
interface Reveal {
  /** 出した行数（裏ドラを除く） */
  shown: number;
  uraStage: UraStage;
  /** 内訳がすべて出た。点棒の移動を出してよい */
  done: boolean;
}

/**
 * 和了の内訳を1行ずつ出し、リーチの和了なら最後に裏ドラをめくる。
 * @param count 裏ドラを除いた行数。0 のとき（流局）は演出しない
 */
function useReveal(count: number, ura: boolean): Reveal {
  const animate = count > 0 || ura;
  const [passed, setPassed] = useState(0);
  useEffect(() => {
    if (!animate) return;
    const { steps, flip, settle } = revealSchedule(count, ura);
    const times = [...steps, ...(flip === null ? [] : [flip]), settle];
    const timers = times.map((time, i) =>
      setTimeout(() => setPassed(i + 1), time),
    );
    return () => timers.forEach(clearTimeout);
  }, [animate, count, ura]);
  if (!animate) return { shown: 0, uraStage: "settled", done: true };
  const done = passed === count + (ura ? 1 : 0) + 1;
  return {
    shown: Math.min(passed, count),
    uraStage: done ? "settled" : ura && passed > count ? "flipped" : "hidden",
    done,
  };
}

export const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** 公開された手牌と副露。和了牌があれば右に離して置く。 */
function Hand({
  view,
  seat,
  winTile,
  glow,
}: {
  view: PlayerView;
  seat: Seat;
  winTile: number | null;
  /** 光らせる牌（乗った裏ドラ） */
  glow?: ((tile: TileId) => boolean) | undefined;
}) {
  const hand = view.revealed[seat];
  if (!hand) return null;
  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
      <span className="flex">
        {hand
          .filter((tile) => tile !== winTile)
          .map((tile) => (
            <Tile
              key={tile}
              id={tile}
              width={30}
              glow={glow?.(tile) ?? false}
            />
          ))}
      </span>
      {winTile !== null && (
        <Tile id={winTile} width={30} glow={glow?.(winTile) ?? false} />
      )}
      <Melds melds={view.melds[seat]} seat={seat} width={26} glow={glow} />
    </div>
  );
}

function Win({
  view,
  names,
  win,
  uraKinds,
  reveal,
}: {
  view: PlayerView;
  names: string[];
  win: WinRecord;
  /** 裏ドラになる種類。リーチの和了がなければ空 */
  uraKinds: ReadonlySet<TileKind>;
  reveal: Reveal;
}) {
  const result = win.result;
  const riichi = view.riichi[win.seat] !== null;
  const items = result ? revealItems(result) : [];
  // 裏ドラの行は、裏ドラをめくって役が確定してから出す
  const visible = [
    ...items.filter((item) => item.kind !== "ura").slice(0, reveal.shown),
    ...(reveal.uraStage === "settled"
      ? items.filter((item) => item.kind === "ura")
      : []),
  ];
  const limit = result ? limitLabel(result.han) : null;
  const glow =
    riichi && reveal.uraStage !== "hidden" && uraKinds.size > 0
      ? (tile: TileId) => uraKinds.has(tileOf(tile).kind)
      : undefined;
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="flex items-baseline gap-3">
        <span className="text-lg font-bold text-amber-200">
          {names[win.seat]}
        </span>
        <span className="font-semibold">{WIN_KINDS[win.kind]}</span>
        {win.from !== null && (
          <span className="text-sm opacity-70">（{names[win.from]}から）</span>
        )}
        {/* 合計と満貫などは、裏ドラまで全部出し切ってから出す */}
        {result && reveal.done && (
          <span className="yaku-pop ml-auto text-lg font-bold">
            {result.yakuman > 0 ? (
              result.yakuman > 1 ? (
                `役満×${result.yakuman}`
              ) : (
                "役満"
              )
            ) : (
              <>
                <span>合計 {result.han}翻</span>
                {limit && <span className="ml-2 text-amber-200">{limit}</span>}
              </>
            )}
          </span>
        )}
      </h3>
      <Hand view={view} seat={win.seat} winTile={win.winTile} glow={glow} />
      {result && (
        // 行が出る前から高さを取っておき、下の段が動かないようにする
        <p className="flex min-h-5 flex-wrap gap-x-3 text-sm">
          {visible.map((item) =>
            item.kind === "yaku" ? (
              <span key={item.name} className="yaku-pop">
                {YAKU_LABELS[item.name]}
                {item.han < 13 && (
                  <span className="opacity-60"> {item.han}</span>
                )}
              </span>
            ) : item.kind === "bonus" ? (
              <span key={item.key} className="yaku-pop text-amber-200">
                {BONUS_LABELS[item.key]} {item.han}
              </span>
            ) : (
              <span key="ura" className="ura-pop font-bold text-yellow-300">
                裏ドラ {item.han}
              </span>
            ),
          )}
        </p>
      )}
    </section>
  );
}

/** 3人分の増減を1行に並べる */
function Deltas({
  label,
  names,
  values,
}: {
  label: string;
  names: string[];
  values: readonly number[];
}) {
  return (
    <tr>
      <th className="pr-4 text-left font-normal opacity-70">{label}</th>
      {SEATS.map((seat) => (
        <td key={seat} className="pr-5">
          <span className="opacity-70">{names[seat]}</span>{" "}
          <span
            className={`font-mono ${
              values[seat]! > 0
                ? "text-cyan-300"
                : values[seat]! < 0
                  ? "text-rose-300"
                  : "opacity-60"
            }`}
          >
            {signed(values[seat]!)}
          </span>
        </td>
      ))}
    </tr>
  );
}

/** 局の結果。和了または流局、点棒と祝儀の移動、サイコロチャンス、確認。 */
export function RoundResult({
  view,
  names,
  menu,
  playback,
  busy,
  send,
  children,
}: {
  view: PlayerView;
  names: string[];
  menu: ActionMenu;
  playback: DicePlayback;
  busy: boolean;
  send: (action: TableAction) => void;
  /** 役が確定してから出すもの（対局の結果） */
  children?: React.ReactNode;
}) {
  const outcome = view.outcome;
  // 裏ドラ表示牌はリーチの和了があるときだけ届く。ダブロンは2人同時に出していく
  const reveal = useReveal(
    Math.max(
      0,
      ...(outcome?.wins ?? []).map(
        (win) =>
          (win.result ? revealItems(win.result) : []).filter(
            (item) => item.kind !== "ura",
          ).length,
      ),
    ),
    (outcome?.uraIndicators.length ?? 0) > 0,
  );
  if (!outcome) return null;
  const uraKinds = new Set(
    outcome.uraIndicators.map((tile) => doraKind(tileOf(tile).kind)),
  );
  const draw = outcome.type === "exhaustiveDraw";
  const dicePlaying = playback.index !== null;

  return (
    <div className="flex flex-col gap-3">
      {draw && (
        <section className="flex flex-col gap-1.5">
          <h3 className="text-lg font-bold">流局</h3>
          {outcome.tenpai.length === 0 && (
            <p className="text-sm opacity-70">テンパイなし</p>
          )}
          {outcome.tenpai.map((seat) => (
            <div key={seat} className="flex flex-col gap-1">
              <p className="text-sm">
                <span className="font-semibold text-amber-200">
                  {names[seat]}
                </span>
                　テンパイ
              </p>
              <Hand view={view} seat={seat} winTile={null} />
            </div>
          ))}
        </section>
      )}

      {outcome.wins.map((win) => (
        <Win
          key={win.seat}
          view={view}
          names={names}
          win={win}
          uraKinds={uraKinds}
          reveal={reveal}
        />
      ))}

      {outcome.uraIndicators.length > 0 && (
        <p className="flex items-center gap-2 text-sm">
          <span className="opacity-70">裏ドラ表示</span>
          <span className="flex">
            {outcome.uraIndicators.map((tile) =>
              reveal.uraStage === "hidden" ? (
                <TileBack key={tile} width={24} />
              ) : (
                <span key={tile} className="ura-flip">
                  <Tile id={tile} width={24} />
                </span>
              ),
            )}
          </span>
        </p>
      )}

      {reveal.done && (
        <>
          <table className="w-fit text-sm">
            <tbody>
              <Deltas label="点棒" names={names} values={outcome.pointDeltas} />
              <Deltas label="祝儀" names={names} values={outcome.chipDeltas} />
            </tbody>
          </table>

          <DiceSection
            view={view}
            names={names}
            menu={menu}
            playback={playback}
            busy={busy}
            send={send}
          />

          {view.phase === "playing" &&
            view.roundPhase === "ended" &&
            !dicePlaying && (
              <div className="flex items-center gap-4">
                {menu.confirm && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => send(menu.confirm!)}
                    className="h-11 rounded border border-cyan-300 bg-cyan-400/25 px-8 text-base font-semibold hover:bg-cyan-400/40 disabled:opacity-50"
                  >
                    確認
                  </button>
                )}
                <p className="text-sm opacity-70">
                  確認済み：
                  {SEATS.filter((seat) => view.confirmed[seat])
                    .map((seat) => names[seat])
                    .join("、") || "なし"}
                </p>
              </div>
            )}
          {children}
        </>
      )}
    </div>
  );
}
