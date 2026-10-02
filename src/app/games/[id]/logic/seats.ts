import type { Seat } from "@/engine";

/** 自分から見た席の並び。下家（次の手番の人）が右、上家が左。 */
export interface SeatLayout {
  self: Seat;
  right: Seat;
  left: Seat;
}

export function seatLayout(self: Seat): SeatLayout {
  return {
    self,
    right: ((self + 1) % 3) as Seat,
    left: ((self + 2) % 3) as Seat,
  };
}
