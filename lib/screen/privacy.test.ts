/**
 * Privacy at a spot (step 11, plan §2.3), over a synthetic DEM: flat ground, a ridge to the east, a neighbor in sight
 * to the west, a house behind the ridge, and the parcel's own barn. Then the tiles' packing and the committed tiles.
 */
import { describe, expect, it } from "vitest";
import type { Feature, Polygon } from "geojson";
import * as UTM from "../geo/utm";
import { SCREEN_CONSTANTS } from "./config";
import {
  housesNearBoundary,
  inRegion,
  inSight,
  loadBuildings,
  privacyAt,
  tileName,
  tilesAround,
  unpack,
  withPrivacy,
  type House,
} from "./privacy";
import type { Dem } from "./types";
import type { LatLon } from "./util";

const SITE: LatLon = [36.6, -81.0];
const [SX, SY] = UTM.fwd(SITE[0], SITE[1]);
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LON = 111_320 * Math.cos((SITE[0] * Math.PI) / 180);
/** A point `east` and `north` metres from the site. */
const off = (east: number, north: number): LatLon => [
  SITE[0] + north / M_PER_DEG_LAT,
  SITE[1] + east / M_PER_DEG_LON,
];

/** 4 km square at 30 m, flat at 1,000 m, with a 60 m ridge from 300 to 400 m east of the site. */
function dem(): Dem {
  const res = 30;
  const w = 134;
  const h = 134;
  const x0 = SX - (w / 2) * res;
  const y0 = SY + (h / 2) * res;
  const z = new Float32Array(w * h);
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const x = x0 + (c + 0.5) * res - SX;
      z[r * w + c] = x >= 300 && x <= 400 ? 1060 : 1000;
    }
  return { z, w, h, x0, y0, res, resY: res, source: "USGS 3DEP" };
}
const D = dem();
const FT = 1000 * 3.28084;
const house = (ll: LatLon, heightM: number | null = null): House => ({ ll, heightM });
/** The parcel: a 200 m square around the site. */
const PARCEL: Feature<Polygon> = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [
      [off(-100, -100), off(100, -100), off(100, 100), off(-100, 100), off(-100, -100)].map(([la, lo]) => [
        lo,
        la,
      ]),
    ],
  },
};

describe("the houses near the boundary (owner, after #312: Hunt counts from the boundary)", () => {
  it("within a quarter mile of the boundary, the parcel's own left out", () => {
    const houses = [
      house(off(0, 0)), // on the parcel
      house(off(100 + 300, 0)), // 300 m east of the east side
      house(off(-100 - 390, 0)), // 390 m west of the west side
      house(off(0, 100 + 420)), // 420 m north: out
      house(off(100 + 300, 100 + 300)), // 424 m from the north-east corner: out
    ];
    expect(housesNearBoundary(houses, PARCEL)).toBe(2);
  });
});

describe("privacy at a spot", () => {
  it("a neighbor in the open is in sight; a house behind the ridge isn't", () => {
    expect(inSight(D, SITE, 1000, house(off(-800, 0)))).toBe(true);
    expect(inSight(D, SITE, 1000, house(off(800, 0)))).toBe(false);
    // Its own height doesn't lift it into view: a 14 m roof at 800 m stays under a 60 m ridge at 400 m.
    expect(inSight(D, SITE, 1000, house(off(800, 0), 14))).toBe(false);
  });

  it("counts the houses within a quarter mile and in sight within a mile, the nearest, and leaves the parcel's own out", () => {
    const houses = [
      house(off(50, 0)), // the parcel's own barn
      house(off(-300, 0)), // in sight, within a quarter mile
      house(off(-1200, 0)), // in sight, past a quarter mile
      house(off(600, 0)), // behind the ridge
      house(off(-2000, 0)), // past a mile
    ];
    const p = privacyAt(houses, D, PARCEL, SITE, FT);
    expect(p).toEqual({ near: 1, inSight: 2, nearestFt: expect.any(Number) });
    expect(p.nearestFt! / 3.28084).toBeCloseTo(300, -1);
    expect(privacyAt([house(off(50, 0))], D, PARCEL, SITE, FT)).toEqual({
      near: 0,
      inSight: 0,
      nearestFt: null,
    });
  });

  it("the tiles: names by south-west corner, the ones a mile reaches, and the 3-byte packing", () => {
    expect(tileName(36.65, -81.53)).toBe("n3660w8160");
    expect(tilesAround(SITE, SCREEN_CONSTANTS.privacy.sightM)).toContain(tileName(SITE[0], SITE[1]));
    // One building at 36.6123 N, 81.5456 W, 7 m tall; one with no height.
    const v = (lat: number, lon: number, h: number) => {
      const y = Math.round((lat - 36.6) / 1e-4);
      const x = Math.round((lon + 81.6) / 1e-4);
      const n = y | (x << 10) | (h << 20);
      return [n & 255, (n >> 8) & 255, (n >> 16) & 255];
    };
    const b64 = Buffer.from([...v(36.6123, -81.5456, 7), ...v(36.65, -81.55, 15)]).toString("base64");
    const [a, b] = unpack("n3660w8160", b64);
    expect(a!.ll[0]).toBeCloseTo(36.6123, 4);
    expect(a!.ll[1]).toBeCloseTo(-81.5456, 4);
    expect(a!.heightM).toBe(7);
    expect(b!.heightM).toBeNull();
  });

  it("outside the tiles' region: outside; without the wide DEM: not read", async () => {
    expect(inRegion([38, -80])).toBe(false);
    const none = async () => [] as House[];
    expect(await withPrivacy(none, D, PARCEL, [38, -80], { sites: [] })).toEqual({
      sites: [],
      privacy: { outside: true },
    });
    expect(await withPrivacy(none, undefined, PARCEL, SITE, { sites: [] })).toBeNull();
  });

  it("the committed tiles load around Mud Creek", async () => {
    const houses = (await loadBuildings(tilesAround([36.5863, -81.5604], 1609)))!;
    expect(houses.length).toBeGreaterThan(10);
  });
});
