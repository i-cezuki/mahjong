import { ratio } from "./summary";
import type { PlayerTotals } from "./summary";

/*
 * 成績の画面に出す項目。名前、分類、計算、書式をここにまとめる。
 * 定義は docs/SPEC.md の「集計」と同じにする。
 */

export const METRIC_GROUPS = [
  "基本",
  "局ごとの基本",
  "リーチ",
  "放銃",
  "このルール特有",
] as const;
export type MetricGroup = (typeof METRIC_GROUPS)[number];

/** count=整数、signed=符号つきの整数、percent=％（小数第1位）、decimal=小数第2位、round=四捨五入した整数 */
export type MetricFormat = "count" | "signed" | "percent" | "decimal" | "round";

export interface Metric {
  key: string;
  label: string;
  group: MetricGroup;
  /** 全員を並べる一覧にも出す */
  main: boolean;
  format: MetricFormat;
  value: (totals: PlayerTotals) => number | null;
}

type Row = [
  key: string,
  label: string,
  format: MetricFormat,
  main: boolean,
  value: Metric["value"],
];

const group = (name: MetricGroup, rows: Row[]): Metric[] =>
  rows.map(([key, label, format, main, value]) => ({
    key,
    label,
    group: name,
    main,
    format,
    value,
  }));

export const METRICS: readonly Metric[] = [
  ...group("基本", [
    ["games", "対局数", "count", true, (t) => t.games],
    ["avgRank", "平均順位", "decimal", true, (t) => ratio(t.rankSum, t.games)],
    [
      "firstRate",
      "1位率",
      "percent",
      true,
      (t) => ratio(t.rankCounts[0], t.games),
    ],
    [
      "secondRate",
      "2位率",
      "percent",
      true,
      (t) => ratio(t.rankCounts[1], t.games),
    ],
    [
      "thirdRate",
      "3位率",
      "percent",
      true,
      (t) => ratio(t.rankCounts[2], t.games),
    ],
    ["score", "通算スコア", "signed", true, (t) => t.score],
    ["chips", "通算祝儀", "signed", true, (t) => t.chips],
    [
      "avgPoints",
      "平均持ち点",
      "round",
      false,
      (t) => ratio(t.points, t.games),
    ],
  ]),
  ...group("局ごとの基本", [
    ["rounds", "局数", "count", false, (t) => t.stats.rounds],
    [
      "winRate",
      "和了率",
      "percent",
      true,
      (t) => ratio(t.stats.wins, t.stats.rounds),
    ],
    [
      "dealInRate",
      "放銃率",
      "percent",
      true,
      (t) => ratio(t.stats.dealIns, t.stats.rounds),
    ],
    [
      "riichiRate",
      "リーチ率",
      "percent",
      true,
      (t) => ratio(t.stats.riichi, t.stats.rounds),
    ],
    [
      "callRate",
      "副露率",
      "percent",
      true,
      (t) => ratio(t.stats.callRounds, t.stats.rounds),
    ],
    [
      "tsumoRate",
      "ツモ率",
      "percent",
      false,
      (t) => ratio(t.stats.tsumoWins, t.stats.wins),
    ],
    [
      "drawTenpaiRate",
      "流局時聴牌率",
      "percent",
      false,
      (t) => ratio(t.stats.drawTenpai, t.stats.draws),
    ],
    [
      "avgWinPoints",
      "平均和了点",
      "round",
      true,
      (t) => ratio(t.stats.winPoints, t.stats.wins),
    ],
    [
      "avgDealInPoints",
      "平均放銃点",
      "round",
      true,
      (t) => ratio(t.stats.dealInPoints, t.stats.dealIns),
    ],
    [
      "avgWinTurn",
      "平均和了巡目",
      "decimal",
      false,
      (t) => ratio(t.stats.winTurns, t.stats.wins),
    ],
  ]),
  ...group("リーチ", [
    [
      "riichiGoodRate",
      "リーチ時良形率",
      "percent",
      true,
      (t) => ratio(t.stats.riichiGood, t.stats.riichi),
    ],
    [
      "riichiBadRate",
      "リーチ時愚形率",
      "percent",
      false,
      (t) => ratio(t.stats.riichi - t.stats.riichiGood, t.stats.riichi),
    ],
    [
      "riichiWinRate",
      "リーチ後和了率",
      "percent",
      false,
      (t) => ratio(t.stats.riichiWins, t.stats.riichi),
    ],
    [
      "riichiDealInRate",
      "リーチ後放銃率",
      "percent",
      false,
      (t) => ratio(t.stats.dealInWhileRiichi, t.stats.riichi),
    ],
    [
      "ippatsuRate",
      "一発率",
      "percent",
      false,
      (t) => ratio(t.stats.riichiIppatsu, t.stats.riichiWins),
    ],
    [
      "uraRate",
      "裏ドラ率",
      "percent",
      false,
      (t) => ratio(t.stats.riichiUra, t.stats.riichiWins),
    ],
    [
      "avgRiichiTurn",
      "平均リーチ巡目",
      "decimal",
      false,
      (t) => ratio(t.stats.riichiTurns, t.stats.riichi),
    ],
    [
      "chaseRate",
      "追いかけリーチ率",
      "percent",
      false,
      (t) => ratio(t.stats.riichiChase, t.stats.riichi),
    ],
    [
      "doubleStake",
      "2倍リーチの回数",
      "count",
      false,
      (t) => t.stats.doubleStake,
    ],
    [
      "doubleStakeWinRate",
      "2倍リーチ和了率",
      "percent",
      false,
      (t) => ratio(t.stats.doubleStakeWins, t.stats.doubleStake),
    ],
  ]),
  ...group("放銃", [
    [
      "avgDealInShanten",
      "放銃時平均シャンテン数",
      "decimal",
      true,
      (t) => ratio(t.stats.dealInShanten, t.stats.dealIns),
    ],
    [
      "dealInTenpaiRate",
      "聴牌での放銃",
      "percent",
      false,
      (t) => ratio(t.stats.dealInTenpai, t.stats.dealIns),
    ],
    [
      "dealInOneAwayRate",
      "1向聴での放銃",
      "percent",
      false,
      (t) => ratio(t.stats.dealInOneAway, t.stats.dealIns),
    ],
    [
      "dealInFarRate",
      "2向聴以上での放銃",
      "percent",
      false,
      (t) => ratio(t.stats.dealInFar, t.stats.dealIns),
    ],
    [
      "dealInToRiichiRate",
      "リーチ者への放銃",
      "percent",
      false,
      (t) => ratio(t.stats.dealInToRiichi, t.stats.dealIns),
    ],
    [
      "dealInWhileRiichiRate",
      "リーチ中の放銃",
      "percent",
      false,
      (t) => ratio(t.stats.dealInWhileRiichi, t.stats.dealIns),
    ],
    [
      "dealInWhileOpenRate",
      "副露中の放銃",
      "percent",
      false,
      (t) => ratio(t.stats.dealInWhileOpen, t.stats.dealIns),
    ],
  ]),
  ...group("このルール特有", [
    [
      "diceChances",
      "サイコロチャンス",
      "count",
      false,
      (t) => t.stats.diceChances,
    ],
    ["diceHits", "サイコロの当たり", "count", false, (t) => t.stats.diceHits],
    ["diceChips", "サイコロの祝儀", "signed", false, (t) => t.stats.diceChips],
    ["pocchiWins", "ポッチでの和了", "count", false, (t) => t.stats.pocchiWins],
    ["yakuman", "役満", "count", false, (t) => t.stats.yakuman],
    ["tobiMade", "飛ばした回数", "count", false, (t) => t.stats.tobiMade],
    ["tobiSuffered", "飛んだ回数", "count", false, (t) => t.stats.tobiSuffered],
    ["chipsRed", "祝儀：赤", "count", false, (t) => t.stats.chipsRed],
    ["chipsGold", "祝儀：金", "count", false, (t) => t.stats.chipsGold],
    ["chipsUra", "祝儀：裏ドラ", "count", false, (t) => t.stats.chipsUra],
    ["chipsIppatsu", "祝儀：一発", "count", false, (t) => t.stats.chipsIppatsu],
    ["chipsYakuman", "祝儀：役満", "count", false, (t) => t.stats.chipsYakuman],
  ]),
];

export function formatMetric(
  format: MetricFormat,
  value: number | null,
): string {
  if (value === null) return "—";
  switch (format) {
    case "count":
      return String(value);
    case "signed":
      return value > 0 ? `+${value}` : String(value);
    case "percent":
      return `${(value * 100).toFixed(1)}%`;
    case "decimal":
      return value.toFixed(2);
    case "round":
      return String(Math.round(value));
  }
}
