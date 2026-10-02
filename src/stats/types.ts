/**
 * 集計の計算方法の版番号。項目や数え方を変えたら1つ上げる。
 * 定期実行が、古い版で計算した対局を計算し直す。
 */
export const STATS_VERSION = 1;

/**
 * 1対局の1人分の集計値。すべて回数か合計で、率や平均は画面に出すときに計算する。
 * 定義は docs/SPEC.md の「集計」を参照。
 */
export interface GameStats {
  /** 参加した局の数 */
  rounds: number;

  // ---- 和了 ----
  wins: number;
  tsumoWins: number;
  /** 和了で動いた自分の点棒の合計（供託と本場を含む。逆ポッチは負） */
  winPoints: number;
  /** 和了巡目の合計 */
  winTurns: number;

  // ---- 放銃 ----
  dealIns: number;
  dealInPoints: number;
  /** 放銃時のシャンテン数の合計 */
  dealInShanten: number;
  dealInTenpai: number;
  dealInOneAway: number;
  /** 2向聴以上での放銃 */
  dealInFar: number;
  /** 和了者がリーチしていた放銃 */
  dealInToRiichi: number;
  /** 自分がリーチ中だった放銃 */
  dealInWhileRiichi: number;
  /** 自分がポンか大明槓をしていた放銃 */
  dealInWhileOpen: number;

  // ---- リーチ ----
  /** 成立したリーチ */
  riichi: number;
  riichiGood: number;
  riichiWins: number;
  riichiIppatsu: number;
  /** 裏ドラが1枚以上乗った和了 */
  riichiUra: number;
  /** リーチ巡目の合計 */
  riichiTurns: number;
  /** 追いかけリーチ */
  riichiChase: number;
  doubleStake: number;
  doubleStakeWins: number;

  // ---- 副露、流局 ----
  /** ポンか大明槓をした局 */
  callRounds: number;
  draws: number;
  drawTenpai: number;

  // ---- このルール特有 ----
  diceChances: number;
  diceHits: number;
  /** サイコロで動いた自分の祝儀（払った分は負） */
  diceChips: number;
  pocchiWins: number;
  yakuman: number;
  tobiMade: number;
  tobiSuffered: number;
  /** 和了で受け取った祝儀の内訳 */
  chipsRed: number;
  chipsGold: number;
  chipsUra: number;
  chipsIppatsu: number;
  chipsYakuman: number;
}

export const STAT_KEYS = [
  "rounds",
  "wins",
  "tsumoWins",
  "winPoints",
  "winTurns",
  "dealIns",
  "dealInPoints",
  "dealInShanten",
  "dealInTenpai",
  "dealInOneAway",
  "dealInFar",
  "dealInToRiichi",
  "dealInWhileRiichi",
  "dealInWhileOpen",
  "riichi",
  "riichiGood",
  "riichiWins",
  "riichiIppatsu",
  "riichiUra",
  "riichiTurns",
  "riichiChase",
  "doubleStake",
  "doubleStakeWins",
  "callRounds",
  "draws",
  "drawTenpai",
  "diceChances",
  "diceHits",
  "diceChips",
  "pocchiWins",
  "yakuman",
  "tobiMade",
  "tobiSuffered",
  "chipsRed",
  "chipsGold",
  "chipsUra",
  "chipsIppatsu",
  "chipsYakuman",
] as const satisfies readonly (keyof GameStats)[];

export function emptyStats(): GameStats {
  return Object.fromEntries(
    STAT_KEYS.map((key) => [key, 0]),
  ) as unknown as GameStats;
}
