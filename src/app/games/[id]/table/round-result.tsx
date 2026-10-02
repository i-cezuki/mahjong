import { YAKU_LABELS } from "@/components/labels";
import { Tile } from "@/components/tile";
import type { Seat, WinRecord } from "@/engine";
import type { PlayerView, TableAction } from "@/server/table";
import type { ActionMenu } from "../logic/actions";
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

const DORA_LABELS = [
  ["dora", "ドラ"],
  ["ura", "裏ドラ"],
  ["red", "赤"],
  ["gold", "金"],
  ["flower", "花"],
] as const;

export const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** 公開された手牌と副露。和了牌があれば右に離して置く。 */
function Hand({
  view,
  seat,
  winTile,
}: {
  view: PlayerView;
  seat: Seat;
  winTile: number | null;
}) {
  const hand = view.revealed[seat];
  if (!hand) return null;
  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
      <span className="flex">
        {hand
          .filter((tile) => tile !== winTile)
          .map((tile) => (
            <Tile key={tile} id={tile} width={30} />
          ))}
      </span>
      {winTile !== null && <Tile id={winTile} width={30} />}
      <Melds melds={view.melds[seat]} width={26} />
    </div>
  );
}

function Win({
  view,
  names,
  win,
}: {
  view: PlayerView;
  names: string[];
  win: WinRecord;
}) {
  const result = win.result;
  const bonus = result
    ? DORA_LABELS.filter(([key]) => result.dora[key] > 0).map(
        ([key, label]) => `${label} ${result.dora[key]}`,
      )
    : [];
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
        {result && (
          <span className="ml-auto text-lg font-bold">
            {result.yakuman > 0
              ? result.yakuman > 1
                ? `役満×${result.yakuman}`
                : "役満"
              : `${result.han}翻`}
          </span>
        )}
      </h3>
      <Hand view={view} seat={win.seat} winTile={win.winTile} />
      {result && (
        <p className="flex flex-wrap gap-x-3 text-sm">
          {result.yaku.map((yaku) => (
            <span key={yaku.name}>
              {YAKU_LABELS[yaku.name]}
              {yaku.han < 13 && <span className="opacity-60"> {yaku.han}</span>}
            </span>
          ))}
          {bonus.map((text) => (
            <span key={text} className="text-amber-200">
              {text}
            </span>
          ))}
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
}: {
  view: PlayerView;
  names: string[];
  menu: ActionMenu;
  playback: DicePlayback;
  busy: boolean;
  send: (action: TableAction) => void;
}) {
  const outcome = view.outcome;
  if (!outcome) return null;
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
        <Win key={win.seat} view={view} names={names} win={win} />
      ))}

      {outcome.uraIndicators.length > 0 && (
        <p className="flex items-center gap-2 text-sm">
          <span className="opacity-70">裏ドラ表示</span>
          <span className="flex">
            {outcome.uraIndicators.map((tile) => (
              <Tile key={tile} id={tile} width={24} />
            ))}
          </span>
        </p>
      )}

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
    </div>
  );
}
