import type { PerSeat, Seat } from "@/engine";

/** 自分から見た点差（相手の持ち点 − 自分の持ち点）。相手が上ならプラス。 */
export function pointDiffs(
  points: PerSeat<number>,
  self: Seat,
): PerSeat<number> {
  const mine = points[self];
  return [points[0] - mine, points[1] - mine, points[2] - mine];
}
