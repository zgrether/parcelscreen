/**
 * The long view (step 11, plan §2.4) from a traced skyline, on synthetic DEMs: a ridge-top open all round, a hollow
 * closed in, and a valley opening one way; the 6+ km cap and the direction.
 */
import { describe, expect, it } from "vitest";
import { horizonProfile } from "./sun";
import type { Dem } from "./types";
import { viewOf } from "./view";

/** A 30 m DEM, 401 × 401 cells (12 km square), its height a function of metres east and north of the centre. */
function dem(z: (e: number, n: number) => number): Dem {
  const res = 30;
  const w = 401;
  const out = new Float32Array(w * w);
  for (let r = 0; r < w; r++)
    for (let c = 0; c < w; c++) out[r * w + c] = z((c - 200) * res, (200 - r) * res);
  return { z: out, w, h: w, x0: 0, y0: 0, res, resY: res, source: "USGS 3DEP" };
}
const at = (d: Dem) => viewOf(horizonProfile(d, 200, 200, 5, 6000), d, 200, 200);

describe("the long view", () => {
  it("a ridge-top sees past the profile all round: 100% open, 6+ km", () => {
    const v = at(dem((e, n) => 1000 - Math.hypot(e, n) * 0.2));
    expect(v).toEqual({ longestKm: 6, past: true, openShare: 1, dirDeg: null });
  });

  it("a hollow is closed in: its rim 600 m out ends every view", () => {
    const v = at(dem((e, n) => (Math.hypot(e, n) > 600 ? 1100 : 1000)));
    expect(v.openShare).toBe(0);
    expect(v.dirDeg).toBeNull();
    expect(v.past).toBe(false);
    expect(v.longestKm).toBeLessThan(1);
  });

  it("a valley opening to the east: open that way, and its direction", () => {
    // Walls 1 km north and south; open east and west to 2 km west, where a wall closes it.
    const v = at(dem((e, n) => (Math.abs(n) > 1000 || e < -2000 ? 1200 : 1000)));
    expect(v.openShare).toBeGreaterThan(0);
    expect(v.openShare).toBeLessThan(0.5);
    expect(v.dirDeg).toBe(90);
    expect(v.past).toBe(true);
  });
});
