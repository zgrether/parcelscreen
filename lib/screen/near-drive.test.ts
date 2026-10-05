import * as turf from "@turf/turf";
import { describe, expect, it } from "vitest";
import { differences } from "../../test/support/compare";
import { FIXTURE_SLUGS } from "../../test/support/fixtures";
import { fromPrototype } from "../../test/support/fromPrototype";
import { instantClock, throughSoils } from "../../test/support/pipeline";
import { prototypeFn } from "../../test/support/prototypeFns";
import { createHttpClient, type HttpClient } from "../http";
import { DEFAULT_ENDPOINTS, DEFAULT_USER_CONFIG } from "./config";
import { rcToLL } from "./dem";
import { driveTimes, drive } from "./drive";
import { floodStep } from "./flood";
import { nearStep } from "./near";
import { padusStep } from "./padus";
import { findPlaces, OverpassMirrors, PlacesError } from "./places";
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
    const golden = fromPrototype(t.fx.goldens.run);
    const best = t.vet.best;
    const bestLL = best ? rcToLL(t.dFine, best.rc[0], best.rc[1]) : null;

    const n = await nearStep(t.centre, bestLL, t.dWide, CFG.roadMaxGradePct, t.deps);
    expect(differences(n.near, golden.near)).toEqual([]);
    expect(n.nearNote).toBe(golden.nearNote);
    // turf.nearestPointOnLine amplifies the engines' last-bit Math differences (plan §5): the prototype's own
    // nearestRoad on identical inputs gives 69.79016070998650 m in Chromium (the golden) and 69.79025171847941 m
    // in Node for Macks Mountain, ~1.3e-6 relative. Hence 1e-5 on the two numbers derived from that distance.
    expect(
      differences(n.road, golden.road, { paths: { runFt: { rel: 1e-5 }, gradePct: { rel: 1e-5 } } }),
    ).toEqual([]);
    expect(n.roadNote).toBe(golden.roadNote);
    // The raw TIGER features in the prototype's order (local, secondary, primary): later steps depend on it.
    expect(n.roads).toEqual(t.fx.goldens.run._roads);

    const drives = await driveTimes(t.centre, n.near, CFG.anchors, t.deps);
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
      ...(await floodStep(t.parcel, t.acres, t.deps)).flags,
      ...(await padusStep(t.parcel, t.deps)).flags,
      ...n.flags,
    ];
    expect(golden.flags.slice(0, flags.length)).toEqual(flags);
  });
});

describe("nearestRoad vs the prototype's function (exact)", () => {
  const proto = prototypeFn<typeof nearestRoad>("nearestRoad", { turf });
  it.each(FIXTURE_SLUGS)("on the recorded roads at 300 points around %s", async (slug) => {
    const t = await throughSoils(slug);
    const roads = t.fx.goldens.run._roads as RoadFeature[];
    let seed = 3;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let i = 0; i < 300; i++) {
      const ll: LatLon = [t.centre[0] + (rand() - 0.5) * 0.03, t.centre[1] + (rand() - 0.5) * 0.03];
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
      if (u.includes("kumi")) return new Response("busy", { status: 504 });
      return new Response(JSON.stringify({ elements: [hospital] }));
    });
    const mirrors = new OverpassMirrors();
    const r = await findPlaces(centre, { http, endpoints: DEFAULT_ENDPOINTS }, mirrors);
    expect(r.nearNote).toBe("Places came from Overpass (Photon was unavailable).");
    expect(r.near.hospitals[0]!.name).toBe("Carilion");
    // 3 Photon, then kumi (fails) → openstreetmap.fr (answers, moves to front) for the 2nd and 3rd queries.
    expect(asked.slice(3)).toEqual([
      "overpass.kumi.systems",
      "overpass.openstreetmap.fr",
      "overpass.openstreetmap.fr",
      "overpass.openstreetmap.fr",
    ]);
  });

  it("treats an empty Photon answer as a failure, and waits 5 s then retries once on Overpass 429", async () => {
    const waits: number[] = [];
    let first = true;
    const http = route((u) => {
      if (u.includes("photon")) return new Response(JSON.stringify({ features: [] }));
      if (first) {
        first = false;
        return new Response("slow down", { status: 429 });
      }
      return new Response(JSON.stringify({ elements: [] }));
    });
    const r = await findPlaces(
      centre,
      { http, endpoints: DEFAULT_ENDPOINTS, sleep: async (ms) => void waits.push(ms) },
      new OverpassMirrors(),
    );
    expect(waits).toEqual([5000]);
    expect(r.nearNote).toBeDefined();
  });

  it("when both fail: one error naming both, the 'test the query' link, and no roads (as before)", async () => {
    let tigerAsked = 0;
    const http = route((u) => {
      if (u.includes("tigerweb")) {
        tigerAsked++;
        return new Response(JSON.stringify({ features: [] }));
      }
      return new Response("down", { status: 502 });
    });
    const err = await nearStep(centre, null, null, 10, { http, endpoints: DEFAULT_ENDPOINTS }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(PlacesError);
    expect(err.message).toBe(
      "Photon: Photon 502; Overpass: Overpass unreachable (overpass.kumi.systems 502; overpass.openstreetmap.fr 502; overpass.private.coffee 502; overpass-api.de 502)",
    );
    expect(err.link).toBe(
      "https://photon.komoot.io/api/?q=hospital&osm_tag=amenity:hospital&lat=36.9&lon=-80.5&limit=5",
    );
    expect(tigerAsked).toBe(3); // fetched in parallel, then discarded
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
