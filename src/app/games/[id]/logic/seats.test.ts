import { describe, expect, it } from "vitest";
import { seatLayout } from "./seats";

describe("seatLayout", () => {
  it("次の手番の人を右、その次の人を左に置く", () => {
    expect(seatLayout(0)).toEqual({ self: 0, right: 1, left: 2 });
    expect(seatLayout(1)).toEqual({ self: 1, right: 2, left: 0 });
    expect(seatLayout(2)).toEqual({ self: 2, right: 0, left: 1 });
  });
});
