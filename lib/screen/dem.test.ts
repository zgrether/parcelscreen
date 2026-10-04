import { polygon } from "@turf/turf";
import { encode } from "fast-png";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadFixture, FIXTURE_SLUGS } from "../../test/support/fixtures";
import { createHttpClient, type HttpClient } from "../http";
import { DEFAULT_ENDPOINTS } from "./config";
import {
  at,
  bilinear,
  DemCache,
  decodeTerrarium,
  fetchDEM,
  fetchParcelDems,
  fineResM,
  llToRC,
  parcelBboxes,
  rcToLL,
  rcToUTM,
  utmToRC,
} from "./dem";
import type { Dem } from "./types";

const plane = (w: number, h: number, f: (x: number, y: number) => number): Dem => {
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
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const [x, y] = rcToUTM(d, r, c);
      d.z[r * w + c] = f(x, y);
    }
  return d;
};

describe("grid helpers", () => {
  const d = plane(20, 10, (x) => x - 500000);
  it("row/col ⇄ UTM puts row 0 at the north edge and cell centres at +0.5", () => {
    expect(rcToUTM(d, 0, 0)).toEqual([500005, 4079995]);
    expect(utmToRC(d, 500005, 4079995)).toEqual([0, 0]);
    expect(utmToRC(d, 500199, 4079901)).toEqual([9, 19]);
  });
  it("row/col ⇄ lat/lon round-trips", () => {
    const [lat, lon] = rcToLL(d, 3, 7);
    expect(llToRC(d, lat, lon)).toEqual([3, 7]);
  });
  it("bilinear is exact on a plane and NaN outside or next to no-data", () => {
    expect(bilinear(d, 500055, 4079950)).toBeCloseTo(55, 9);
    expect(bilinear(d, 499000, 4079950)).toBeNaN();
    const holed = { ...d, z: d.z.slice() };
    holed.z[2 * 20 + 5] = NaN;
    expect(bilinear(holed, 500055, 4079975)).toBeNaN();
    expect(at(d, 0, 3)).toBeCloseTo(35, 6);
  });
});

describe("DemCache", () => {
  const dem = plane(8, 8, () => 0);
  it("returns the same DEM for the same bbox and cell size, without loading twice", async () => {
    const cache = new DemCache();
    let loads = 0;
    const load = async () => (loads++, dem);
    const k = DemCache.key([-80.5, 36.8, -80.4, 36.9], 3);
    await cache.get(k, load);
    await cache.get(DemCache.key([-80.500001, 36.8, -80.4, 36.9], 3), load); // same to 1e-5°
    expect(loads).toBe(1);
    await cache.get(DemCache.key([-80.5, 36.8, -80.4, 36.9], 30), load);
    expect(loads).toBe(2);
  });
  it("evicts the least recently used and never caches a failure", async () => {
    const cache = new DemCache(2);
    let loads = 0;
    const ok = async () => (loads++, dem);
    await cache.get("a", ok);
    await cache.get("b", ok);
    await cache.get("a", ok); // a is now most recent
    await cache.get("c", ok); // evicts b
    await cache.get("a", ok);
    expect(loads).toBe(3);
    await expect(cache.get("d", async () => Promise.reject(new Error("503")))).rejects.toThrow("503");
    await cache.get("d", ok);
    expect(loads).toBe(4);
  });
});

describe("fetchDEM from the recorded 3DEP responses", () => {
  it.each(FIXTURE_SLUGS)("%s: fine (3 m) and wide (30 m) grids, then served from the cache", async (slug) => {
    const fx = loadFixture(slug);
    const fetch = fx.replayFetch();
    const cache = new DemCache();
    const deps = {
      http: createHttpClient({ env: "node", fetchImpl: fetch }),
      endpoints: DEFAULT_ENDPOINTS,
      cache,
    };
    const parcel = polygon(fx.input.polygon.geometry.coordinates);
    const { dFine, dWide } = await fetchParcelDems(parcel, 3, deps);
    expect(dFine.source).toBe("USGS 3DEP");
    expect(dFine.res).toBeCloseTo(3, 1);
    expect(dWide.res).toBeCloseTo(30, 1);
    // The grid the prototype asked for: size from the request URL.
    const sizes = fx.har.log.entries
      .filter((e) => e.request.url.includes("exportImage"))
      .map((e) => new URL(e.request.url).searchParams.get("size"));
    expect(sizes).toContain(`${dFine.w},${dFine.h}`);
    expect(sizes).toContain(`${dWide.w},${dWide.h}`);
    // Real elevations, no-data mapped to NaN.
    expect(dFine.z.some(Number.isNaN)).toBe(false);
    expect(dFine.z.reduce((m, v) => Math.min(m, v), Infinity)).toBeGreaterThan(400); // metres; Floyd County is ~2,500 ft up
    const before = fetch.requests.length;
    await fetchParcelDems(parcel, 3, deps);
    expect(fetch.requests.length).toBe(before); // second run: zero DEM requests
  });

  it("clamps the cell size setting to 1–30 m, defaulting to 3", () => {
    expect([fineResM(0.5), fineResM(3), fineResM(50), fineResM(NaN)]).toEqual([1, 3, 30, 3]);
  });
});

describe("terrarium fallback", () => {
  it("decodes elevation = R·256 + G + B/256 − 32768", () => {
    const data = new Uint8Array(256 * 256 * 3);
    data.set([128, 100, 64], 0); // 32768 + 100 + 0.25 → 100.25 m
    data.set([127, 255, 128], 3); // 32512 + 255 + 0.5 → −0.5 m
    const el = decodeTerrarium(encode({ width: 256, height: 256, data, channels: 3 }));
    expect(el[0]).toBe(100.25);
    expect(el[1]).toBe(-0.5);
  });

  it("falls back after three 3DEP failures and agrees with the lidar DEM to a few metres", async () => {
    const fx = loadFixture("ferney-creek-52-47A");
    const tile = readFileSync(new URL("../../test/fixtures/terrarium/14/4530/6383.png", import.meta.url));
    const replay = fx.replayFetch();
    const failing3DEP: HttpClient = {
      fetch: async (url) =>
        url.includes("exportImage")
          ? new Response("busy", { status: 500 })
          : url.endsWith("/14/4530/6383.png")
            ? new Response(tile)
            : Promise.reject(new Error(`unexpected ${url}`)),
    };
    const sleeps: number[] = [];
    const warnings: string[] = [];
    const parcel = polygon(fx.input.polygon.geometry.coordinates);
    const { fine } = parcelBboxes(parcel);
    const fallback = await fetchDEM(fine, 3, {
      http: failing3DEP,
      endpoints: DEFAULT_ENDPOINTS,
      sleep: async (ms) => void sleeps.push(ms),
      onWarn: (m) => warnings.push(m),
    });
    expect(sleeps).toEqual([1500, 3000, 4500]);
    expect(warnings[0]).toMatch(/^3DEP unavailable, falling back to Terrain Tiles: 3DEP 500/);
    expect(fallback.source).toBe("AWS Terrain Tiles (NED/SRTM)");
    // Terrarium is never asked for finer than 8 m; spreading the extent over whole cells lands just under.
    expect(fallback.res).toBeGreaterThan(7.9);
    expect(fallback.res).toBeLessThanOrEqual(8);

    const lidar = await fetchDEM(fine, 3, {
      http: createHttpClient({ env: "node", fetchImpl: replay }),
      endpoints: DEFAULT_ENDPOINTS,
    });
    const diffs: number[] = [];
    for (let r = 0; r < fallback.h; r++)
      for (let c = 0; c < fallback.w; c++) {
        const [x, y] = rcToUTM(fallback, r, c);
        const z = bilinear(lidar, x, y);
        if (!Number.isNaN(z)) diffs.push(Math.abs(z - at(fallback, r, c)));
      }
    diffs.sort((a, b) => a - b);
    expect(diffs.length).toBeGreaterThan(1000);
    expect(diffs[Math.floor(diffs.length / 2)]).toBeLessThan(3); // median |Δz|, metres
  });
});
