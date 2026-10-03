import { Tile } from "@/components/tile";
import { tileOf } from "@/engine";
import type { TileId } from "@/engine";
import type { TableAction } from "@/server/table";
import type { ActionMenu, AutoSettings } from "../logic/actions";

/** ボタンを押したあと、もう1つ選ぶ必要がある状態 */
export type PickMode = "riichi" | "doubleRiichi" | "openRiichi" | "pon" | "kan";

/** リーチの種類を選んで、切る牌を選んでいる */
export function isRiichiMode(mode: PickMode | null): boolean {
  return mode === "riichi" || mode === "doubleRiichi" || mode === "openRiichi";
}

const RIICHI_LABELS: Partial<Record<PickMode, string>> = {
  riichi: "リーチ",
  doubleRiichi: "2倍リーチ",
  openRiichi: "オープンリーチ",
};

const base =
  "flex h-11 min-w-20 items-center justify-center gap-1 rounded border px-4 text-base font-semibold disabled:opacity-50";
const styles = {
  plain: `${base} border-cyan-400/70 bg-cyan-950/60 hover:bg-cyan-900/70`,
  win: `${base} border-amber-300 bg-amber-500/25 text-amber-100 hover:bg-amber-500/40`,
  riichi: `${base} border-pink-400 bg-pink-500/20 text-pink-100 hover:bg-pink-500/35`,
  quiet: `${base} border-foreground/40 bg-background/80 hover:bg-foreground/10`,
};

/** ポン、槓、ロン、ツモ、リーチ、スキップのボタン。できる操作だけを出す。 */
export function ActionBar({
  menu,
  hand,
  mode,
  busy,
  onMode,
  send,
}: {
  menu: ActionMenu;
  hand: readonly TileId[];
  mode: PickMode | null;
  busy: boolean;
  onMode: (mode: PickMode | null) => void;
  send: (action: TableAction) => void;
}) {
  const cancel = (
    <button type="button" className={styles.quiet} onClick={() => onMode(null)}>
      取り消し
    </button>
  );

  if (isRiichiMode(mode)) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-pink-200">
          {RIICHI_LABELS[mode!]}
          ：切る牌を2回タップ
        </span>
        {cancel}
      </div>
    );
  }

  if (mode === "pon") {
    return (
      <div className="flex items-center gap-2">
        {menu.pons.map((action) => (
          <button
            key={action.tiles.join("-")}
            type="button"
            disabled={busy}
            className={styles.plain}
            onClick={() => send(action)}
          >
            {action.tiles.map((tile) => (
              <Tile key={tile} id={tile} width={24} />
            ))}
          </button>
        ))}
        {cancel}
      </div>
    );
  }

  const kans = [...menu.ankans, ...menu.kakans];
  if (mode === "kan") {
    return (
      <div className="flex items-center gap-2">
        {kans.map((action) => {
          const tile =
            action.type === "kakan"
              ? action.tile
              : hand.find((id) => tileOf(id).kind === action.kind);
          return (
            <button
              key={action.type === "kakan" ? action.tile : action.kind}
              type="button"
              disabled={busy}
              className={styles.plain}
              onClick={() => send(action)}
            >
              {tile !== undefined && <Tile id={tile} width={24} />}
              {action.type === "kakan" ? "加槓" : "暗槓"}
            </button>
          );
        })}
        {cancel}
      </div>
    );
  }

  const button = (
    label: string,
    style: string,
    onClick: () => void,
    key = label,
  ) => (
    <button
      key={key}
      type="button"
      disabled={busy}
      className={style}
      onClick={onClick}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-2">
      {kans.length > 0 &&
        button("槓", styles.plain, () =>
          kans.length === 1 ? send(kans[0]!) : onMode("kan"),
        )}
      {menu.minkan &&
        button("槓", styles.plain, () => send(menu.minkan!), "minkan")}
      {menu.pons.length > 0 &&
        button("ポン", styles.plain, () =>
          menu.pons.length === 1 ? send(menu.pons[0]!) : onMode("pon"),
        )}
      {menu.riichiTiles.length > 0 &&
        button("リーチ", styles.riichi, () => onMode("riichi"))}
      {menu.doubleRiichiTiles.length > 0 &&
        button("2倍リーチ", styles.riichi, () => onMode("doubleRiichi"))}
      {menu.openRiichiTiles.length > 0 &&
        button("オープンリーチ", styles.riichi, () => onMode("openRiichi"))}
      {menu.tsumo && button("ツモ", styles.win, () => send(menu.tsumo!))}
      {menu.ron && button("ロン", styles.win, () => send(menu.ron!))}
      {menu.pass && button("スキップ", styles.quiet, () => send(menu.pass!))}
    </div>
  );
}

/** 自動和了と鳴きなしの切り替え */
export function Toggles({
  settings,
  onChange,
}: {
  settings: AutoSettings;
  onChange: (settings: AutoSettings) => void;
}) {
  const toggle = (key: keyof AutoSettings, label: string) => (
    <button
      type="button"
      aria-pressed={settings[key]}
      onClick={() => onChange({ ...settings, [key]: !settings[key] })}
      className={`h-9 rounded border px-3 text-sm ${
        settings[key]
          ? "border-cyan-300 bg-cyan-400/25 font-semibold text-cyan-100"
          : "border-foreground/30 opacity-70"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex gap-2">
      {toggle("autoWin", "自動和了")}
      {toggle("noCall", "鳴きなし")}
    </div>
  );
}
