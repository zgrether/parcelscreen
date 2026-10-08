import type { Feature, Polygon } from "geojson";
import { describe, expect, it } from "vitest";
import { differences } from "../../test/support/compare";
import { FIXTURE_SLUGS, loadFixture } from "../../test/support/fixtures";
import { expectedOf } from "../../test/support/expected";
import { instantClock, throughSites } from "../../test/support/pipeline";
import { createHttpClient, TimeoutError, type HttpClient, type RequestOptions } from "../http";
import { DEFAULT_ENDPOINTS } from "./config";
import { floodStep, inSfha, type FloodFeature } from "./flood";
import { padusStep } from "./padus";

const square = (w: number, s: number, e: number, n: number): Feature<Polygon> => ({
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    ],
  },
});
const serve = (body: unknown): HttpClient => ({ fetch: async () => new Response(JSON.stringify(body)) });

describe.each(FIXTURE_SLUGS)("flood and public land on %s vs the prototype", (slug) => {
  it("matches flood, protected land and their flags", async () => {
    const t = await throughSites(slug);
    const golden = expectedOf(slug, "run");

    const f = await floodStep(t.measured, t.acres, t.deps);
    expect(differences(f.flood, golden.flood)).toEqual([]);
    for (const flag of f.flags) expect(golden.flags).toContainEqual(flag);
    expect(golden.flags.filter((x) => /FEMA Special Flood Hazard Area/.test(x.t))).toHaveLength(
      f.flags.length,
    );

    const p = await padusStep(t.measured, t.deps);
    expect(differences(p.protected, golden.protected)).toEqual([]);
    for (const flag of p.flags) expect(golden.flags).toContainEqual(flag);
    expect(golden.flags.filter((x) => /^Adjoins/.test(x.t))).toHaveLength(p.flags.length);
  });
});

describe("flood step (synthetic)", () => {
  const parcel = square(-80.5, 36.9, -80.49, 36.91); // ~220 ac
  const zone = (props: object, w = -80.5, s = 36.9, e = -80.495, n = 36.91): FloodFeature =>
    ({ ...square(w, s, e, n), properties: props }) as FloodFeature;

  it("counts SFHA acreage inside the parcel and makes more than 30% fatal", async () => {
    const half = zone({ FLD_ZONE: "AE", SFHA_TF: "T" });
    const r = await floodStep(parcel, 220, {
      http: serve({ features: [half, zone({ FLD_ZONE: "X", SFHA_TF: "F" })] }),
      endpoints: DEFAULT_ENDPOINTS,
    });
    expect(r.flood.zones).toEqual(["AE", "X"]);
    expect(r.flood.sfha).toBe(true);
    expect(r.flood.sfhaAcres).toBeGreaterThan(100);
    expect(r.flags[0]!.lvl).toBe("fatal");
    expect(r.flags[0]!.t).toMatch(
      /^\d+\.\d of 220\.0 acres are in a FEMA Special Flood Hazard Area \(AE, X\)\. Post-Helene/,
    );
    expect(r.sfha).toEqual([half]);
  });

  it("unmapped areas are 'not mapped', not 'safe'", async () => {
    const r = await floodStep(parcel, 220, { http: serve({ features: [] }), endpoints: DEFAULT_ENDPOINTS });
    expect(r.flood).toEqual({ zones: [], sfha: false, sfhaAcres: 0, mapped: false });
    expect(r.flags).toEqual([]);
  });

  it("inSfha tests points against the SFHA polygons", () => {
    const sfha = [zone({ SFHA_TF: "T" })];
    expect(inSfha(sfha, [36.905, -80.498])).toBe(true);
    expect(inSfha(sfha, [36.905, -80.49])).toBe(false);
    expect(inSfha(null, [36.905, -80.498])).toBe(false);
  });
});

describe("public land step (synthetic)", () => {
  const parcel = square(-80.5, 36.9, -80.49, 36.91);
  const unit = (props: object, w: number, e: number) => ({ ...square(w, 36.9, e, 36.91), properties: props });

  it("open land on the line is 'good'; distance is measured for land that doesn't adjoin", async () => {
    const r = await padusStep(parcel, {
      http: serve({
        features: [
          unit(
            { Unit_Nm: "Jefferson NF", Mang_Name: "USFS", Des_Tp: "NF", Pub_Access: "OA", GAP_Sts: "3" },
            -80.49,
            -80.48,
          ),
          unit(
            { Unit_Nm: "Far WMA", Mang_Name: "DWR", Des_Tp: "SW", Pub_Access: "OA", GAP_Sts: "2" },
            -80.47,
            -80.46,
          ),
        ],
      }),
      endpoints: DEFAULT_ENDPOINTS,
    });
    expect(r.protected[0]!.adjoins).toBe(true);
    expect(r.protected[0]!.distFt).toBeNull();
    expect(r.protected[1]!.adjoins).toBe(false);
    expect(r.protected[1]!.distFt!).toBeGreaterThan(5000);
    expect(r.flags).toEqual([
      {
        lvl: "good",
        t: "Adjoins publicly accessible protected land: Jefferson NF. That's the acre you never pay for.",
      },
    ]);
  });

  it("restricted land on the line is only a buffer", async () => {
    const r = await padusStep(parcel, {
      http: serve({ features: [unit({ Unit_Nm: "Private easement", Pub_Access: "XA" }, -80.49, -80.48)] }),
      endpoints: DEFAULT_ENDPOINTS,
    });
    expect(r.flags).toEqual([
      {
        lvl: "warn",
        t: "Adjoins protected land, but it's restricted or closed to the public — a buffer, not a backyard.",
      },
    ]);
  });

  it("tries each PAD-US endpoint and reports all failures", async () => {
    const http: HttpClient = { fetch: async () => new Response("down", { status: 502 }) };
    await expect(
      padusStep(parcel, {
        http,
        endpoints: {
          ...DEFAULT_ENDPOINTS,
          padus: [
            "https://a.test/arcgis/rest/services/A/FeatureServer/0",
            "https://b.test/arcgis/rest/services/B/FeatureServer/0",
          ],
        },
      }),
    ).rejects.toThrow("A/FeatureServer/0 502: down | B/FeatureServer/0 502: down");
  });
});

describe("FEMA timeouts (follow-up 22), replayed on Ferney Creek", () => {
  /**
   * The recorded responses, but the first NFHL request hangs like a stalled server, and the second (when
   * `second` is set) answers after that many ms. The flood step's limits are scaled 1000× down, so 30 s and
   * 45 s become 30 ms and 45 ms: a 35 ms answer only arrives within the longer limit.
   */
  const stalling = async (second: number | null) => {
    const t = await throughSites("ferney-creek-52-47A");
    const replay = loadFixture("ferney-creek-52-47A").replayFetch();
    let calls = 0;
    const fetchImpl = (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      if (!String(url).includes("NFHL")) return replay(url, init);
      calls++;
      return new Promise((resolve, reject) => {
        const timer =
          calls === 2 && second !== null ? setTimeout(() => resolve(replay(url, init)), second) : undefined;
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    };
    const real = createHttpClient({ env: "node", fetchImpl, clock: instantClock() });
    const asked: RequestOptions[] = [];
    const http: HttpClient = {
      fetch: (url, o = {}) => {
        if (!url.includes("NFHL")) return real.fetch(url, o);
        asked.push(o);
        return real.fetch(url, {
          ...o,
          ...(o.timeoutMs !== undefined ? { timeoutMs: o.timeoutMs / 1000 } : {}),
          ...(o.retryTimeoutMs !== undefined ? { retryTimeoutMs: o.retryTimeoutMs / 1000 } : {}),
        });
      },
    };
    return { t, http, asked, calls: () => calls };
  };

  it("a timeout, then an answer within the longer limit, gives the golden flood result", async () => {
    const s = await stalling(35);
    const f = await floodStep(s.t.parcel, s.t.acres, { ...s.t.deps, http: s.http });
    expect(differences(f.flood, expectedOf("ferney-creek-52-47A", "run").flood)).toEqual([]);
    expect(s.calls()).toBe(2);
    expect(s.asked).toEqual([expect.objectContaining({ timeoutMs: 30_000, retryTimeoutMs: 45_000 })]);
  });

  it("two timeouts: the step fails as before", async () => {
    const s = await stalling(null);
    await expect(floodStep(s.t.parcel, s.t.acres, { ...s.t.deps, http: s.http })).rejects.toBeInstanceOf(
      TimeoutError,
    );
    expect(s.calls()).toBe(2);
  });
});

describe("FEMA network failures and 5xx (owner, after 18b), replayed on Ferney Creek", () => {
  type Failure = "reject" | number;
  /** The recorded responses, but the NFHL requests fail as listed, in turn; past the list, they answer. */
  const failing = async (...failures: Failure[]) => {
    const t = await throughSites("ferney-creek-52-47A");
    const replay = loadFixture("ferney-creek-52-47A").replayFetch();
    let calls = 0;
    const fetchImpl = (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      if (!String(url).includes("NFHL")) return replay(url, init);
      const f = failures[calls++];
      if (f === undefined) return replay(url, init);
      if (f === "reject") return Promise.reject(new TypeError("Failed to fetch"));
      return Promise.resolve(new Response("Service unavailable", { status: f }));
    };
    const real = createHttpClient({ env: "node", fetchImpl, clock: instantClock() });
    const asked: RequestOptions[] = [];
    const http: HttpClient = {
      fetch: (url, o = {}) => {
        if (url.includes("NFHL")) asked.push(o);
        return real.fetch(url, o);
      },
    };
    return { t, http, asked, calls: () => calls };
  };
  const golden = () => expectedOf("ferney-creek-52-47A", "run").flood;

  it.each<Failure>(["reject", 500, 502, 504])(
    "%s, then an answer, gives the golden flood result",
    async (f) => {
      const s = await failing(f);
      const r = await floodStep(s.t.parcel, s.t.acres, { ...s.t.deps, http: s.http });
      expect(differences(r.flood, golden())).toEqual([]);
      expect(s.calls()).toBe(2);
      expect(s.asked).toEqual([
        expect.objectContaining({ timeoutMs: 30_000, retryTimeoutMs: 45_000, retryTransient: true }),
      ]);
    },
  );

  it("two network failures: the step fails as before", async () => {
    const s = await failing("reject", "reject");
    await expect(floodStep(s.t.parcel, s.t.acres, { ...s.t.deps, http: s.http })).rejects.toThrow(
      "Failed to fetch",
    );
    expect(s.calls()).toBe(2);
  });

  it("two 5xx: the step fails with the service and the status, as before", async () => {
    const s = await failing(502, 500);
    await expect(floodStep(s.t.parcel, s.t.acres, { ...s.t.deps, http: s.http })).rejects.toThrow(
      "NFHL/MapServer/28 500: Service unavailable",
    );
    expect(s.calls()).toBe(2);
  });

  it.each([400, 404])("a %i isn't retried", async (status) => {
    const s = await failing(status);
    await expect(floodStep(s.t.parcel, s.t.acres, { ...s.t.deps, http: s.http })).rejects.toThrow(
      `NFHL/MapServer/28 ${status}`,
    );
    expect(s.calls()).toBe(1);
  });
});

describe("public land: the nearest part, and land open beyond the mile (follow-up 23)", () => {
  const parcel = square(-80.5, 36.9, -80.49, 36.91); // about 0.9 × 1.1 km
  type Props = { Unit_Nm: string; Mang_Name: string; Des_Tp: string; Pub_Access: string; GAP_Sts: string };
  const props = (name: string, access = "OA", manager = "USFS"): Props => ({
    Unit_Nm: name,
    Mang_Name: manager,
    Des_Tp: "NF",
    Pub_Access: access,
    GAP_Sts: "3",
  });
  const ring = (w: number, s: number, e: number, n: number) => [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
    [w, s],
  ];
  /** A unit east of the parcel, `km` from its edge (1° of longitude here is about 89 km). */
  const east = (p: Props, km: number) => ({
    ...square(-80.49 + km / 89, 36.9, -80.48 + km / 89, 36.91),
    properties: p,
  });
  /** Answers the 1,600 m query with `mile` and the wider one with `wide` (or a 500), and keeps what was asked. */
  const twoQueries = (mile: object[], wide: object[] | "down") => {
    const asked: URLSearchParams[] = [];
    const http: HttpClient = {
      fetch: async (_url, o = {}) => {
        const b = new URLSearchParams(String(o.body));
        asked.push(b);
        if (b.get("distance") === "1600") return new Response(JSON.stringify({ features: mile }));
        return wide === "down"
          ? new Response("down", { status: 500 })
          : new Response(JSON.stringify({ features: wide }));
      },
    };
    return { http, asked };
  };
  const names = (r: Awaited<ReturnType<typeof padusStep>>) => r.protected.map((u) => u.name);

  it("measures a multi-part unit to its nearest part, not its first", async () => {
    const fund = {
      type: "Feature",
      properties: props("Land Fund", "RA", "UNK"),
      geometry: {
        type: "MultiPolygon",
        coordinates: [[ring(-80.38, 36.9, -80.37, 36.91)], [ring(-80.484, 36.9, -80.48, 36.91)]], // ~10 km, ~0.5 km
      },
    };
    const r = await padusStep(parcel, { ...twoQueries([fund], []), endpoints: DEFAULT_ENDPOINTS });
    const ft = r.protected[0]!.distFt!;
    expect(ft / 3.28084).toBeGreaterThan(450);
    expect(ft / 3.28084).toBeLessThan(600); // the near part; its first part alone is ~10 km
  });

  it("adds open land beyond the mile after the mile's units, nearest first, and never a unit the mile found", async () => {
    const park = props("Park");
    const q = twoQueries(
      [east(props("Land Fund", "RA", "UNK"), 0.5), east(park, 0.8)],
      [
        east(props("Far Forest"), 8),
        east(park, 0.7), // the mile's unit again (simplified): its full-geometry copy stands
        east(props("Near Forest"), 1), // within the mile: the mile's query is the only source there
        east(props("Forest"), 4),
      ],
    );
    const r = await padusStep(parcel, { ...q, endpoints: DEFAULT_ENDPOINTS });
    expect(names(r)).toEqual(["Land Fund", "Park", "Forest", "Far Forest"]);
    expect(r.protected.slice(2).every((u) => !u.adjoins && u.distFt! > 1600 * 3.28084)).toBe(true);
    expect(r.protected[1]!.distFt! / 3.28084).toBeCloseTo(800, -2); // the full-geometry copy's distance

    // The wider query: open land only, 16 km, simplified; the mile's query as it always was.
    const [mile, wide] = q.asked;
    expect([mile!.get("distance"), mile!.get("where"), mile!.get("maxAllowableOffset")]).toEqual([
      "1600",
      null,
      null,
    ]);
    expect([wide!.get("distance"), wide!.get("where"), wide!.get("maxAllowableOffset")]).toEqual([
      "16000",
      "Pub_Access='OA'",
      "0.0002",
    ]);
    expect(wide!.get("outFields")).toBe(mile!.get("outFields"));
    expect(mile!.get("outFields")).toContain("Loc_Mang"); // the local manager name, for the list and the line
  });

  it("the adjoins flags come from the mile's query only", async () => {
    const forest = east(props("Jefferson NF"), 0); // adjoins
    const mileOnly = await padusStep(parcel, { ...twoQueries([forest], []), endpoints: DEFAULT_ENDPOINTS });
    const withWide = await padusStep(parcel, {
      ...twoQueries([forest], [east(props("Other NF"), 3), east(props("Third NF"), 6)]),
      endpoints: DEFAULT_ENDPOINTS,
    });
    expect(withWide.flags).toEqual(mileOnly.flags);
  });

  it("a failed wider query leaves the mile's units and flags, and fails nothing", async () => {
    const r = await padusStep(parcel, {
      ...twoQueries([east(props("Park"), 0.8)], "down"),
      endpoints: DEFAULT_ENDPOINTS,
    });
    expect(names(r)).toEqual(["Park"]);
  });
});

describe("flood: two trimmed queries, measured on the parcel's own land (A2a, owner 2026-10-08)", () => {
  const own = {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "MultiPolygon" as const,
      coordinates: [
        square(-80.5, 36.9, -80.495, 36.91).geometry.coordinates,
        square(-80.494, 36.9, -80.49, 36.91).geometry.coordinates,
      ],
    },
  };
  /** Zones without geometry for the first query; the SFHA features with geometry for the second. */
  const nfhl = (zones: FloodFeature[]) => {
    const asked: URLSearchParams[] = [];
    const http: HttpClient = {
      fetch: async (_u, o = {}) => {
        const b = new URLSearchParams(String(o.body));
        asked.push(b);
        const sfhaOnly = b.get("where") === "SFHA_TF='T'";
        const feats = zones
          .filter((z) => !sfhaOnly || z.properties.SFHA_TF === "T")
          .map((z) => (b.get("returnGeometry") === "false" ? { ...z, geometry: null } : z));
        return new Response(JSON.stringify({ features: feats }));
      },
    };
    return { http, asked };
  };
  // A flood zone on the strip only (between the parts), and one on the west part.
  const onStrip = {
    ...square(-80.495, 36.9, -80.494, 36.91),
    properties: { FLD_ZONE: "AE", SFHA_TF: "T" },
  } as FloodFeature;
  const onPart = {
    ...square(-80.5, 36.9, -80.499, 36.91),
    properties: { FLD_ZONE: "A", SFHA_TF: "T" },
  } as FloodFeature;

  it("asks for zones without geometry, then geometry for the SFHA features only, with the fields it uses", async () => {
    const q = nfhl([
      onPart,
      { ...square(-80.5, 36.9, -80.49, 36.91), properties: { FLD_ZONE: "X", SFHA_TF: "F" } } as FloodFeature,
    ]);
    await floodStep(own, 10, { http: q.http, endpoints: DEFAULT_ENDPOINTS });
    expect(q.asked.map((b) => [b.get("outFields"), b.get("returnGeometry"), b.get("where")])).toEqual([
      ["FLD_ZONE,SFHA_TF", "false", null],
      ["FLD_ZONE,SFHA_TF", "true", "SFHA_TF='T'"],
    ]);
    // The query is the own land: both parts' rings.
    expect(JSON.parse(q.asked[0]!.get("geometry")!).rings).toHaveLength(2);
  });

  it("no SFHA zone: one query", async () => {
    const q = nfhl([
      { ...square(-80.5, 36.9, -80.49, 36.91), properties: { FLD_ZONE: "X", SFHA_TF: "F" } } as FloodFeature,
    ]);
    const r = await floodStep(own, 10, { http: q.http, endpoints: DEFAULT_ENDPOINTS });
    expect(q.asked).toHaveLength(1);
    expect(r.flood).toEqual({ zones: ["X"], sfha: false, sfhaAcres: 0, mapped: true });
  });

  it("flood acres count the own land, never the strip", async () => {
    const strip = await floodStep(own, 10, { ...nfhl([onStrip]), endpoints: DEFAULT_ENDPOINTS });
    expect(strip.flood.sfhaAcres).toBeLessThan(1e-6); // touches the parts' edges only
    const part = await floodStep(own, 10, { ...nfhl([onPart]), endpoints: DEFAULT_ENDPOINTS });
    expect(part.flood.sfhaAcres).toBeGreaterThan(1);
  });
});

describe("public land: the manager the report names (owner, #80 review, 2026-10-08)", () => {
  const parcel = square(-80.5, 36.9, -80.49, 36.91);
  const unit = (props: object, km: number) => ({
    ...square(-80.49 + km / 89, 36.9, -80.48 + km / 89, 36.91),
    properties: { Pub_Access: "OA", GAP_Sts: "3", ...props },
  });
  it("a federal unit by its agency code; a state or local one by its local name, else its code", async () => {
    const http: HttpClient = {
      fetch: async (_u, o = {}) => {
        const mile = new URLSearchParams(String(o.body)).get("distance") === "1600";
        return new Response(
          JSON.stringify({
            features: mile
              ? [
                  unit(
                    {
                      Unit_Nm: "Jefferson NF",
                      Mang_Name: "USFS",
                      Mang_Type: "FED",
                      Loc_Mang: "Forest Service Region 08 Southern",
                      Des_Tp: "NF",
                    },
                    0.5,
                  ),
                  unit(
                    {
                      Unit_Nm: "Grayson Highlands SP",
                      Mang_Name: "SDC",
                      Mang_Type: "STAT",
                      Loc_Mang: "VA Dept of Conservation and Recreation",
                      Des_Tp: "SP",
                    },
                    0.6,
                  ),
                  unit(
                    {
                      Unit_Nm: "Game Land",
                      Mang_Name: "UNK",
                      Mang_Type: "UNK",
                      Loc_Mang: " ",
                      Des_Tp: "SOTH",
                    },
                    0.7,
                  ),
                ]
              : [],
          }),
        );
      },
    };
    const r = await padusStep(parcel, { http, endpoints: DEFAULT_ENDPOINTS });
    expect(r.protected.map((u) => u.manager)).toEqual([
      "USFS",
      "VA Dept of Conservation and Recreation",
      "UNK",
    ]);
  });
});
