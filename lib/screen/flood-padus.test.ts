import type { Feature, Polygon } from "geojson";
import { describe, expect, it } from "vitest";
import { differences } from "../../test/support/compare";
import { FIXTURE_SLUGS, loadFixture } from "../../test/support/fixtures";
import { fromPrototype } from "../../test/support/fromPrototype";
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
    const golden = fromPrototype(loadFixture(slug).goldens.run);

    const f = await floodStep(t.parcel, t.acres, t.deps);
    expect(differences(f.flood, golden.flood)).toEqual([]);
    for (const flag of f.flags) expect(golden.flags).toContainEqual(flag);
    expect(golden.flags.filter((x) => /FEMA Special Flood Hazard Area/.test(x.t))).toHaveLength(
      f.flags.length,
    );

    const p = await padusStep(t.parcel, t.deps);
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
    expect(differences(f.flood, fromPrototype(loadFixture("ferney-creek-52-47A").goldens.run).flood)).toEqual(
      [],
    );
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
