import { centroid, polygon, feature } from "@turf/turf";
import { describe, expect, it } from "vitest";
import { differences } from "../../test/support/compare";
import { FIXTURE_SLUGS, loadFixture } from "../../test/support/fixtures";
import { fixtureParcel } from "../../test/support/scenarios";
import { expectedOf } from "../../test/support/expected";
import { createHttpClient } from "../http";
import { DEFAULT_ENDPOINTS, DEFAULT_USER_CONFIG } from "./config";
import { DemCache, fetchParcelDems } from "./dem";
import { aspectScore, components, findSites, frostCurve, siteFlags, siteResults } from "./sites";
import { SCREEN_CONSTANTS } from "./config";
import { insideMasks, slopeAspect, terrainFlags, valleyFloor } from "./terrain";
import type { Dem } from "./types";
import { inv } from "../geo/utm";
import { lerp } from "./util";

/** A w×h grid of 10 m cells (0.0247 ac each) with the given scores. */
const scored = (rows: string[]): { d: Dem; score: Float32Array } => {
  const h = rows.length,
    w = rows[0]!.length;
  const d: Dem = {
    z: new Float32Array(w * h),
    w,
    h,
    x0: 500000,
    y0: 4080000,
    res: 10,
    resY: 10,
    source: "USGS 3DEP",
  };
  const score = new Float32Array(w * h);
  rows.forEach((row, r) =>
    [...row].forEach((ch, c) => (score[r * w + c] = ch === "#" ? 80 : ch === "+" ? 50 : 0)),
  );
  return { d, score };
};

describe("components", () => {
  it("labels 4-connected patches, largest first; diagonal neighbours don't connect", () => {
    const { d, score } = scored(["##..#", "##...", "...#.", "....#"]);
    const { comps, label } = components(d, score, 60, 0);
    expect(comps.map((c) => c.cells.length)).toEqual([4, 1, 1, 1]);
    expect(label[0]).toBe(label[6]); // (0,0) and (1,1) are one patch
    expect(label[13]).not.toBe(label[19]); // (2,3) and (3,4) only touch diagonally
  });

  it("drops patches under the minimum area, marking them −1", () => {
    const { d, score } = scored(["##..#", "##..."]);
    const cell = (10 * 10) / 4046.86;
    const { comps, label } = components(d, score, 60, 2 * cell); // needs ≥ 2 cells
    expect(comps).toHaveLength(1);
    expect(label[4]).toBe(-1);
  });

  it("skips cells already labelled in another grid (shelves exclude house sites)", () => {
    const { d, score } = scored(["##++", "##++"]);
    const house = components(d, score, 60, 0);
    const shelves = components(d, score, 45, 0, house.label);
    expect(shelves.comps).toHaveLength(1);
    expect(shelves.comps[0]!.cells.sort((a, b) => a - b)).toEqual([2, 3, 6, 7]);
  });

  it("treats NaN as below every threshold", () => {
    const { d, score } = scored(["##"]);
    score[1] = NaN;
    expect(components(d, score, 60, 0).comps[0]!.cells).toEqual([0]);
  });
});

describe("cell scores", () => {
  it("aspect: 100 on near-flat ground, full credit within 30° of 165°, 40 facing away", () => {
    expect(aspectScore(2.9, 0)).toBe(100);
    expect(aspectScore(10, 165)).toBe(100);
    expect(aspectScore(10, 195)).toBe(100);
    expect(aspectScore(10, 345)).toBe(40);
    expect(aspectScore(10, 75)).toBe(65); // 90° off
  });

  it("frost: 40 in the pocket, 100 from the thermal belt (80 ft) to 400 ft, 75 by 900 ft", () => {
    const f = frostCurve(SCREEN_CONSTANTS.suitability.frostHouse, 80);
    expect([0, 40, 80, 400, 650, 900, 2000].map((x) => lerp(x, f))).toEqual([40, 70, 100, 100, 87.5, 75, 75]);
  });
});

describe("site flags", () => {
  const cfg = DEFAULT_USER_CONFIG;
  const none = {
    benches: [],
    shelves: [],
    diag: { houseAc: 0.4, shelfAc: 1.25, gardenAc: 0, totalAc: 5 },
    houseMin: 45,
  } as never;

  it("no house site is fatal, or a warning when a house is marked", () => {
    expect(siteFlags(none, cfg, false)[0]!.lvl).toBe("fatal");
    expect(siteFlags(none, cfg, true)[0]!.lvl).toBe("warn");
    expect(siteFlags(none, cfg, false)[0]!.t).toBe(
      "No house site: no contiguous 0.3 ac scores even 45/100 (0.4 ac scores ≥60, 1.3 ac more scores ≥45). If the imagery shows a flat pad, check the suitability overlay and the DEM cell size before believing this.",
    );
  });

  it("a pad-sized shelf turns it into a compact-site warning", () => {
    const withShelf = { ...(none as object), shelves: [{ acres: 0.21 }, { acres: 0.12 }] } as never;
    expect(siteFlags(withShelf, cfg, false)).toEqual([
      {
        lvl: "warn",
        t: "No natural house site (nothing reaches 0.3 contiguous ac at 45/100), but 1 pad-sized shelf of 0.21 ac could take a house with a cut pad and walls. If a house is already there, that's the earthwork paid for.",
      },
    ]);
  });
});

// The fixture check: replayed DEMs through the port's site search, against the prototype.
describe.each(FIXTURE_SLUGS)("site search on %s vs the prototype", (slug) => {
  it("finds the same benches, shelves, gardens, diagnostics and flags", async () => {
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
    const { slope, aspect } = slopeAspect(dFine);
    const { own: inside } = insideMasks(dFine, parcel, input.ownLand ? feature(input.ownLand) : undefined);
    const [lon, lat] = centroid(parcel).geometry.coordinates as [number, number];
    const vf = valleyFloor(dWide, [lat, lon]);
    const search = findSites(dFine, slope, aspect, inside, vf, DEFAULT_USER_CONFIG);
    const out = siteResults(dFine, vf, search);

    expect(differences(search.diag, golden.terrain!.diag)).toEqual([]);
    expect(out.houseMinUsed).toBe(golden.houseMinUsed);

    // Benches, by place: the soils step's veto (`veto`) can reorder them, and on Grayson Mud Creek it does (its
    // second part is frequently flooded bottomland, follow-up 29).
    const byPlace = <T extends { ll: [number, number] }>(xs: T[]) =>
      [...xs].sort((a, b) => a.ll[0] - b.ll[0] || a.ll[1] - b.ll[1]);
    expect(
      differences(byPlace(out.benches), byPlace(golden.benches!.map(({ veto: _v, ...b }) => b))),
    ).toEqual([]);

    // Shelves: distFt/dropFt come from the rank step.
    expect(
      differences(
        out.shelves,
        golden.shelves!.map(({ distFt: _d, dropFt: _p, ...s }) => s),
      ),
    ).toEqual([]);

    // Gardens: the soils step adds soil fields and re-sorts by soil-adjusted score, so compare as a set.
    const byLL = <T extends { ll: [number, number] }>(xs: T[]) =>
      [...xs].sort((a, b) => a.ll[0] - b.ll[0] || a.ll[1] - b.ll[1]);
    const goldenGardens = golden.gardens!.map(
      ({ soil: _s, soilNote: _n, adj: _a, finalScore: _f, ...g }) => g,
    );
    expect(differences(byLL(out.gardens), byLL(goldenGardens))).toEqual([]);

    // Flags from the terrain step, in order, are the first flags of the prototype's run.
    const flags = [
      ...siteFlags(search, DEFAULT_USER_CONFIG, false),
      ...terrainFlags(golden.terrain!.slopeP90Deg),
    ];
    expect(golden.flags.slice(0, flags.length)).toEqual(flags);
  });
});

// Follow-up 29 (owner, 2026-10-08): the strip bridging a parcel's parts is outline, not land. Two steep parts
// with a flat 15 m strip between them: on the outline the strip makes a house site; on the own land, nothing.
describe("a bridged strip between two parts (follow-up 29)", () => {
  const RES = 3,
    W = 100,
    H = 100,
    STRIP = [45, 50] as const; // columns of the strip: 15 m wide, 300 m long
  const X0 = 500000,
    Y0 = 4050000;
  const d: Dem = {
    z: new Float32Array(W * H),
    w: W,
    h: H,
    x0: X0,
    y0: Y0,
    res: RES,
    resY: RES,
    source: "USGS 3DEP",
  };
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      const inStrip = c >= STRIP[0] && c < STRIP[1];
      // The parts fall away southward at 35°; the strip is level.
      d.z[r * W + c] = inStrip ? 1000 : 1000 - r * RES * Math.tan((35 * Math.PI) / 180);
    }
  /** A lon/lat rectangle over columns c0..c1 (exclusive), all rows. */
  const block = (c0: number, c1: number) => {
    const ll = (x: number, y: number) => {
      const [lat, lon] = inv(x, y);
      return [lon, lat];
    };
    const [w, e] = [X0 + c0 * RES, X0 + c1 * RES];
    const [n, s] = [Y0, Y0 - H * RES];
    return [[ll(w, n), ll(e, n), ll(e, s), ll(w, s), ll(w, n)]];
  };
  const outline = polygon(block(0, W));
  const own = feature({
    type: "MultiPolygon" as const,
    coordinates: [block(0, STRIP[0]), block(STRIP[1], W)],
  });
  const { slope, aspect } = slopeAspect(d);
  const vf = 1000 - 60; // the strip sits 200 ft above the valley floor: inside the thermal belt
  const stripCells = () => {
    const out: number[] = [];
    for (let r = 0; r < H; r++) for (let c = STRIP[0]; c < STRIP[1]; c++) out.push(r * W + c);
    return out;
  };

  it("on the outline alone, the flat strip is a house site (so the test can see one)", () => {
    const { outline: inside } = insideMasks(d, outline);
    const s = findSites(d, slope, aspect, inside, vf, DEFAULT_USER_CONFIG);
    expect(stripCells().some((i) => s.label[i]! > 0)).toBe(true);
  });

  it("on the own land, no site, shelf, garden or suitability cell is in the strip", () => {
    const { outline: whole, own: inside } = insideMasks(d, outline, own);
    expect(stripCells().every((i) => whole[i] === 1 && inside[i] === 0)).toBe(true);
    const s = findSites(d, slope, aspect, inside, vf, DEFAULT_USER_CONFIG);
    for (const i of stripCells()) {
      expect(s.label[i]! > 0 || s.shelfLabel[i]! > 0 || s.gardenLabel[i]! > 0).toBe(false);
      expect(Number.isNaN(s.surfaces.house[i]!) && Number.isNaN(s.surfaces.garden[i]!)).toBe(true);
    }
  });
});
