import { SEATS } from "./wall";
import type { PerSeat, Seat } from "./wall";

const TOP_LINE = 30000;

/** 30000点以上の2着。[下限, 枚数] */
const SECOND_WINNING_ROWS = [
  [40000, 8],
  [35000, 5],
  [30000, 2],
] as const;

/** 30000点未満。[下限, 2着, 3着（2着30000未満）, 3着（2着30000以上）] */
const LOSING_ROWS = [
  [25000, -11, -21, -26],
  [20000, -13, -23, -28],
  [15000, -15, -25, -30],
  [10000, -18, -28, -33],
  [5000, -20, -30, -35],
  [-Infinity, -23, -33, -38],
] as const;

/** 1000点未満の端数は切り上げて行を決める。 */
function roundUp(points: number): number {
  return Math.ceil(points / 1000) * 1000;
}

function losingRow(points: number) {
  return LOSING_ROWS.find(([min]) => points >= min)!;
}

/** 席を1着から順に並べる。同点は起家に近い方が上位。 */
export function rankSeats(points: PerSeat<number>, firstDealer: Seat): Seat[] {
  const distance = (seat: Seat) => (seat - firstDealer + 3) % 3;
  return [...SEATS].sort(
    (a, b) => points[b] - points[a] || distance(a) - distance(b),
  );
}

/**
 * 終局時の持ち点から、支払い表の枚数を席ごとに返す。合計は0。
 * 残った供託は、呼び出す前にトップの持ち点へ加えておくこと。
 */
export function finalPayout(
  points: PerSeat<number>,
  firstDealer: Seat,
): PerSeat<number> {
  const [first, second, third] = rankSeats(points, firstDealer) as [
    Seat,
    Seat,
    Seat,
  ];
  const secondPoints = roundUp(points[second]);
  const thirdPoints = roundUp(points[third]);
  if (thirdPoints >= TOP_LINE) {
    throw new Error("3着が30000点以上の終局はありません");
  }

  const secondAbove = secondPoints >= TOP_LINE;
  const secondChips = secondAbove
    ? SECOND_WINNING_ROWS.find(([min]) => secondPoints >= min)![1]
    : losingRow(secondPoints)[1];
  const thirdChips = losingRow(thirdPoints)[secondAbove ? 3 : 2];

  const result: PerSeat<number> = [0, 0, 0];
  result[second] = secondChips;
  result[third] = thirdChips;
  result[first] = -(secondChips + thirdChips);
  return result;
}
