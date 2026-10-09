import * as turf from "@turf/turf";
import { describe, expect, it } from "vitest";
import { differences } from "../../test/support/compare";
import { FIXTURE_SLUGS, loadFixture } from "../../test/support/fixtures";
import { expectedOf } from "../../test/support/expected";
import { instantClock, throughSoils } from "../../test/support/pipeline";
import { prototypeFn } from "../../test/support/prototypeFns";
import { createHttpClient, type HttpClient } from "../http";
import { DEFAULT_ENDPOINTS, DEFAULT_USER_CONFIG } from "./config";
import { rcToLL } from "./dem";
import { driveTimes, drive } from "./drive";
import { floodStep } from "./flood";
import { nearStep } from "./near";
import { padusStep } from "./padus";
import { findPlaces, OverpassMirrors, overpassViaRoute, PlacesError } from "./places";
import { nearestRoad, roadToSite, type RoadFeature } from "./roads";
import { siteFlags } from "./sites";
import { AtlasCache, computeSky, skyFlags } from "./sky";
import { soilFlags } from "./soils";
import { chooseFocus, computeSun, sunFlags } from "./sun";
import { terrainFlags } from "./terrain";
import type { Dem } from "./types";
import { M2FT, type LatLon } from "./util";

const CFG = DEFAULT_USER_CONFIG;

describe.each(FIXTURE_SLUGS)("near, roads and drive times on %s vs the prototype", (slug) => {
  it("matches places, roads (in layer order), the road grade, drive times and every flag so far", async () => {
    const t = await throughSoils(slug);
    const golden = expectedOf(t.fx.slug, "run");
    const best = t.vet.best;
    const bestLL = best ? rcToLL(t.dFine, best.rc[0], best.rc[1]) : null;

    const n = await nearStep(t.centre, bestLL, t.dWide, CFG.roadMaxGradePct, t.deps);
    expect(differences(n.near, golden.near)).toEqual([]);
    expect(n.nearNote).toBe(golden.nearNote);
    // Against the port's own expected.json, so no widened tolerance: the 1e-5 this needed against the prototype
    // was the Turf version, not the engines (plan §5, correction of 2026-10-08).
    expect(differences(n.road, golden.road)).toEqual([]);
    expect(n.roadNote).toBe(golden.roadNote);
    // The raw TIGER features in the prototype's order (local, secondary, primary): later steps depend on it.
    expect(n.roads).toEqual(t.fx.goldens.run._roads);

    const drives = await driveTimes(t.centre, n.near, CFG.anchors, t.deps, n.otherGrocers); // as the engine does
    expect(differences(drives, golden.drives)).toEqual([]);

    // Every flag through the near step, in the prototype's order.
    const focus = chooseFocus({
      house: null,
      best: best ? { ll: bestLL!, veto: best.veto } : null,
      firstShelf: t.search.shelves[0]
        ? rcToLL(t.dFine, t.search.shelves[0].rc[0], t.search.shelves[0].rc[1])
        : null,
      centre: t.centre,
    });
    const s = computeSun(t, focus.ll, t.vf * M2FT, CFG.canopyDeg);
    const k = await computeSky(focus.ll, s.horizon, CFG.canopyDeg, { ...t.deps, atlas: new AtlasCache() });
    const flags = [
      ...siteFlags(t.search, CFG, false),
      ...terrainFlags(golden.terrain!.slopeP90Deg),
      ...t.vet.flags,
      ...soilFlags(t.rows, t.units, t.acres, CFG.shallowBedrockCm),
      ...sunFlags(s.sun, focus.label, s.worst, CFG.sunHoursWanted),
      ...skyFlags(k.sky, k.zone, k.worst),
      ...(await floodStep(t.measured, t.acres, t.deps)).flags,
      ...(await padusStep(t.measured, t.deps)).flags,
      ...n.flags,
    ];
    expect(golden.flags.slice(0, flags.length)).toEqual(flags);
  });
});

describe("nearestRoad vs the prototype's function (exact)", () => {
  const proto = prototypeFn<typeof nearestRoad>("nearestRoad", { turf });
  it.each(FIXTURE_SLUGS)("on the recorded roads at 300 points around %s", (slug) => {
    const fx = loadFixture(slug);
    const roads = fx.goldens.run._roads as RoadFeature[];
    const [lon, lat] = turf.centroid(fx.input.polygon).geometry.coordinates as [number, number];
    const centre: LatLon = [lat, lon];
    let seed = 3;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let i = 0; i < 300; i++) {
      const ll: LatLon = [centre[0] + (rand() - 0.5) * 0.03, centre[1] + (rand() - 0.5) * 0.03];
      expect(nearestRoad(roads, ll)).toEqual(proto(roads, ll));
    }
  });
});

describe("places and roads run at the same time", () => {
  it("starts all three TIGER layers together, while Photon is still in flight", async () => {
    const t = await throughSoils("ferney-creek-52-47A");
    const inFlight: Record<string, number> = {},
      peak: Record<string, number> = {};
    let tigerWhilePhoton = false;
    const kind = (u: string) =>
      u.includes("tigerweb") ? "tiger" : u.includes("photon") ? "photon" : "other";
    const slow: typeof fetch = async (input, init) => {
      const k = kind(String(input));
      inFlight[k] = (inFlight[k] ?? 0) + 1;
      peak[k] = Math.max(peak[k] ?? 0, inFlight[k]!);
      if (k === "tiger" && (inFlight.photon ?? 0) > 0) tigerWhilePhoton = true;
      await new Promise((r) => setTimeout(r, 5));
      try {
        return await t.fetch(input as string, init);
      } finally {
        inFlight[k]!--;
      }
    };
    const http = createHttpClient({ env: "node", fetchImpl: slow, clock: instantClock() });
    await nearStep(t.centre, null, t.dWide, CFG.roadMaxGradePct, { ...t.deps, http });
    expect(peak.tiger).toBe(3);
    expect(tigerWhilePhoton).toBe(true);
  });
});

// Photon and Overpass both answered in neither fixture's way except Photon-first, so the fallbacks are synthetic.
describe("places fallbacks (synthetic)", () => {
  const centre: LatLon = [36.9, -80.5];
  const hospital = { type: "node", lat: 36.95, lon: -80.45, tags: { amenity: "hospital", name: "Carilion" } };
  const route = (handler: (u: string) => Response | Promise<Response>): HttpClient => ({
    fetch: async (u) => handler(u),
  });

  it("falls back to Overpass, notes it, and moves the mirror that answered to the front", async () => {
    const asked: string[] = [];
    const http = route((u) => {
      asked.push(u.split("/")[2]!);
      if (u.includes("photon")) return new Response("down", { status: 503 });
      if (u.includes("overpass-api.de")) return new Response("busy", { status: 504 });
      return new Response(JSON.stringify({ elements: [hospital] }));
    });
    const mirrors = new OverpassMirrors();
    const r = await findPlaces(centre, { http, endpoints: DEFAULT_ENDPOINTS }, mirrors);
    expect(r.nearNote).toBe("Places came from Overpass (Photon was unavailable).");
    expect(r.near.hospitals[0]!.name).toBe("Carilion");
    // 3 Photon, then the main server (504: not a wait status) → openstreetmap.fr (answers, moves to front).
    expect(asked.slice(3)).toEqual([
      "overpass-api.de",
      "overpass.openstreetmap.fr",
      "overpass.openstreetmap.fr",
      "overpass.openstreetmap.fr",
    ]);
  });

  // Step 13c: only the main (first) mirror is waited on, once.
  describe("the main mirror's Retry-After", () => {
    /** Photon empty (so Overpass runs); each Overpass request answered by `overpass(host, n)`. */
    async function run(overpass: (host: string, n: number) => Response) {
      const asked: string[] = [],
        waits: number[] = [];
      const http = route((u) => {
        if (u.includes("photon")) return new Response(JSON.stringify({ features: [] }));
        const host = u.split("/")[2]!;
        asked.push(host);
        return overpass(host, asked.length);
      });
      const r = await findPlaces(
        centre,
        { http, endpoints: DEFAULT_ENDPOINTS, sleep: async (ms) => void waits.push(ms) },
        new OverpassMirrors(),
      );
      return { asked, waits, r };
    }
    const elements = () => new Response(JSON.stringify({ elements: [] }));

    it("waits the Retry-After from the main server, then retries it once", async () => {
      const { asked, waits } = await run((_, n) =>
        n === 1 ? new Response("", { status: 429, headers: { "Retry-After": "12" } }) : elements(),
      );
      expect(waits).toEqual([12_000]);
      expect(asked.slice(0, 2)).toEqual(["overpass-api.de", "overpass-api.de"]);
    });

    it("waits 5 s when the main server sends no Retry-After (the prototype's wait), on a 503 too", async () => {
      const { waits } = await run((_, n) => (n === 1 ? new Response("", { status: 503 }) : elements()));
      expect(waits).toEqual([5000]);
    });

    it("moves on at once when the Retry-After is over the 30 s cap", async () => {
      const { asked, waits } = await run((h) =>
        h === "overpass-api.de"
          ? new Response("", { status: 429, headers: { "Retry-After": "60" } })
          : elements(),
      );
      expect(waits).toEqual([]);
      expect(asked.slice(0, 2)).toEqual(["overpass-api.de", "overpass.openstreetmap.fr"]);
    });

    it("retries the main server only once, and never waits on the other mirrors", async () => {
      const { asked, waits, r } = await run((h) =>
        h === "overpass.kumi.systems"
          ? elements()
          : new Response("", { status: 429, headers: { "Retry-After": "2" } }),
      );
      expect(waits).toEqual([2000]); // the main server once; openstreetmap.fr's 429 is not waited on
      expect(asked.slice(0, 4)).toEqual([
        "overpass-api.de",
        "overpass-api.de",
        "overpass.openstreetmap.fr",
        "overpass.kumi.systems",
      ]);
      expect(r.nearNote).toBeDefined();
    });
  });

  it("asks the HTTP client not to retry Overpass requests itself", async () => {
    const retries: (number | undefined)[] = [];
    const http: HttpClient = {
      fetch: async (u, opts) => {
        if (u.includes("photon")) return new Response(JSON.stringify({ features: [] }));
        retries.push(opts?.retries);
        return new Response(JSON.stringify({ elements: [] }));
      },
    };
    await findPlaces(centre, { http, endpoints: DEFAULT_ENDPOINTS }, new OverpassMirrors());
    expect(retries).toEqual([0, 0, 0]);
  });

  it("when both fail: one error naming both, with the 'test the query' link", async () => {
    const http = route((u) =>
      u.includes("tigerweb")
        ? new Response(JSON.stringify({ features: [] }))
        : new Response("down", { status: 502 }),
    );
    const out = await nearStep(centre, null, null, 10, { http, endpoints: DEFAULT_ENDPOINTS });
    expect(out.placesError).toBeInstanceOf(PlacesError);
    expect(out.placesError!.message).toBe(
      "Photon: Photon 502; Overpass: Overpass unreachable (overpass-api.de 502; overpass.openstreetmap.fr 502; overpass.kumi.systems 502)",
    );
    expect(out.placesError!.link).toBe(
      "https://photon.komoot.io/api/?q=hospital&osm_tag=amenity:hospital&lat=36.9&lon=-80.5&limit=5",
    );
    expect(out.near).toBeUndefined();
  });

  // Step 13: in the browser the Overpass fallback goes through the server route instead of the mirrors.
  it("uses the injected Overpass fallback instead of the mirrors, with the same note and error text", async () => {
    const asked: string[] = [];
    const http = route((u) => {
      asked.push(u);
      return new Response("down", { status: 503 });
    });
    const calls: LatLon[] = [];
    const ok = await findPlaces(
      centre,
      {
        http,
        endpoints: DEFAULT_ENDPOINTS,
        overpass: async (c) => (calls.push(c), [hospital]),
      },
      new OverpassMirrors(),
    );
    expect(calls).toEqual([centre]);
    expect(asked.every((u) => u.includes("photon"))).toBe(true);
    expect(ok.nearNote).toBe("Places came from Overpass (Photon was unavailable).");
    expect(ok.near.hospitals[0]!.name).toBe("Carilion");

    const failed = await nearStep(centre, null, null, 10, {
      http: route((u) =>
        u.includes("tigerweb")
          ? new Response(JSON.stringify({ features: [] }))
          : new Response("", { status: 502 }),
      ),
      endpoints: DEFAULT_ENDPOINTS,
      overpass: overpassViaRoute(
        "https://parcelscreen.test/api/places/overpass",
        route((u) => {
          expect(u).toBe("https://parcelscreen.test/api/places/overpass?lat=36.9&lon=-80.5");
          return Response.json({ error: "Overpass unreachable (overpass-api.de 406)" }, { status: 502 });
        }),
      ),
    });
    expect(failed.placesError!.message).toBe(
      "Photon: Photon 502; Overpass: Overpass unreachable (overpass-api.de 406)",
    );
  });

  // Deviation from the prototype (step 9 review): a places outage no longer takes the roads down with it.
  it("a places outage keeps the roads, the road grade and its flag", async () => {
    // A 20% slope rising to the north; the site in the middle, a road ~100 m south of it.
    const dWide: Dem = {
      z: new Float32Array(100 * 100),
      w: 100,
      h: 100,
      x0: 520000,
      y0: 4090000,
      res: 30,
      resY: 30,
      source: "USGS 3DEP",
    };
    for (let r = 0; r < 100; r++) for (let c = 0; c < 100; c++) dWide.z[r * 100 + c] = 0.2 * (100 - r) * 30;
    const site = rcToLL(dWide, 50, 50);
    const road = {
      type: "Feature",
      properties: { NAME: "Rock Castle Rd", MTFCC: "S1400" },
      geometry: {
        type: "LineString",
        coordinates: [
          [site[1] - 0.01, site[0] - 0.0009],
          [site[1] + 0.01, site[0] - 0.0009],
        ],
      },
    };
    const http = route((u) =>
      u.includes("/8/query")
        ? new Response(JSON.stringify({ features: [road] }))
        : u.includes("tigerweb")
          ? new Response(JSON.stringify({ features: [] }))
          : new Response("down", { status: 503 }),
    );
    const out = await nearStep(site, site, dWide, 10, {
      http,
      endpoints: DEFAULT_ENDPOINTS,
      sleep: async () => {},
    });
    expect(out.placesError).toBeInstanceOf(PlacesError); // the step still fails…
    expect(out.near).toBeUndefined();
    expect(out.roads).toEqual([road]); // …but the roads come through,
    expect(out.road!.name).toBe("Rock Castle Rd"); // with the straight-line grade,
    // ~20%, quantized by sampling the rise at 30 m cell centres
    expect(out.road!.gradePct).toBeGreaterThan(15);
    expect(out.road!.gradePct).toBeLessThan(25);
    expect(out.flags).toHaveLength(1); // and its warning.
    expect(out.flags[0]!.t).toMatch(
      /^Straight-line grade from Rock Castle Rd to the bench is \d+% over \d+ ft\./,
    );
  });
});

describe("roads and drives (synthetic)", () => {
  const dWide: Dem = {
    z: new Float32Array(400).fill(800),
    w: 20,
    h: 20,
    x0: 520000,
    y0: 4090000,
    res: 30,
    resY: 30,
    source: "USGS 3DEP",
  };
  it("explains a parcel with no road nearby, and skips the grade when the road is within 20 m", () => {
    expect(roadToSite([], [36.9, -80.5], dWide, 10)).toEqual({
      roadNote: "No Census road within 1,500 m of the parcel — driveway grade not computed.",
      flags: [],
    });
    const site = rcToLL(dWide, 10, 10);
    const road = turf.lineString([
      [site[1] - 0.001, site[0] + 0.0001],
      [site[1] + 0.001, site[0] + 0.0001],
    ]) as RoadFeature;
    road.properties = { NAME: "Shooting Creek Rd" };
    expect(roadToSite([road], site, dWide, 10)).toEqual({ flags: [] }); // ~11 m away
  });

  it("routes the nearest of the first three candidates, and fails only when nothing routes", async () => {
    const osrm = (mins: Record<string, number>): HttpClient => ({
      fetch: async (u) => {
        const to = u.split(";")[1]!.split("?")[0]!;
        return to in mins
          ? new Response(
              JSON.stringify({ routes: [{ duration: mins[to]! * 60, distance: 1609.34 * mins[to]! }] }),
            )
          : new Response("{}", { status: 400 });
      },
    });
    const near = {
      hospitals: [
        { name: "A", ll: [1, 1] as LatLon, km: 1 },
        { name: "B", ll: [2, 2] as LatLon, km: 2 },
        { name: "C", ll: [3, 3] as LatLon, km: 3 },
        { name: "D", ll: [4, 4] as LatLon, km: 4 },
      ],
      grocers: [],
      trailheads: [],
      trailheadCount: 0,
    };
    const drives = await driveTimes([0, 0], near, [], {
      http: osrm({ "1,1": 30, "2,2": 20, "4,4": 5 }),
      endpoints: DEFAULT_ENDPOINTS,
    });
    expect(drives).toEqual([{ label: "Nearest hospital", min: 20, mi: 20, name: "B" }]); // D is the 4th: not tried
    await expect(
      driveTimes([0, 0], near, [], { http: osrm({}), endpoints: DEFAULT_ENDPOINTS }),
    ).rejects.toThrow("OSRM routing unavailable — straight-line only");
    expect(await drive([0, 0], [9, 9], { http: osrm({}), endpoints: DEFAULT_ENDPOINTS })).toBeNull();
  });
});
