/** A3's scoring changes (owner, 2026-10-09): the driveway curve, rock by depth, the slope-free soil ratings, routing. */
import { polygon } from "@turf/turf";
import type { Position } from "geojson";
import { describe, expect, it } from "vitest";
import type { HttpClient } from "../http";
import { depsFor, fixtureParcel, runFixture } from "../../test/support/scenarios";
import { DEFAULT_ENDPOINTS, DEFAULT_USER_CONFIG, SCREEN_CONSTANTS } from "./config";
import { rcToLL, rcToUTM } from "./dem";
import { buildDriveway, routeDriveway, routeMany, siteDriveways, type SiteDriveway } from "./driveway";
import { routeContext, screen } from "./index";
import { drivewayPoints, rockPoints } from "./score";
import { fetchSoilLimits } from "./soils";
import type { Dem, ProgressEvent } from "./types";
import type { LatLon } from "./util";

const C = SCREEN_CONSTANTS.score.drivewayCost;
const costOf = (mid: number, legal = true, needsEasement = false): SiteDriveway =>
  ({ route: { cost: { mid }, needsEasement }, legal, entranceIndex: 0 }) as unknown as SiteDriveway;

describe("driveway points from the route's cost (A3)", () => {
  it("the owner's three costs stay clearly apart, and grow without saturating", () => {
    const p = [10_000, 50_000, 150_000, 400_000].map((c) => drivewayPoints(costOf(c)));
    expect(p.map((x) => +x.toFixed(1))).toEqual([3.6, 11.3, 19.3, 27.4]);
    expect(p[1]! - p[0]!).toBeGreaterThan(5);
    expect(p[2]! - p[1]!).toBeGreaterThan(5);
  });
  it("no route within the limit adds 10, an easement 10; capped at 40; unreachable is 40", () => {
    expect(drivewayPoints(costOf(150_000, false))).toBeCloseTo(
      drivewayPoints(costOf(150_000)) + C.noRoute,
      9,
    );
    expect(drivewayPoints(costOf(150_000, true, true))).toBeCloseTo(
      drivewayPoints(costOf(150_000)) + C.easement,
      9,
    );
    expect(drivewayPoints(costOf(5_000_000, false, true))).toBe(C.max);
    expect(drivewayPoints({ route: null, legal: false, entranceIndex: null })).toBe(C.max);
  });
});

describe("rock by depth (A3)", () => {
  it("15 at ≤ 50 cm, none at ≥ 150 cm or with no bedrock, linear between", () => {
    expect([30, 50, 94, 100, 150, 200].map((d) => +rockPoints(d).toFixed(2))).toEqual([
      15, 15, 8.4, 7.5, 0, 0,
    ]);
    expect(rockPoints(null)).toBe(0);
  });
});

describe("NRCS's ratings without the map unit's slope (A3)", () => {
  const table = (rows: (string | number)[][]) => ({
    Table: [["cokey", "mrulename", "ruledepth", "rulename", "interphr"], ...rows],
  });
  const S = "ENG - Septic Tank Absorption Fields",
    D = "ENG - Dwellings W/O Basements";
  it("slope is ignored; any other feature at 1 is very limited, above 0 somewhat, none not limited", async () => {
    let asked = "";
    const http: HttpClient = {
      fetch: async (_url, o) => {
        asked = String(new URLSearchParams(String(o?.body)).get("query"));
        return Response.json(
          table([
            ["1", S, 0, S, 1],
            ["1", S, 1, "Slope 8 to > 15%", 1],
            ["1", S, 1, "Seepage Bottom Layer, Not Aridic", 1],
            ["1", D, 0, D, 1],
            ["1", D, 1, "Slope 8 to > 15%", 1],
            ["2", S, 0, S, 0.498],
            ["2", S, 1, 'Percolation 60 - 180cm (24-72")', 0.498],
            ["2", S, 1, "Slope 8 to > 15%", 0.367],
            ["2", D, 0, D, 0.367],
            ["2", D, 1, "Slope 8 to > 15%", 0.367],
          ]),
        );
      },
    };
    const m = await fetchSoilLimits(["1", "2", "3", "x'; DROP"], { http, endpoints: DEFAULT_ENDPOINTS });
    expect(asked).toContain("'1','2','3'");
    expect(asked).not.toContain("DROP");
    expect(Object.fromEntries(m)).toEqual({
      "1": { septic: "poor", foundation: "fine" }, // seepage keeps septic very limited; foundation was slope only
      "2": { septic: "workable", foundation: "fine" },
      "3": { septic: null, foundation: null }, // NRCS doesn't rate it: the class falls back to NRCS's own
    });
  });
});

describe("routing many targets in one search (A3)", () => {
  // A bumpy synthetic grid: grades from flat to steep, so some targets need more than a low cap.
  const W = 60,
    H = 60;
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
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      const [x, y] = rcToUTM(d, r, c);
      d.z[r * W + c] =
        12 * Math.sin((x - 500000) / 25) + 9 * Math.cos((y - 4080000) / 19) + 0.08 * (x - 500000);
    }
  const ctx = {
    dFine: d,
    inside: new Uint8Array(W * H).fill(1),
    slope: new Float32Array(W * H),
    soilMask: () => new Uint8Array(W * H),
    flowAcc: () => new Float32Array(W * H),
    dw: DEFAULT_USER_CONFIG.dw,
  };
  const ll = (r: number, c: number): LatLon => rcToLL(d, r, c);
  const from = ll(2, 2);
  const targets = [ll(50, 50), ll(10, 40), ll(55, 5), ll(30, 30), ll(2, 3), ll(-5, 10)];

  it.each([0.05, 0.1, 0.2, 0.4])(
    "at a %s cap, each target's route is the one a search for it alone finds",
    (maxGrade) => {
      const opts = { maxGrade, wGrade: 1, label: "x" };
      const many = routeMany(ctx, from, targets, opts);
      const one = targets.map((t) => routeDriveway(ctx, from, t, opts));
      expect(many).toEqual(one);
      expect(one.at(-1)).toBeNull(); // off the grid
    },
  );

  it("the same with the least-steep route's keep-to-the-parcel rule", () => {
    const inside = new Uint8Array(W * H).fill(1);
    for (let r = 0; r < H; r++) for (let c = 25; c < 28; c++) if (r > 8) inside[r * W + c] = 0; // a wall, open at the top
    const walled = { ...ctx, inside };
    const opts = { maxGrade: 0.3, wGrade: 1, label: "x", insideExceptNearStartM: 10 };
    expect(routeMany(walled, from, targets, opts)).toEqual(
      targets.map((t) => routeDriveway(walled, from, t, opts)),
    );
  });
});

describe("gardens without a house site (follow-up 20, A3b)", () => {
  it("a parcel with gardens and no house site still gets soil notes and adjusted garden scores", async () => {
    // Ferney Creek with a house-site minimum no bench can meet: no house sites, the gardens are still found.
    const events: ProgressEvent[] = [];
    await screen(
      {
        ...(await fixtureParcel("ferney-creek-52-47A")),
        config: { ...DEFAULT_USER_CONFIG, houseMin: 1_000_000 },
      },
      (e) => events.push(e),
      depsFor("ferney-creek-52-47A"),
    );
    const soils = events.find((e) => e.step === "soils" && e.status === "done")!.partial!;
    expect(soils.benches ?? []).toEqual([]);
    const gardens = soils.gardens!;
    expect(gardens.length).toBeGreaterThan(0);
    for (const g of gardens) {
      expect(g.soilNote).toBeTruthy();
      expect(g.finalScore).toBeCloseTo(Math.min(SCREEN_CONSTANTS.soils.gardenScoreCap, g.score * g.adj!), 9);
    }
    // Re-sorted by the adjusted score.
    expect(gardens.map((g) => g.finalScore)).toEqual(
      [...gardens.map((g) => g.finalScore)].sort((a, b) => b! - a!),
    );
  }, 120_000);
});

// At a 5% limit: since A3b every fixture site has a route within the real 10%, so the least-steep path is exercised
// at a stricter one, on Grayson's real terrain.
const STRICT = 5;

describe("every ranked site routed at once = each routed alone (A3, Grayson at 5%: least-steep routes)", () => {
  it("siteDriveways gives each site buildDriveway's routes[0], else its overLimit", async () => {
    const { result, session: s } = await runFixture("grayson-mud-creek-6273");
    const parcel = polygon(s.parcel.geometry.coordinates as Position[][]);
    const sites = result.sites!;
    const many = siteDriveways(
      routeContext(s),
      s.roads ?? [],
      parcel,
      sites.map((x) => x.ll),
      STRICT,
    );
    sites.forEach((site, i) => {
      const one = buildDriveway(routeContext(s), s.roads ?? [], parcel, site.ll, "x", STRICT);
      expect(many[i]!.legal).toBe(!!one.routes[0]);
      if (one.routes[0]) {
        // buildDriveway's first route also carries its entrance and pioneer-track estimate; the rest is the route.
        const { entranceIndex, track: _track, ...route } = one.routes[0];
        expect(many[i]!.entranceIndex).toBe(entranceIndex);
        expect(many[i]!.route).toEqual(route);
      } else expect(many[i]!.route).toEqual(one.overLimit ?? null);
    });
    expect(many.some((x) => !x.legal && x.route)).toBe(true); // the least-steep path is exercised
  }, 180_000);
});
