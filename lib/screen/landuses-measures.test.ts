/**
 * Step 14's measurements on synthetic ground (plan §2.2, §2.4–§2.6): the trail estimate (gentle ground only, less the
 * drainages, in patches big enough), the land cover shares, the mapped streams by FCODE, and the county with its
 * zoning districts.
 */
import { polygon } from "@turf/turf";
import { describe, expect, it } from "vitest";
import { M2_PER_ACRE } from "../geo/types";
import type { HttpClient } from "../http";
import { findCounty } from "./county";
import { rcToLL } from "./dem";
import { measureCover, type LandCover } from "./landcover";
import { measureStreams } from "./streams";
import { trailNetwork } from "./trailNetwork";
import type { Dem } from "./types";

// A 100 × 100 grid of 3 m cells in UTM 17N near 36.6 N, 81.5 W.
const W = 100,
  H = 100;
const dem: Dem = {
  z: new Float32Array(W * H),
  w: W,
  h: H,
  x0: 455_000,
  y0: 4_050_000,
  res: 3,
  resY: 3,
  source: "USGS 3DEP",
};
const cellAc = 9 / M2_PER_ACRE;
const all = new Uint8Array(W * H).fill(1);
/** Slope: the west half at 5°, the east half at 20°. */
const halves = Float32Array.from({ length: W * H }, (_, i) => (i % W < W / 2 ? 5 : 20));
const M_PER_MI = 1609.344;

describe("the trail estimate", () => {
  it("only the gentle half counts: its area over a path every 100 ft", () => {
    const t = trailNetwork(dem, halves, all, null, null);
    const m2 = (W / 2) * H * 9;
    expect(t.gentleAc).toBeCloseTo(m2 / M2_PER_ACRE, 1);
    expect(t.miles).toBeCloseTo(m2 / 30.48 / M_PER_MI, 1);
  });

  it("a drainage and the flood zone are left out; a patch under 0.25 ac doesn't count", () => {
    // A drainage down column 10: a big contributing area.
    const flow = Float32Array.from({ length: W * H }, (_, i) => (i % W === 10 ? 1e6 : 1));
    const base = trailNetwork(dem, halves, all, null, null).gentleAc;
    const lessDrainage = trailNetwork(dem, halves, all, flow, null).gentleAc;
    // The drainage's own column; the 10 columns west of it (2.2 ac) are still a patch worth walking.
    expect(base - lessDrainage).toBeCloseTo(H * cellAc, 2);
    const sfha = Uint8Array.from({ length: W * H }, (_, i) => (Math.floor(i / W) < 20 ? 1 : 0));
    expect(trailNetwork(dem, halves, all, null, sfha).gentleAc).toBeCloseTo(base * 0.8, 1);
  });

  it("a gentle patch under 0.25 ac, steep all round, isn't kept", () => {
    // A 5 × 5 gentle square (225 m², 0.06 ac) in steep ground.
    const patch = Float32Array.from({ length: W * H }, (_, i) => {
      const r = Math.floor(i / W),
        c = i % W;
      return r >= 40 && r < 45 && c >= 40 && c < 45 ? 5 : 20;
    });
    expect(trailNetwork(dem, patch, all, null, null)).toEqual({ gentleAc: 0, miles: 0 });
  });

  it("all steep: none", () => {
    expect(trailNetwork(dem, new Float32Array(W * H).fill(20), all, null, null)).toEqual({
      gentleAc: 0,
      miles: 0,
    });
  });
});

describe("the land cover", () => {
  // NLCD over the grid: forest (41) west of the middle column, pasture (81) east of it.
  const [nLat, wLon] = rcToLL(dem, 0, 0);
  const [sLat, eLon] = rcToLL(dem, H - 1, W - 1);
  const [, midLon] = rcToLL(dem, 0, W / 2);
  const lc: LandCover = {
    west: wLon - 0.001,
    north: nLat + 0.001,
    dx: (eLon - wLon + 0.002) / 200,
    dy: (nLat - sLat + 0.002) / 200,
    w: 200,
    h: 200,
    classes: new Uint8Array(200 * 200),
  };
  for (let r = 0; r < 200; r++)
    for (let c = 0; c < 200; c++) lc.classes[r * 200 + c] = lc.west + (c + 0.5) * lc.dx < midLon ? 41 : 81;

  it("forest and open shares; open ground on the gentle half isn't gentle here (it's the steep half)", () => {
    const cv = measureCover(lc, dem, halves, all, []);
    expect(cv.forestPct).toBeGreaterThan(45);
    expect(cv.forestPct).toBeLessThan(55);
    expect(cv.forestPct + cv.openPct).toBe(100);
    expect(cv.openGentleAc).toBe(0); // the open (east) half is the 20° half
    expect(cv.year).toBe(2021);
  });

  it("open gentle ground, and the part of it near a road", () => {
    const flat = new Float32Array(W * H).fill(3);
    const far = measureCover(lc, dem, flat, all, []);
    expect(far.openGentleAc).toBeGreaterThan((W / 2) * H * cellAc * 0.9);
    expect(far.openNearRoadAc).toBe(0);
    // A road along the east edge: about 300 ft (30 cells) of the open half is near it.
    const [, roadLon] = rcToLL(dem, 0, W - 1);
    const near = measureCover(lc, dem, flat, all, [
      [
        [roadLon, sLat - 0.01],
        [roadLon, nLat + 0.01],
      ],
    ]);
    expect(near.openNearRoadAc).toBeGreaterThan(25 * H * cellAc);
    expect(near.openNearRoadAc).toBeLessThan(36 * H * cellAc);
  });
});

describe("mapped streams", () => {
  const S = 0.002;
  const parcel = polygon([
    [
      [-81.5, 36.6],
      [-81.5 + S, 36.6],
      [-81.5 + S, 36.6 + S],
      [-81.5, 36.6 + S],
      [-81.5, 36.6],
    ],
  ]);
  const across = (lon: number): [number, number][] => [
    [lon, 36.59],
    [lon, 36.61],
  ];

  it("perennial and intermittent inside, by FCODE; an artificial path ignored; the nearest from the site", () => {
    const s = measureStreams(
      [
        { name: "Mud Creek", fcode: 46006, coords: across(-81.499) },
        { name: null, fcode: 46003, coords: across(-81.4985) },
        { name: "Pond path", fcode: 55800, coords: across(-81.4995) },
      ],
      parcel,
      [36.601, -81.4988],
    );
    const depthFt = S * 111_200 * 3.28084;
    expect(s.perennialFt).toBeGreaterThan(depthFt * 0.95);
    expect(s.perennialFt).toBeLessThan(depthFt * 1.05);
    expect(s.intermittentFt).toBeGreaterThan(depthFt * 0.95);
    expect(s.names).toEqual(["Mud Creek"]);
    expect(s.nearestFt).toBeLessThan(80);
  });

  it("none: zeros, and no nearest", () => {
    expect(measureStreams([], parcel, [36.601, -81.4988])).toEqual({
      perennialFt: 0,
      intermittentFt: 0,
      names: [],
      nearestFt: null,
    });
  });
});

describe("the county and its zoning", () => {
  const square = polygon([
    [
      [-81.5, 36.6],
      [-81.49, 36.6],
      [-81.49, 36.61],
      [-81.5, 36.61],
      [-81.5, 36.6],
    ],
  ]);
  const fake = (answers: Record<string, unknown>): { http: HttpClient; asked: string[] } => {
    const asked: string[] = [];
    return {
      asked,
      http: {
        fetch: async (url) => {
          asked.push(url);
          const key = Object.keys(answers).find((k) => url.includes(k))!;
          return Response.json(answers[key]);
        },
      },
    };
  };

  it("Grayson: the county from TIGERweb, then its zoning map's districts the parcel touches", async () => {
    const { http, asked } = fake({
      "State_County/MapServer/1/query": {
        features: [{ attributes: { GEOID: "51077", BASENAME: "Grayson" } }],
      },
      "GraysonCo_WebGIS1/MapServer/21/query": {
        type: "FeatureCollection",
        features: [
          { type: "Feature", properties: { ZONECODE: "RF", ZONING: "Rural Farm" }, geometry: null },
          { type: "Feature", properties: { ZONECODE: "RF", ZONING: "Rural Farm" }, geometry: null },
          { type: "Feature", properties: { ZONECODE: "A1", ZONING: "Agricultural" }, geometry: null },
        ],
      },
    });
    const c = await findCounty([36.605, -81.495], square, { http });
    expect(c).toEqual({
      fips: "51077",
      name: "Grayson",
      state: "VA",
      zoning: {
        districts: [
          { code: "A1", name: "Agricultural" },
          { code: "RF", name: "Rural Farm" },
        ],
      },
    });
    expect(asked).toHaveLength(2);
  });

  it("a county without a zoning map: no second request, zoning null; no county at all: null", async () => {
    const floyd = fake({
      "State_County/MapServer/1/query": { features: [{ attributes: { GEOID: "51063", BASENAME: "Floyd" } }] },
    });
    expect(await findCounty([36.9, -80.4], square, { http: floyd.http })).toEqual({
      fips: "51063",
      name: "Floyd",
      state: "VA",
      zoning: null,
    });
    expect(floyd.asked).toHaveLength(1);
    const sea = fake({ "State_County/MapServer/1/query": { features: [] } });
    expect(await findCounty([30, -70], square, { http: sea.http })).toBeNull();
  });
});
