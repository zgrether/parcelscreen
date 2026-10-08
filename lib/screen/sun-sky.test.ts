import { describe, expect, it } from "vitest";
import { differences } from "../../test/support/compare";
import { FIXTURE_SLUGS, loadFixture } from "../../test/support/fixtures";
import { expectedOf } from "../../test/support/expected";
import { throughSoils } from "../../test/support/pipeline";
import { prototypeFn } from "../../test/support/prototypeFns";
import { dayLimits, eqToHor, lstDeg, sunPos } from "./astro";
import { DEFAULT_USER_CONFIG } from "./config";
import { rcToLL } from "./dem";
import { siteFlags } from "./sites";
import { AtlasCache, computeSky, lpMag, lpZone, skyFlags } from "./sky";
import { soilFlags } from "./soils";
import { chooseFocus, computeSun, horizonProfile, sunFlags, sunHours, type HorizonPoint } from "./sun";
import { terrainFlags } from "./terrain";
import type { Dem } from "./types";
import { M2FT, type LatLon } from "./util";

// Seeded randomness so the oracle comparisons are reproducible.
let seed = 11;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;

/** A rugged synthetic 30 m DEM: sums of sines plus noise, with a few no-data holes. */
function ruggedDem(w = 160, h = 160): Dem {
  const d: Dem = {
    z: new Float32Array(w * h),
    w,
    h,
    x0: 520000,
    y0: 4090000,
    res: 30,
    resY: 30,
    source: "USGS 3DEP",
  };
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++)
      d.z[r * w + c] =
        800 + 120 * Math.sin(r / 9) + 90 * Math.cos(c / 13) + 40 * Math.sin((r + c) / 5) + 10 * rand();
  for (let k = 0; k < 40; k++) d.z[Math.floor(rand() * w * h)] = NaN;
  return d;
}

describe("sun and sky helpers vs the prototype's own functions (exact)", () => {
  const dem = { at: (d: Dem, r: number, c: number) => d.z[r * d.w + c] };
  const protoHorizon = prototypeFn<
    (d: Dem, r: number, c: number, step?: number, max?: number) => HorizonPoint[]
  >("horizonProfile", { dem });
  const protoSunHours = prototypeFn<typeof sunHours>("sunHours");
  const protoSunPos = prototypeFn<typeof sunPos>("sunPos");
  const protoDayLimits = prototypeFn<typeof dayLimits>("dayLimits");
  const protoLst = prototypeFn<typeof lstDeg>("lstDeg");
  const protoEqToHor = prototypeFn<typeof eqToHor>("eqToHor");
  const protoZone = prototypeFn<typeof lpZone>("lpZone");
  const protoMag = prototypeFn<typeof lpMag>("lpMag");

  it("horizonProfile and sunHours on a rugged DEM from 25 points, Dec and Jun, three canopies", () => {
    const d = ruggedDem();
    for (let k = 0; k < 25; k++) {
      const r0 = 20 + Math.floor(rand() * 120),
        c0 = 20 + Math.floor(rand() * 120);
      const hz = horizonProfile(d, r0, c0);
      expect(hz).toEqual(protoHorizon(d, r0, c0, 5, 6000));
      const lat = 34 + rand() * 5.5;
      for (const doy of [355, 172, 80])
        for (const canopy of [0, 3, 7.5])
          expect(sunHours(lat, hz, doy, canopy)).toEqual(protoSunHours(lat, hz, doy, canopy));
    }
  });

  it("sunPos, dayLimits and lstDeg on 2,000 random inputs", () => {
    for (let k = 0; k < 2000; k++) {
      const lat = -60 + rand() * 120,
        doy = Math.floor(rand() * 365),
        H = -180 + rand() * 360;
      expect(sunPos(lat, doy, H)).toEqual(protoSunPos(lat, doy, H));
      expect(dayLimits(lat, doy)).toBe(protoDayLimits(lat, doy));
      const when = new Date(Date.UTC(2026, 0, 1) + rand() * 365 * 86400000),
        lon = -180 + rand() * 360;
      expect(lstDeg(when, lon)).toBe(protoLst(when, lon));
    }
  });

  it("eqToHor on random inputs", () => {
    for (let k = 0; k < 2000; k++) {
      const args = [rand() * 360, -90 + rand() * 180, -60 + rand() * 120, rand() * 360] as const;
      expect(eqToHor(...args)).toEqual(protoEqToHor(...args));
    }
  });

  it("lpZone and lpMag across the whole ratio range, including every zone boundary", () => {
    const edges = [0.01, 0.06, 0.11, 0.19, 0.33, 0.58, 1.0, 1.73, 3.0, 5.2, 9.0, 15.59, 27];
    const ratios = [
      0,
      ...edges.flatMap((e) => [e - 1e-9, e, e + 1e-9]),
      ...Array.from({ length: 2000 }, () => rand() ** 3 * 60),
    ];
    for (const r of ratios) {
      expect(lpZone(r)).toEqual(protoZone(r));
      expect(lpMag(r)).toBe(protoMag(r));
    }
  });
});

describe("horizon and sun (synthetic)", () => {
  it("sees a 100 m wall 1 km north at atan(98/1000) from an eye 2 m up", () => {
    const d: Dem = {
      z: new Float32Array(100 * 100),
      w: 100,
      h: 100,
      x0: 520000,
      y0: 4090000,
      res: 30,
      resY: 30,
      source: "USGS 3DEP",
    };
    for (let c = 0; c < 100; c++) d.z[(60 - 33) * 100 + c] = 100; // a wall ~33 cells (990 m) north of row 60
    const hz = horizonProfile(d, 60, 50);
    expect(hz[0]!.az).toBe(0);
    expect(hz[0]!.angle).toBeCloseTo((Math.atan2(98, 33 * 30) * 180) / Math.PI, 9);
    expect(hz[0]!.rc).toEqual([27, 50]);
    expect(hz[36]!.angle).toBe(0); // due south is open: below-horizontal counts as 0
  });

  it("Dec 21 daylight at 36.6°N matches twice the half-day hour angle, to the minute", () => {
    const flat: HorizonPoint[] = Array.from({ length: 72 }, (_, i) => ({ az: i * 5, angle: 0, rc: null }));
    const day = sunHours(36.6, flat, 355, 0);
    expect(Math.abs(day.daylightH - (2 * dayLimits(36.6, 355)) / 15)).toBeLessThan(1 / 60);
    expect(day.directH).toBe(day.daylightH); // nothing blocks it
    expect(day.noonAlt).toBeCloseTo(90 - 36.6 - 23.44 * Math.cos((2 * Math.PI * 365) / 365), 6);
  });

  it("chooses the focus as the prototype does", () => {
    const c: LatLon = [36.9, -80.5];
    const b = { ll: [36.91, -80.51] as LatLon, veto: null };
    expect(chooseFocus({ house: c, best: b, firstShelf: null, centre: c }).label).toBe("the existing house");
    expect(chooseFocus({ house: null, best: b, firstShelf: c, centre: c }).label).toBe(
      "the largest house site",
    );
    expect(chooseFocus({ house: null, best: { ...b, veto: "x" }, firstShelf: c, centre: c }).label).toBe(
      "shelf S1 (no house site found)",
    );
    expect(chooseFocus({ house: null, best: { ...b, veto: "x" }, firstShelf: null, centre: c }).label).toBe(
      "the largest (excluded) site",
    );
    expect(chooseFocus({ house: null, best: null, firstShelf: null, centre: c })).toEqual({
      ll: c,
      label: "the parcel centre",
    });
  });
});

describe.each(FIXTURE_SLUGS)("sun and sky on %s vs the prototype", (slug) => {
  it("matches focus, point, sun, sky and every flag so far, then serves the atlas from the cache", async () => {
    const t = await throughSoils(slug);
    const golden = expectedOf(t.fx.slug, "run");
    const vfFt = t.vf * M2FT;
    const best = t.vet.best;
    const focus = chooseFocus({
      house: null,
      best: best ? { ll: rcToLL(t.dFine, best.rc[0], best.rc[1]), veto: best.veto } : null,
      firstShelf: t.search.shelves[0]
        ? rcToLL(t.dFine, t.search.shelves[0].rc[0], t.search.shelves[0].rc[1])
        : null,
      centre: t.centre,
    });
    expect(differences(focus, golden.focus)).toEqual([]);

    const s = computeSun(t, focus.ll, vfFt, DEFAULT_USER_CONFIG.canopyDeg);
    expect(differences(s.point, golden.point)).toEqual([]);
    expect(differences(s.sun, golden.sun)).toEqual([]);

    const atlas = new AtlasCache();
    const k = await computeSky(focus.ll, s.horizon, DEFAULT_USER_CONFIG.canopyDeg, { ...t.deps, atlas });
    expect(differences(k.sky, golden.sky)).toEqual([]);

    const flags = [
      ...siteFlags(t.search, DEFAULT_USER_CONFIG, false),
      ...terrainFlags(golden.terrain!.slopeP90Deg),
      ...t.vet.flags,
      ...soilFlags(t.rows, t.units, t.acres, DEFAULT_USER_CONFIG.shallowBedrockCm),
      ...sunFlags(s.sun, focus.label, s.worst, DEFAULT_USER_CONFIG.sunHoursWanted),
      ...skyFlags(k.sky, k.zone, k.worst),
    ];
    expect(golden.flags.slice(0, flags.length)).toEqual(flags);

    // 24 directions × 6 distances read the same few tiles: decoded once per session.
    const before = t.fetch.requests.length;
    await computeSky(focus.ll, s.horizon, DEFAULT_USER_CONFIG.canopyDeg, { ...t.deps, atlas });
    expect(t.fetch.requests.length).toBe(before);
  });
});

// The re-evaluation goldens: sun and sky somewhere other than the default focus.
describe("sun and sky at the re-evaluation points vs the prototype", () => {
  const cases = [
    [
      "macks-mountain-35-3",
      "evaluateSite2",
      () => loadFixture("macks-mountain-35-3").input.evaluateSite2!.ll,
    ],
    ["ferney-creek-52-47A", "setHouse", () => loadFixture("ferney-creek-52-47A").input.house!.ll],
    ["ferney-creek-52-47A", "houseRun", () => loadFixture("ferney-creek-52-47A").input.house!.ll],
  ] as const;
  it.each(cases)("%s %s", async (slug, key, where) => {
    const t = await throughSoils(slug);
    const golden = expectedOf(t.fx.slug, key);
    const ll = where();
    expect(golden.focus!.ll).toEqual(ll);
    const s = computeSun(t, ll, t.vf * M2FT, DEFAULT_USER_CONFIG.canopyDeg);
    expect(differences(s.point, golden.point)).toEqual([]);
    expect(differences(s.sun, golden.sun)).toEqual([]);
    const k = await computeSky(ll, s.horizon, DEFAULT_USER_CONFIG.canopyDeg, {
      ...t.deps,
      atlas: new AtlasCache(),
    });
    expect(differences(k.sky, golden.sky)).toEqual([]);
  });
});
