/**
 * The dish spot (step 11, plan §2.7): the share of the view cone a skyline leaves clear, the north counting double; and
 * the clearest spot over a parcel, an open bench beating a north-facing hollow, ties to the one nearest the house.
 */
import { describe, expect, it } from "vitest";
import { SCREEN_CONSTANTS } from "./config";
import { rcToLL } from "./dem";
import { clearShare, dishSpot } from "./dish";
import type { Dem } from "./types";

const K = SCREEN_CONSTANTS.dish;
const flat = (angle: number) => Array.from({ length: 72 }, (_, i) => ({ az: i * 5, angle }));

describe("the dish's view", () => {
  it("open below the cone is all clear; a skyline at its top closes it", () => {
    expect(clearShare(flat(10))).toBe(1);
    expect(clearShare(flat(K.coneDeg))).toBe(1);
    expect(clearShare(flat(90))).toBe(0);
    expect(clearShare(flat(K.coneDeg + (90 - K.coneDeg) / 2))).toBeCloseTo(0.5, 9);
  });

  it("a wall to the north costs twice what the same wall to the south does", () => {
    const wall = (from: number, to: number) =>
      Array.from({ length: 72 }, (_, i) => ({ az: i * 5, angle: i * 5 >= from && i * 5 <= to ? 57.5 : 0 }));
    const north = 1 - clearShare(wall(315, 355)); // 9 directions, all in the northern half
    const south = 1 - clearShare(wall(135, 175));
    expect(north / south).toBeCloseTo(K.northWeight, 9);
  });
});

/** A wide 30 m DEM and a fine 3 m one over the same ground, its height a function of metres east and north. */
function dems(z: (e: number, n: number) => number) {
  const make = (res: number, w: number): Dem => {
    const out = new Float32Array(w * w);
    const half = (w * res) / 2;
    for (let r = 0; r < w; r++)
      for (let c = 0; c < w; c++) out[r * w + c] = z(c * res + res / 2 - half, half - r * res - res / 2);
    return { z: out, w, h: w, x0: 500_000 - half, y0: 4_050_000 + half, res, resY: res, source: "USGS 3DEP" };
  };
  return { dWide: make(30, 201), dFine: make(3, 201) };
}

describe("the parcel's best spot", () => {
  it("an open bench beats a north-facing hollow under a ridge, and the parcel's best is the bench", () => {
    // A ridge 120 m high from 45 to 135 m north of the middle.
    const { dWide, dFine } = dems((_e, n) => (n > 45 && n < 135 ? 1120 : 1000));
    // Candidates are every 10th fine row (30 m): row 170 is 210 m south of the middle, row 90 30 m north of it.
    const BENCH = 170;
    const FOOT = 90;
    const only = (...rows: number[]) =>
      Uint8Array.from({ length: dFine.w * dFine.h }, (_, i) =>
        rows.includes(Math.floor(i / dFine.w)) ? 1 : 0,
      );
    const bench = dishSpot(dFine, only(BENCH), dWide, null)!; // 255 m south of the ridge: under 25°
    const hollow = dishSpot(dFine, only(FOOT), dWide, null)!; // at its foot: the north closed in
    expect(bench.clearShare).toBe(1);
    expect(hollow.clearShare).toBeLessThan(0.9);
    const best = dishSpot(dFine, only(BENCH, FOOT), dWide, null)!;
    expect(best.clearShare).toBe(1);
    expect(best.ll[0]).toBeCloseTo(bench.ll[0], 5);
  });

  it("among spots as clear, the one nearest the house", () => {
    const { dWide, dFine } = dems(() => 1000);
    const inside = new Uint8Array(dFine.w * dFine.h).fill(1);
    // Flat ground: every spot is clear, so the one nearest the house wins.
    const house = rcToLL(dFine, 100, 100);
    const spot = dishSpot(dFine, inside, dWide, house)!;
    expect(spot.clearShare).toBe(1);
    expect(spot.ll[0]).toBeCloseTo(house[0], 5);
    expect(spot.ll[1]).toBeCloseTo(house[1], 5);
  });

  it("no parcel cell: null", () => {
    const { dWide, dFine } = dems(() => 1000);
    expect(dishSpot(dFine, new Uint8Array(dFine.w * dFine.h), dWide, null)).toBeNull();
  });
});
