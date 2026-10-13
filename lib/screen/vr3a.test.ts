/**
 * VR3a (schema v4): the build footprint on a site, the flood zones on the grid, and OpenStreetMap frontage where
 * TIGER shows none. On constructed ground; the fixtures' own numbers are in expected.json.
 */
import { lineString, polygon } from "@turf/turf";
import type { Feature, Polygon } from "geojson";
import { describe, expect, it } from "vitest";
import { rcToLL } from "./dem";
import { entranceCandidates } from "./driveway";
import { sfhaMask, type FloodFeature } from "./flood";
import { padFt2, placeHouse, siteFit } from "./footprint";
import { osmRoadsQuery, parseOsmWays, reachesTiger, type OsmWay } from "./osmRoads";
import type { RoadFeature } from "./roads";
import type { Dem } from "./types";

const W = 200,
  H = 200;
const flat = (): Dem => ({
  z: new Float32Array(W * H).fill(900),
  w: W,
  h: H,
  x0: 500000,
  y0: 4080000,
  res: 3,
  resY: 3,
  source: "USGS 3DEP",
});
/** The cells of a block of rows and columns. */
const block = (r0: number, r1: number, c0: number, c1: number) => {
  const cells: number[] = [];
  for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) cells.push(r * W + c);
  return cells;
};
const ACRE_M2 = 4046.8564224;
const acresOf = (cells: number[], d: Dem) => (cells.length * d.res * d.resY) / ACRE_M2;

describe("the build footprint on a site", () => {
  const d = flat();
  const slope = new Float32Array(W * H); // all flat: gentle everywhere
  const inside = new Uint8Array(W * H).fill(1);

  it("the pad is §5.4's 11,720 ft²: the house and garage with their margins, and the turnaround", () => {
    expect(padFt2()).toBe(64 * 80 + 60 * 70 + 120 * 20);
  });

  it("a wide site fits; a narrow one holds the house but not the pad; a sliver holds nothing", () => {
    const wide = block(80, 120, 80, 120); // 120 m square, 3.6 ac
    expect(siteFit(d, { cells: wide, acres: acresOf(wide, d), rc: [100, 100] }, slope, inside).fit).toBe(
      "fits",
    );
    // 30 × 30 m: the 10.4 × 15.2 m house fits, but 900 m² (9,700 ft²) is under the pad.
    const narrow = block(90, 100, 90, 100);
    expect(siteFit(d, { cells: narrow, acres: acresOf(narrow, d), rc: [95, 95] }, slope, inside).fit).toBe(
      "house only",
    );
    // 6 m across: no house in any orientation.
    const sliver = block(60, 140, 100, 102);
    expect(siteFit(d, { cells: sliver, acres: acresOf(sliver, d), rc: [100, 101] }, slope, inside).fit).toBe(
      "too small",
    );
  });

  it("the house's working margin may spill off the site (owner, 2026-10-12)", () => {
    // 12 × 18 m (4 × 6 cells): the house fits; with its 15 ft margin all round (19.5 × 24.4 m) it wouldn't.
    expect(placeHouse(d, block(90, 94, 90, 96), [92, 93])).not.toBeNull();
  });

  it("the house is placed nearest the site's pin, turned to fit when it must", () => {
    // A 25 × 20 cell site (75 × 60 m) wide east–west; the pin at its west end.
    const site = block(90, 110, 80, 105);
    const at = placeHouse(d, site, [100, 80])!;
    expect(at[0]).toBeGreaterThanOrEqual(90);
    expect(at[1]).toBeLessThan(95); // as near the pin as the rectangle allows
    // A 2-cell strip can't hold the 10.4 m house, square on or turned.
    expect(placeHouse(d, block(90, 92, 0, 200), [91, 100])).toBeNull();
  });

  it("the gentle ground within 300 ft of the placed house, on the parcel's own land", () => {
    const wide = block(80, 120, 80, 120);
    const all = siteFit(d, { cells: wide, acres: acresOf(wide, d), rc: [100, 100] }, slope, inside);
    // A 91.44 m circle: π · 91.44² ≈ 26,270 m², 6.49 ac, on the 3 m grid.
    expect(all.gentleNearAc).toBeCloseTo(6.49, 1);
    // Steep to the east of column 100: about half of it.
    const steep = new Float32Array(W * H);
    for (let r = 0; r < H; r++) for (let c = 100; c < W; c++) steep[r * W + c] = 20;
    const half = siteFit(d, { cells: wide, acres: acresOf(wide, d), rc: [100, 100] }, steep, inside);
    expect(half.gentleNearAc / all.gentleNearAc).toBeGreaterThan(0.4);
    expect(half.gentleNearAc / all.gentleNearAc).toBeLessThan(0.6);
  });
});

describe("the flood zones on the grid", () => {
  it("marks the cells whose centres are inside an SFHA polygon", () => {
    const d = flat();
    const [n, w] = rcToLL(d, 50, 50),
      [s, e] = rcToLL(d, 59, 59);
    const zone = polygon([
      [
        [w, n],
        [e, n],
        [e, s],
        [w, s],
        [w, n],
      ],
    ]) as FloodFeature;
    const m = sfhaMask(d, [zone]);
    expect(m[55 * W + 55]).toBe(1);
    expect(m[40 * W + 40]).toBe(0);
    const marked = m.reduce((a, v) => a + v, 0);
    expect(marked).toBeGreaterThanOrEqual(81); // the 10 × 10 block's interior, give or take its edges
    expect(marked).toBeLessThanOrEqual(121);
    expect(sfhaMask(d, null).some((v) => v)).toBe(false);
  });
});

describe("OpenStreetMap frontage (where TIGER shows none)", () => {
  const d = flat();
  const ll = (r: number, c: number) => {
    const [lat, lon] = rcToLL(d, r, c);
    return [lon, lat] as [number, number];
  };
  // The parcel: rows 80–120, columns 80–120 (120 m square).
  const parcel = polygon([
    [ll(80, 80), ll(80, 120), ll(120, 120), ll(120, 80), ll(80, 80)],
  ]) as Feature<Polygon>;
  // A TIGER road 150 m east of the parcel, running north–south: no frontage, within the 400 m fallback.
  const tiger: RoadFeature[] = [
    { ...lineString([ll(0, 170), ll(199, 170)]), properties: { NAME: "State Rd 1346" } },
  ];
  // An OSM track along the north boundary, 6 m out, from the TIGER road west past the parcel.
  const track: OsmWay = {
    id: 651846930,
    highway: "track",
    name: null,
    tracktype: null,
    access: null,
    service: null,
    coords: [ll(78, 170), ll(78, 120), ll(78, 60)],
  };

  it("TIGER first: with no OSM ways, the nearest road point, as before", () => {
    const { entrances } = entranceCandidates(tiger, parcel, d);
    expect(entrances).toHaveLength(1);
    expect(entrances[0]).toMatchObject({
      fallback: true,
      source: "tiger",
      reaches: null,
      name: "State Rd 1346",
    });
  });

  it("an OSM track along the boundary is the entrance, marked, with how far it is to the TIGER road", () => {
    const { entrances } = entranceCandidates(tiger, parcel, d, [track]);
    expect(entrances.length).toBeGreaterThan(0);
    for (const e of entrances) {
      expect(e).toMatchObject({ source: "osm", name: "unmapped track" });
      expect(e.fallback).toBeUndefined();
      // Along the track to column 170: from the frontage (the north edge, columns 80–120, and up to 40 m past its
      // corners), 30–90 cells.
      expect(e.reaches!.road).toBe("State Rd 1346");
      expect(e.reaches!.ft).toBeGreaterThan(30 * 3 * 3.28084 - 1);
      expect(e.reaches!.ft).toBeLessThan(90 * 3 * 3.28084 + 1);
    }
  });

  it("TIGER frontage wins over any OSM way", () => {
    const fronting: RoadFeature[] = [
      ...tiger,
      { ...lineString([ll(122, 60), ll(122, 140)]), properties: { NAME: "Mud Creek Ln" } },
    ];
    const { entrances } = entranceCandidates(fronting, parcel, d, [track]);
    expect(entrances.every((e) => e.source === "tiger" && e.name === "Mud Creek Ln")).toBe(true);
  });

  it("a track that never meets a TIGER road reaches nothing", () => {
    const lonely: OsmWay = { ...track, coords: [ll(78, 130), ll(78, 60)] };
    expect(
      reachesTiger([lonely], { wayIndex: 0, ll: [rcToLL(d, 78, 100)[0], rcToLL(d, 78, 100)[1]] }, tiger),
    ).toBe(null);
  });

  it("the Overpass query and its answer", () => {
    expect(osmRoadsQuery([36.326382, -81.627171])).toBe(
      '[out:json][timeout:25];way["highway"~"^(track|service|unclassified)$"](around:1500,36.326382,-81.627171);out tags geom;',
    );
    const ways = parseOsmWays({
      elements: [
        {
          type: "way",
          id: 651846930,
          tags: { highway: "track", surface: "ground" },
          geometry: [
            { lat: 36.32732, lon: -81.6228 },
            { lat: 36.3274, lon: -81.623 },
          ],
        },
        { type: "node", id: 1, lat: 36, lon: -81 },
        { type: "way", id: 2, tags: { highway: "service" }, geometry: [{ lat: 36, lon: -81 }] }, // one point: dropped
      ],
    });
    expect(ways).toEqual([
      {
        id: 651846930,
        highway: "track",
        name: null,
        // Follow-up 55: what the road in is; none of them tagged here.
        tracktype: null,
        access: null,
        service: null,
        coords: [
          [-81.6228, 36.32732],
          [-81.623, 36.3274],
        ],
      },
    ]);
  });
});
