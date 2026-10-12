/**
 * Follow-up 34 (34-2): lines drawn with the parcel. Measured on the DEM (their length and grades, as a route's are),
 * laid on the grid for the router (a track's cells cost as flat ground, with no earthwork or clearing; an easement's
 * corridor counts as the parcel's own land), and an entrance at the end of a line that leaves a road. On synthetic
 * planes, so the numbers are known.
 */
import { lineString, polygon } from "@turf/turf";
import { describe, expect, it } from "vitest";
import * as UTM from "../geo/utm";
import { DEFAULT_USER_CONFIG, SCREEN_CONSTANTS } from "./config";
import { rcToLL } from "./dem";
import { drawnGrid, insideWithLines, measureLines } from "./drawn";
import { drawnEntrances, routeDriveway, type RouteContext } from "./driveway";
import type { RoadFeature } from "./roads";
import type { Dem, DrawnInput } from "./types";
import { M2FT, type LatLon } from "./util";

const K = SCREEN_CONSTANTS.driveway;
const W = 120,
  H = 120;

/** A plane rising north at `grade` (a fraction), 3 m cells. */
function plane(grade: number): Dem {
  const d: Dem = {
    z: new Float32Array(W * H),
    w: W,
    h: H,
    x0: 500000,
    y0: 4080000,
    res: 3,
    resY: 3,
    source: "USGS 3DEP",
  };
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) d.z[r * W + c] = grade * (H - r) * 3;
  return d;
}

/** The router's view of a plane: `inside` by cell, a side slope of `sideDeg` everywhere, no soils or streams. */
function context(d: Dem, inside: (r: number, c: number) => boolean, sideDeg = 20): RouteContext {
  const n = W * H;
  const ins = new Uint8Array(n);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) ins[r * W + c] = inside(r, c) ? 1 : 0;
  return {
    dFine: d,
    inside: ins,
    slope: new Float32Array(n).fill(sideDeg),
    soilMask: () => new Uint8Array(n),
    flowAcc: () => new Float32Array(n),
    dw: DEFAULT_USER_CONFIG.dw,
  };
}

/** The context with lines drawn: their grid, and their cells counted as the parcel's (as index.ts routeInside). */
function withLines(ctx: RouteContext, lines: DrawnInput[]): RouteContext {
  const drawn = drawnGrid(ctx.dFine, lines);
  return { ...ctx, inside: insideWithLines(ctx.inside, drawn), drawn };
}

const at = (d: Dem, r: number, c: number): LatLon => rcToLL(d, r, c);
const line = (
  d: Dem,
  kind: DrawnInput["kind"],
  pts: [number, number][],
  widthFt: number | null = null,
): DrawnInput => ({
  id: `${kind}-${pts.length}`,
  kind,
  line: pts.map(([r, c]) => at(d, r, c)),
  widthFt,
});

/** The grid's outline as a polygon (every cell inside). */
const gridPolygon = (d: Dem) => {
  const sw = UTM.inv(d.x0, d.y0 - H * 3),
    ne = UTM.inv(d.x0 + W * 3, d.y0);
  return polygon([
    [
      [sw[1], sw[0]],
      [ne[1], sw[0]],
      [ne[1], ne[0]],
      [sw[1], ne[0]],
      [sw[1], sw[0]],
    ],
  ]);
};

describe("a drawn line, measured (owner, 34-1 answer 3)", () => {
  it("straight up a 10% plane: its length, and 10% on average and at its steepest over 30 m", () => {
    const d = plane(0.1);
    const up = line(d, "track", [
      [110, 60],
      [10, 60],
    ]);
    const [m] = measureLines([up], gridPolygon(d), d);
    expect(m!.lengthFt).toBeCloseTo(300 * M2FT, -1);
    expect(m!.gradedFt).toBeGreaterThan(290 * M2FT);
    expect(m!.avgGradePct).toBeCloseTo(10, 1);
    expect(m!.maxGradePct).toBeCloseTo(10, 1);
    expect(m!.outsideFt).toBe(0);
    expect(m!.widthFt).toBeNull();
  });

  it("without a DEM, or off it, only the length; an easement keeps its width; the part outside is measured", () => {
    const d = plane(0.1);
    const across = line(
      d,
      "easement",
      [
        [60, 60],
        [60, 160], // 60 cells (180 m) of it east of the grid
      ],
      40,
    );
    const [noDem] = measureLines([across], gridPolygon(d), null);
    expect(noDem!.avgGradePct).toBeNull();
    expect(noDem!.widthFt).toBe(40);
    const [m] = measureLines([across], gridPolygon(d), d);
    expect(m!.gradedFt).toBeLessThan(200 * M2FT); // only the part on the grid
    expect(m!.avgGradePct).toBeCloseTo(0, 1); // along the contour
    expect(m!.outsideFt).toBeCloseTo(m!.lengthFt - 178.5 * M2FT, -1); // past the grid's edge (cell centre 60 + 59.5)
  });
});

describe("the lines on the grid", () => {
  it("a track marks the cells it passes through; an easement its corridor, its recorded width across", () => {
    const d = plane(0.1);
    const g = drawnGrid(d, [
      line(d, "track", [
        [100, 20],
        [20, 20],
      ]),
      line(
        d,
        "easement",
        [
          [100, 80],
          [20, 80],
        ],
        30,
      ),
    ]);
    const row = (r: number) => [...g.cell.slice(r * W, (r + 1) * W)];
    expect(row(60)[20]).toBe(1);
    expect(g.track[60 * W + 20]).toBe(1);
    // 30 ft is 9.1 m: the cell on the line and those whose centres are within 4.6 m either side (one each).
    expect(row(60).filter((v) => v === 2)).toHaveLength(3);
    expect(g.track[60 * W + 80]).toBe(0);
  });
});

describe("routing with drawn lines (the follow-up's acceptance)", () => {
  it("a route follows a drawn track: cheaper ground, no earthwork or clearing on it, and it names the line", () => {
    // A 6% plane with a 20° side slope everywhere (a cost factor of 2.1): a dog-leg track from the entrance to the site
    // is longer than the straight line, but its cells cost as flat ground.
    const d = plane(0.06);
    const ctx = context(d, () => true);
    const from = at(d, 110, 20),
      to = at(d, 20, 60);
    const opts = { maxGrade: 0.15, wGrade: 1, label: "x" };
    const bare = routeDriveway(ctx, from, to, opts)!;
    const track = line(d, "track", [
      [110, 20],
      [20, 20],
      [20, 60],
    ]);
    const drawn = routeDriveway(withLines(ctx, [track]), from, to, opts)!;
    expect(bare.lines).toEqual([]);
    expect(bare.metrics.drawnFt).toBe(0);
    expect(drawn.lines).toEqual([0]);
    expect(drawn.metrics.drawnFt).toBeGreaterThan(0.8 * drawn.metrics.lengthFt);
    expect(drawn.metrics.lengthFt).toBeGreaterThan(bare.metrics.lengthFt); // it goes the long way round, on the track
    expect(drawn.metrics.earthYd).toBeLessThan(0.2 * bare.metrics.earthYd);
    expect(drawn.metrics.clearAc).toBeLessThan(0.2 * bare.metrics.clearAc);
  });

  it("a drawn easement allows a route kept to the parcel that the boundary would forbid, and it isn't an easement need", () => {
    // The parcel is the north half; the entrance is at the south edge, 40 cells (120 m) of neighbouring land away.
    const d = plane(0.06);
    const ctx = context(d, (r) => r < 60);
    const from = at(d, 100, 60),
      to = at(d, 20, 60);
    const kept = { maxGrade: 0.15, wGrade: 1, label: "x", insideExceptNearStartM: K.leastSteep.entranceM };
    expect(routeDriveway(ctx, from, to, kept)).toBeNull();
    const through = routeDriveway(ctx, from, to, { maxGrade: 0.15, wGrade: 1, label: "x" })!;
    expect(through.needsEasement).toBe(true);
    const easement = line(
      d,
      "easement",
      [
        [100, 60],
        [55, 60],
      ],
      30,
    );
    const rt = routeDriveway(withLines(ctx, [easement]), from, to, kept)!;
    expect(rt).not.toBeNull();
    expect(rt.needsEasement).toBe(false);
    expect(rt.metrics.outsideFt).toBe(0);
    expect(rt.lines).toEqual([0]);
    expect(rt.metrics.drawnFt).toBeGreaterThan(100 * M2FT);
  });
});

describe("an entrance at a drawn line's end (owner: the router can start from its end)", () => {
  const d = plane(0.06);
  const road = (r: number): RoadFeature =>
    lineString(
      [at(d, r, 0), at(d, r, W - 1)].map(([lat, lon]) => [lon, lat]),
      {
        NAME: "Mud Creek Rd",
      },
    ) as unknown as RoadFeature;

  it("one end at a road: the entrance is the other end, marked drawn, with its line", () => {
    const l = line(d, "easement", [
      [115, 60],
      [70, 60],
    ]);
    const [e] = drawnEntrances([l], [road(116)], [], d);
    expect(e).toMatchObject({ source: "drawn", line: 0, name: "the drawn easement" });
    expect(e!.fallback).toBeUndefined();
    expect(e!.ll[0]).toBeCloseTo(at(d, 70, 60)[0], 9);
    // Drawn from the far end towards the road: the same entrance.
    const [back] = drawnEntrances([{ ...l, line: [...l.line].reverse() }], [road(116)], [], d);
    expect(back!.ll).toEqual(e!.ll);
  });

  it("both ends at roads, or neither, or its far end off the grid: no entrance", () => {
    const both = line(d, "track", [
      [115, 60],
      [5, 60],
    ]);
    expect(drawnEntrances([both], [road(116), road(4)], [], d)).toEqual([]);
    const neither = line(d, "track", [
      [80, 60],
      [40, 60],
    ]);
    expect(drawnEntrances([neither], [road(116)], [], d)).toEqual([]);
    const away = line(d, "track", [
      [115, 60],
      [115, 200],
    ]);
    expect(drawnEntrances([away], [road(116)], [], d)).toEqual([]);
  });
});
