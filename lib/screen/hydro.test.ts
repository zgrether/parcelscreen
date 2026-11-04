/**
 * The hydrology (docs/plans/water.md §1, §6) on synthetic grids: delineation on a plane, a valley and a bowl; a pit
 * filled and passed through; the wetness index on a plane, a valley and a flat; flow lines and pond sites.
 */
import { describe, expect, it } from "vitest";
import {
  accumulate,
  d8,
  fillDepressions,
  flowLines,
  maskOutline,
  pondSites,
  upslope,
  wetness,
} from "./hydro";
import { slopeAspect } from "./terrain";
import type { Dem } from "./types";

const W = 60,
  H = 60;
function grid(f: (c: number, r: number) => number, res = 10): Dem {
  const d: Dem = {
    z: new Float32Array(W * H),
    w: W,
    h: H,
    x0: 500000,
    y0: 4060000,
    res,
    resY: res,
    source: "USGS 3DEP",
  };
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) d.z[r * W + c] = f(c, r);
  return d;
}
/** A box of cells, rows r0..r1 and columns c0..c1 inclusive. */
function box(r0: number, r1: number, c0: number, c1: number): Uint8Array {
  const m = new Uint8Array(W * H);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) m[r * W + c] = 1;
  return m;
}
const flow = (d: Dem) => {
  const f = fillDepressions(d.z, d.w, d.h);
  const dir = d8(f, d.w, d.h, d.res, d.resY);
  return { f, dir, acc: accumulate(dir, d.w, d.h) };
};

describe("delineation", () => {
  it("a plane sloping south: the strip of columns above the parcel, exactly", () => {
    // Rows increase southward; the ground falls toward the south edge.
    const d = grid((_c, r) => 100 - r);
    const { dir, acc } = flow(d);
    const target = box(40, 49, 20, 29);
    const up = upslope(dir, d.w, d.h, target, acc);
    expect(up.cells).toBe(40 * 10);
    // It reaches the north edge: the box doesn't close it.
    expect(up.open).toBe(true);
    // The inflow: one of the strip's cells straight above the parcel, each carrying its column's 40 cells.
    expect(up.inflow!.acc).toBe(40);
  });

  it("a valley draining south, the parcel across it: every cell above the parcel, and only those", () => {
    const d = grid((c, r) => 0.3 * Math.abs(c - 29.5) * 10 + (59 - r) * 0.1 * 10);
    const { dir, acc } = flow(d);
    const target = box(40, 49, 0, 59);
    const up = upslope(dir, d.w, d.h, target, acc);
    expect(up.cells).toBe(40 * 60);
    // Most of it arrives down the valley's axis.
    const ic = up.inflow!.cell % W;
    expect(Math.abs(ic - 29.5)).toBeLessThan(2);
  });

  it("a ridge-top parcel gets nothing, and neither does a peak", () => {
    const ridge = grid((c) => 100 - Math.abs(c - 29.5));
    const r = flow(ridge);
    expect(upslope(r.dir, W, H, box(0, 59, 29, 30)).cells).toBe(0);
    const peak = grid((c, rr) => 100 - Math.hypot(c - 29.5, rr - 29.5));
    const p = flow(peak);
    expect(upslope(p.dir, W, H, box(28, 31, 28, 31)).cells).toBe(0);
  });

  it("a pit on the way is filled and passed through, not a dead end", () => {
    const d = grid((c, r) => 100 - r - (r === 20 && c === 25 ? 5 : 0));
    const { dir, f } = flow(d);
    // Raised to its spill point, the lowest neighbour's height (79 m), and no lower.
    expect(f[20 * W + 25]!).toBeGreaterThan(79);
    expect(f[20 * W + 25]!).toBeLessThan(79.01);
    const up = upslope(dir, W, H, box(40, 49, 20, 29));
    expect(up.cells).toBe(400);
  });

  it("an outline around the watershed, on the map", () => {
    const d = grid((_c, r) => 100 - r);
    const { dir } = flow(d);
    const up = upslope(dir, W, H, box(40, 49, 20, 29));
    const g = maskOutline(d, up.mask)!;
    expect(g.type).toBe("Polygon");
    // A rectangle: its corners and the closing point.
    expect((g as { coordinates: number[][][] }).coordinates[0]!.length).toBe(5);
  });
});

describe("the wetness index", () => {
  const twi = (d: Dem) => {
    const { acc } = flow(d);
    return wetness(acc, slopeAspect(d).slope, d.res, d.resY, 0.5);
  };
  it("on a plane: the same across, rising downslope", () => {
    const d = grid((_c, r) => 100 - 0.2 * r * 10);
    const t = twi(d);
    expect(t[30 * W + 10]!).toBeCloseTo(t[30 * W + 40]!, 6);
    expect(t[45 * W + 30]!).toBeGreaterThan(t[15 * W + 30]!);
  });
  it("a valley's floor reads wetter than its sides", () => {
    const d = grid((c, r) => 0.3 * Math.abs(c - 29.5) * 10 + (59 - r));
    const t = twi(d);
    expect(t[40 * W + 30]!).toBeGreaterThan(t[40 * W + 10]! + 2);
  });
  it("a flat gets the floor slope: very wet, but finite", () => {
    const t = twi(grid(() => 100));
    const v = t[30 * W + 30]!;
    expect(Number.isFinite(v)).toBe(true);
  });
});

describe("flow lines and pond sites", () => {
  // A V valley, steeper upstream.
  const d = grid((c, r) => 0.3 * Math.abs(c - 29.5) * 10 + (r < 40 ? (59 - r) * 1.5 : (59 - r) * 0.3));
  const { dir, acc } = flow(d);
  // A valley with a flat floor 8 cells wide, gentle below row 40 and steep above it.
  const floor = grid(
    (c, r) => 0.3 * Math.max(0, Math.abs(c - 29.5) - 4) * 10 + (r < 40 ? (59 - r) * 1.5 : (59 - r) * 0.3),
  );
  const ff = flow(floor);
  it("the valley's axis is a flow line; the side slopes aren't", () => {
    const lines = flowLines(dir, acc, W, H, 50);
    expect(lines.length).toBeGreaterThan(0);
    const longest = lines.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
    const cols = longest.cells.map((i) => i % W);
    expect(cols.every((c) => Math.abs(c - 29.5) < 2)).toBe(true);
  });
  it("a pond site on the gentle floor, where the most water gathers", () => {
    const slope = slopeAspect(floor).slope;
    const sites = pondSites(floor, ff.acc, slope, new Uint8Array(W * H).fill(1), {
      minCells: 100,
      maxCells: 1e9,
      maxSlopeDeg: 5,
      apartM: 100,
      n: 3,
    });
    expect(sites.length).toBeGreaterThan(0);
    const r = (sites[0]!.cell / W) | 0;
    expect(r).toBeGreaterThanOrEqual(40);
    expect(Math.abs((sites[0]!.cell % W) - 29.5)).toBeLessThan(5);
    // Three sites at most, each 100 m from the others.
    expect(sites.length).toBeLessThanOrEqual(3);
  });
});
