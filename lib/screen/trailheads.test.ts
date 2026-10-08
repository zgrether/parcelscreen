import { describe, expect, it } from "vitest";
import { CancelledError, type HttpClient } from "../http";
import { DEFAULT_ENDPOINTS } from "./config";
import {
  mergeTrailheads,
  normalizeTrailheadName,
  officialTrailheads,
  readableName,
  type TrailheadPoint,
} from "./trailheads";

const ELK: [number, number] = [36.6389, -81.5838];
/** A point `m` metres east of ELK (1° of longitude here is about 89.4 km). */
const east = (m: number): [number, number] => [ELK[0], ELK[1] + m / 89_400];
const p = (name: string, ll: [number, number], source: TrailheadPoint["source"]): TrailheadPoint => ({
  name,
  ll,
  source,
});

describe("trailhead names (follow-up 24)", () => {
  it("normalise: case, punctuation and the words trailhead / TH / parking", () => {
    expect(normalizeTrailheadName("Elk Garden A.T.")).toBe("elk garden at");
    expect(normalizeTrailheadName("ELK GARDEN A.T. Trailhead")).toBe("elk garden at");
    expect(normalizeTrailheadName("Elk Garden TH Parking")).toBe("elk garden");
    expect(normalizeTrailheadName("Thomas Knob")).toBe("thomas knob"); // "th" only as a word
  });
  it("a shouted name reads in title case; anything else as given", () => {
    expect(readableName("ELK GARDEN A.T.")).toBe("Elk Garden A.T.");
    expect(readableName("Grayson Highlands State Park")).toBe("Grayson Highlands State Park");
    expect(readableName("A.T.")).toBe("A.T.");
  });
});

describe("merging the sources (owner, 2026-10-08): within 300 m AND the same name", () => {
  it("same name, near: one trailhead, the official point", () => {
    const m = mergeTrailheads([p("Elk Garden Trailhead", east(120), "osm"), p("ELK GARDEN", ELK, "usfs")]);
    expect(m).toEqual([p("ELK GARDEN", ELK, "usfs")]);
  });
  it("same name, far: both kept", () => {
    expect(mergeTrailheads([p("Elk Garden", ELK, "usfs"), p("Elk Garden", east(450), "osm")])).toHaveLength(
      2,
    );
  });
  it("different names, near: both kept", () => {
    expect(mergeTrailheads([p("Elk Garden", ELK, "usfs"), p("Massie Gap", east(50), "osm")])).toHaveLength(2);
  });
  it("an unnamed OSM point ('Trailhead') never matches a named one", () => {
    expect(mergeTrailheads([p("Elk Garden", ELK, "usfs"), p("Trailhead", east(10), "osm")])).toHaveLength(2);
  });
  it("of a matched pair, USFS, then the state's, then OSM's", () => {
    const m = mergeTrailheads([
      p("Grayson Highlands", ELK, "osm"),
      p("Grayson Highlands", east(100), "state"),
      p("Grayson Highlands TH", east(200), "usfs"),
    ]);
    expect(m.map((x) => x.source)).toEqual(["usfs"]);
  });
});

describe("the official sources", () => {
  /** Answers each layer's query with a point named for its host, and keeps what was asked. */
  const layers = (fail: string | null = null) => {
    const asked: { host: string; body: URLSearchParams }[] = [];
    const http: HttpClient = {
      fetch: async (url, o = {}) => {
        const host = new URL(url).host;
        const body = new URLSearchParams(String(o.body));
        asked.push({ host, body });
        if (fail && host.includes(fail)) return new Response("down", { status: 503 });
        const field = body.get("outFields")!;
        return new Response(
          JSON.stringify({
            features: [{ attributes: { [field]: host.toUpperCase() }, geometry: { x: ELK[1], y: ELK[0] } }],
          }),
        );
      },
    };
    return { http, asked };
  };

  it("asks USFS for its trailheads and each state for its parks, within 20 km, for the name field only", async () => {
    const q = layers();
    const pts = await officialTrailheads(ELK, { http: q.http, endpoints: DEFAULT_ENDPOINTS });
    expect(
      q.asked.map((a) => [a.host, a.body.get("outFields"), a.body.get("where"), a.body.get("distance")]),
    ).toEqual([
      ["apps.fs.usda.gov", "site_name", "site_subtype='TRAILHEAD'", "20000"],
      ["vginmaps.vdem.virginia.gov", "LandmkName", "PlaceType='State Park Points'", "20000"],
      ["services6.arcgis.com", "FullName", "1=1", "20000"],
      ["services5.arcgis.com", "PARK_NAME", "1=1", "20000"], // never the layer's staff contact fields
    ]);
    expect(pts.map((x) => x.source)).toEqual(["usfs", "state", "state", "state"]);
    expect(pts[0]!.name).toBe("Apps.Fs.Usda.Gov"); // shouted names read in title case
  });

  it("a source that fails is left out; the others stand", async () => {
    const pts = await officialTrailheads(ELK, { http: layers("fs.usda").http, endpoints: DEFAULT_ENDPOINTS });
    expect(pts.map((x) => x.source)).toEqual(["state", "state", "state"]);
  });

  it("a cancel still cancels", async () => {
    const http: HttpClient = { fetch: async () => Promise.reject(new CancelledError()) };
    await expect(officialTrailheads(ELK, { http, endpoints: DEFAULT_ENDPOINTS })).rejects.toBeInstanceOf(
      CancelledError,
    );
  });
});
