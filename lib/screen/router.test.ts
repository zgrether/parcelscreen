/**
 * The driveway router's search (A4b PR B; owner, #91 review and its answers, 2026-10-10), on synthetic terrain:
 * bends within the switchback window, landings as graded benches with their minimum leg, the side-slope limit, the
 * ground under a long move, and the smoothing that keeps the benches.
 */
import { describe, expect, it } from "vitest";
import { SCREEN_CONSTANTS } from "./config";
import { MOVES, moveTable, searchMany, smoothPath, type SearchGrid } from "./router";
import type { Dem } from "./types";
import { M2FT } from "./util";

const K = SCREEN_CONSTANTS.driveway;
const DEG = Math.PI / 180;

/** A grid of 3 m cells with elevations from (row, col), and every cell inside the parcel. */
function grid(W: number, H: number, zOf: (r: number, c: number) => number, slopeDeg: number): SearchGrid {
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
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) d.z[r * W + c] = zOf(r, c);
  return {
    d,
    inside: new Uint8Array(W * H).fill(1),
    slope: new Float32Array(W * H).fill(slopeDeg),
    soil: new Uint8Array(W * H),
    acc: new Float32Array(W * H),
  };
}

describe("the moves and the landings", () => {
  const T = moveTable(3, 3);
  const ang = MOVES.map(([dr, dc]) => Math.atan2(-dr, dc));
  const turn = (a: number, b: number) => {
    let t = Math.abs(ang[b]! - ang[a]!) % (2 * Math.PI);
    if (t > Math.PI) t = 2 * Math.PI - t;
    return t;
  };

  it("has 32 directions, and an ordinary bend turns under switchbackTurnDeg across twice turnWindowM", () => {
    expect(MOVES.length).toBe(32);
    const bendRadius = (2 * K.turnWindowM) / (K.switchbackTurnDeg * DEG);
    for (let a = 0; a < 32; a++)
      for (const b of T.next[a]!) {
        expect(turn(a, b) / DEG).toBeLessThanOrEqual(K.switchbackTurnDeg);
        expect(turn(a, b)).toBeLessThanOrEqual((T.len[a]! + T.len[b]!) / 2 / bendRadius + 1e-9);
      }
    // Straight on is always allowed; the start may go any way.
    for (let a = 0; a < 32; a++) expect(T.next[a]).toContain(a);
    expect(T.next[32]!.length).toBe(32);
  });

  it("builds every sharper turn as a landing: a 30 ft arc, then a leg of at least 100 ft", () => {
    const R = K.switchbackRadiusFt / M2FT,
      leg = K.minLegFt / M2FT;
    for (let a = 0; a < 32; a++) {
      const sharper = [...Array(32).keys()].filter((b) => turn(a, b) / DEG > K.switchbackTurnDeg);
      expect(new Set(T.landings[a]!.map((L) => L.b))).toEqual(new Set(sharper));
      for (const L of T.landings[a]!) {
        expect(L.turnDeg).toBeGreaterThan(K.switchbackTurnDeg);
        // The arc's points sit on a circle of the radius, centred beside the turn's cell.
        const pts = [...L.r.slice(0, L.arcEnd + 1)].map((r, k) => [L.c[k]! * 3, -r * 3] as const);
        const [ux, uy] = [Math.cos(ang[a]!), Math.sin(ang[a]!)];
        const centres = [-1, 1].map((s) => [-s * R * uy, s * R * ux] as const);
        const off = Math.min(
          ...centres.map(([cx, cy]) =>
            Math.max(...pts.map(([x, y]) => Math.abs(Math.hypot(x - cx, y - cy) - R))),
          ),
        );
        expect(off).toBeLessThan(1e-6);
        expect(L.lenM - L.arcLen).toBeGreaterThanOrEqual(leg - 1e-9);
      }
    }
  });
});

describe("switchbacks on a 30% plane", () => {
  // Rising north at 30%: a 10% road can only climb it by switching back.
  const W = 70,
    H = 90;
  const plane = (slopeDeg: number) => grid(W, H, (r) => 0.3 * (H - r) * 3, slopeDeg);
  const from: [number, number] = [H - 3, 35],
    to = 6 * W + 35;
  const opts = { maxGrade: 0.1, wGrade: 1 };

  it("every switchback is a landing, at least 100 ft from the last, on a bench within the limit and 3 m of the ground", () => {
    const g = plane(Math.atan(0.3) / DEG);
    const [path] = searchMany(g, [from], [to], opts);
    expect(path).toBeTruthy();
    const p = path!.pts;
    expect(path!.landings.length).toBeGreaterThan(1);
    const cum = [0];
    for (let i = 1; i < p.length; i++)
      cum.push(cum[i - 1]! + Math.hypot((p[i]!.c - p[i - 1]!.c) * 3, (p[i]!.r - p[i - 1]!.r) * 3));
    const L = path!.landings;
    for (let i = 1; i < L.length; i++)
      expect((cum[L[i]!.from]! - cum[L[i - 1]!.to]!) * M2FT).toBeGreaterThanOrEqual(K.minLegFt - 1e-6);
    for (const x of L) {
      expect(x.turnDeg).toBeGreaterThan(K.switchbackTurnDeg);
      for (let k = x.from + 1; k <= x.end; k++) {
        const a = p[k - 1]!,
          b = p[k]!;
        const run = Math.hypot((b.c - a.c) * 3, (b.r - a.r) * 3);
        expect(Math.abs(b.zd! - (a.zd ?? a.z)) / run).toBeLessThanOrEqual(opts.maxGrade + 1e-9);
        expect(Math.abs(b.z - b.zd!)).toBeLessThanOrEqual(K.landingCutFillM + 1e-9);
      }
    }
    // The smoothing keeps every landing point, and each straight piece holds the limit end to end.
    const s = smoothPath(path!, opts.maxGrade, g.d);
    for (const q of p) if (q.zd !== undefined) expect(s).toContain(q);
    for (let i = 1; i < s.length; i++) {
      const run = Math.hypot((s[i]!.c - s[i - 1]!.c) * 3, (s[i]!.r - s[i - 1]!.r) * 3);
      if (run)
        expect(Math.abs((s[i]!.zd ?? s[i]!.z) - (s[i - 1]!.zd ?? s[i - 1]!.z)) / run).toBeLessThanOrEqual(
          0.1 + 1e-9,
        );
    }
  });

  it("builds no landing where the side slope is over the limit, so this plane has no route at 10%", () => {
    expect(searchMany(plane(K.landingMaxSideSlopeDeg + 5), [from], [to], opts)[0]).toBeNull();
    // With the limit lifted for the run, the same ground is routed again.
    expect(
      searchMany(plane(K.landingMaxSideSlopeDeg + 5), [from], [to], {
        ...opts,
        landingMaxSideSlopeDeg: 90,
      })[0],
    ).toBeTruthy();
  });
});

describe("the ground under a long move", () => {
  // Flat ground with a wall one cell thick down column 30: no one-cell move can climb onto it within 10%, but a
  // knight's move steps across, if the wall stands within moveCutFillM of the move's straight line.
  const W = 61,
    H = 40;
  const wall = (height: number) => grid(W, H, (_, c) => (c === 30 ? height : 0), 0);
  const route = (height: number) =>
    searchMany(wall(height), [[20, 25]], [20 * W + 35], { maxGrade: 0.1, wGrade: 1 })[0];

  it(`steps across a wall lower than ${K.moveCutFillM} m, and not across a higher one`, () => {
    expect(route(K.moveCutFillM - 0.5)).toBeTruthy();
    expect(route(K.moveCutFillM + 0.5)).toBeNull(); // the wall runs the whole grid: no way round
  });
});

describe("several entrances", () => {
  it("routes each target from whichever entrance is cheaper, and says which", () => {
    const g = grid(60, 30, () => 0, 0);
    const [a, b] = searchMany(
      g,
      [
        [15, 2],
        [15, 57],
      ],
      [15 * 60 + 10, 15 * 60 + 50],
      { maxGrade: 0.1, wGrade: 1 },
    );
    expect(a!.source).toBe(0);
    expect(b!.source).toBe(1);
  });
});
