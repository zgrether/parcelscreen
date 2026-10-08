import { centroid, polygon, feature } from "@turf/turf";
import { describe, expect, it } from "vitest";
import { differences } from "../../test/support/compare";
import { FIXTURE_SLUGS, loadFixture } from "../../test/support/fixtures";
import { fixtureParcel } from "../../test/support/scenarios";
import { expectedOf } from "../../test/support/expected";
import { createHttpClient } from "../http";
import { DEFAULT_ENDPOINTS } from "./config";
import { inv } from "../geo/utm";
import { DemCache, fetchParcelDems, rcToLL, rcToUTM } from "./dem";
import { insideMask, insideMasks, slopeAspect, terrainFlags, terrainStats, valleyFloor } from "./terrain";
import type { Dem } from "./types";
import type { LatLon } from "./util";

const grid = (f: (x: number, y: number) => number, w = 9, h = 9): Dem => {
  const d: Dem = {
    z: new Float32Array(w * h),
    w,
    h,
    x0: 520000,
    y0: 4080000,
    res: 3,
    resY: 3,
    source: "USGS 3DEP",
  };
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const [x, y] = rcToUTM(d, r, c);
      d.z[r * w + c] = f(x, y);
    }
  return d;
};

describe("slopeAspect on synthetic planes", () => {
  const atan10 = (Math.atan(0.1) * 180) / Math.PI; // 5.7106°

  it("a 10% plane falling to the south faces 180°", () => {
    const { slope, aspect } = slopeAspect(grid((_x, y) => 0.1 * (y - 4079000)));
    expect(slope[40]).toBeCloseTo(atan10, 4);
    expect(aspect[40]).toBeCloseTo(180, 6);
  });

  it("a 10% plane falling to the east faces 90°, to the west 270°, to the north 0°", () => {
    expect(slopeAspect(grid((x) => -0.1 * (x - 520000))).aspect[40]).toBeCloseTo(90, 6);
    expect(slopeAspect(grid((x) => 0.1 * (x - 520000))).aspect[40]).toBeCloseTo(270, 6);
    expect(slopeAspect(grid((_x, y) => -0.1 * (y - 4079000))).aspect[40]! % 360).toBeCloseTo(0, 6);
  });

  it("uses one-sided differences at the edges and NaN for no-data", () => {
    const d = grid((x) => -0.1 * (x - 520000));
    d.z[40] = NaN;
    const { slope, aspect } = slopeAspect(d);
    expect(slope[40]).toBeNaN();
    expect(aspect[40]).toBeNaN();
    // Edge cells: the clamped neighbour is the cell itself, so (z[1] − z[0]) / (2·res) halves the gradient.
    expect(slope[0]).toBeCloseTo((Math.atan(0.05) * 180) / Math.PI, 6);
  });
});

describe("insideMask and valleyFloor", () => {
  it("marks the cells whose centre is inside the polygon", () => {
    const d = grid(() => 0, 10, 10);
    // A box along the UTM cell edges of rows 2–7, cols 2–7 (the grid isn't axis-aligned in lat/lon).
    const corner = (x: number, y: number) => {
      const [lat, lon] = inv(x, y);
      return [lon, lat];
    };
    const xW = d.x0 + 2 * d.res,
      xE = d.x0 + 8 * d.res,
      yN = d.y0 - 2 * d.resY,
      yS = d.y0 - 8 * d.resY;
    const box = polygon([[corner(xW, yS), corner(xE, yS), corner(xE, yN), corner(xW, yN), corner(xW, yS)]]);
    const m = insideMask(d, box);
    expect(m.reduce((a, b) => a + b, 0)).toBe(36); // rows 2–7 × cols 2–7
    expect(m[2 * 10 + 2]).toBe(1);
    expect(m[1 * 10 + 2]).toBe(0);
  });

  it("finds the lowest ground near the centroid on the wide grid, skipping no-data", () => {
    const d = grid((x, y) => x - 520000 + (4080000 - y), 30, 30);
    d.z[0] = NaN;
    const centre = rcToLL(d, 15, 15) as LatLon;
    // The lowest cell (row 0, col 0) is no-data; the next lowest are its neighbours at 1.5 + 4.5 m.
    expect(valleyFloor(d, centre)).toBeCloseTo(6, 6);
  });
});

// The fixture check: DEMs replayed from the recording, run through the port, against the prototype.
describe.each(FIXTURE_SLUGS)("terrain on %s vs the prototype", (slug) => {
  it("matches terrain.*, valley floor and the slope flag", async () => {
    const fx = loadFixture(slug);
    const golden = expectedOf(fx.slug, "run");
    // The parcel as the app screens it: for Grayson, both parts with the strip between them (follow-up 29).
    const input = await fixtureParcel(slug);
    const parcel = polygon(input.polygon.coordinates);
    const deps = {
      http: createHttpClient({ env: "node", fetchImpl: fx.replayFetch() }),
      endpoints: DEFAULT_ENDPOINTS,
      cache: new DemCache(),
    };
    const { dFine, dWide } = await fetchParcelDems(parcel, 3, deps);
    const { slope } = slopeAspect(dFine);
    const { own: inside } = insideMasks(dFine, parcel, input.ownLand ? feature(input.ownLand) : undefined);
    const [lon, lat] = centroid(parcel).geometry.coordinates as [number, number];
    const vf = valleyFloor(dWide, [lat, lon]);
    const stats = terrainStats(dFine, slope, inside, vf);

    const expected: Partial<NonNullable<typeof golden.terrain>> = { ...golden.terrain! };
    delete expected.diag; // filled in by the sites step (step 6)
    expect(differences(stats, expected)).toEqual([]);
    expect(golden.demSource).toBe(dFine.source);

    const p90Flag = terrainFlags(stats.slopeP90Deg)[0];
    if (p90Flag) expect(golden.flags).toContainEqual(p90Flag);
    else expect(golden.flags.some((f) => f.t.startsWith("90th-percentile slope"))).toBe(false);
  });
});
