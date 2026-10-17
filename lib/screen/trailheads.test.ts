import { describe, expect, it } from "vitest";
import { CancelledError, type HttpClient } from "../http";
import { DEFAULT_ENDPOINTS } from "./config";
import {
  mergeTrailheads,
  normalizeTrailheadName,
  officialTrailheads,
  readableName,
  servesLine,
  trailheadSourceLabel,
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
    expect(readableName("BEECH MOUNTAIN AT")).toBe("Beech Mountain AT"); // the Appalachian Trail, not "at"
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

describe("Tennessee's TREC trails (step 2, owner 2026-10-17): merged by distance alone, within 150 m", () => {
  const trec = (trail: string, ll: [number, number]): TrailheadPoint => ({
    name: trail,
    ll,
    source: "state",
    trec: true,
  });

  it("three TREC trails from one lot and a USFS point 80 m away: one trailhead, the USFS one, serving three trails", () => {
    const m = mergeTrailheads([
      trec("Hump Mountain Trail", east(80)),
      trec("Appalachian Trail", east(85)),
      trec("Overmountain Victory Trail", east(90)),
      p("Yellow Mountain Gap", ELK, "usfs"),
    ]);
    expect(m).toEqual([
      {
        ...p("Yellow Mountain Gap", ELK, "usfs"),
        serves: ["Appalachian Trail", "Hump Mountain Trail", "Overmountain Victory Trail"],
      },
    ]);
    expect(servesLine(m[0]!)).toBe(
      "serves: Appalachian Trail, Hump Mountain Trail, Overmountain Victory Trail",
    );
  });

  it("whatever the names, an OSM or state point within 150 m takes it; the nearest one when several", () => {
    const m = mergeTrailheads([
      p("Carvers Gap", ELK, "osm"),
      p("Roan Mountain State Park", east(140), "state"),
      trec("Grassy Ridge Trail", east(100)),
    ]);
    expect(m.find((x) => x.name === "Roan Mountain State Park")!.serves).toEqual(["Grassy Ridge Trail"]);
    expect(m.find((x) => x.name === "Carvers Gap")!.serves).toBeUndefined();
  });

  it("beyond 150 m it's its own trailhead, named for its trail, serving only that one (no 'serves' line)", () => {
    const m = mergeTrailheads([p("Elk Garden", ELK, "usfs"), trec("Iron Mountain Trail", east(160))]);
    expect(m.map((x) => [x.name, x.source, x.serves])).toEqual([
      ["Elk Garden", "usfs", undefined],
      ["Iron Mountain Trail", "state", ["Iron Mountain Trail"]],
    ]);
    expect(servesLine(m[1]!)).toBeNull();
  });

  it("TREC points within 150 m of each other collapse to one trailhead listing all their trails, in a chain too", () => {
    const m = mergeTrailheads([trec("B Trail", ELK), trec("A Trail", east(120)), trec("C Trail", east(240))]);
    expect(m).toEqual([
      { name: "A Trail", ll: ELK, source: "state", serves: ["A Trail", "B Trail", "C Trail"] },
    ]);
  });

  it("the 300 m and same-name rule still holds for every other pair", () => {
    const m = mergeTrailheads([p("Elk Garden", ELK, "usfs"), p("Elk Garden", east(250), "osm")]);
    expect(m).toHaveLength(1);
    expect(mergeTrailheads([p("Elk Garden", ELK, "usfs"), p("Massie Gap", east(100), "osm")])).toHaveLength(
      2,
    );
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
        // TREC's trails (step 2): no geometry, the trailheads' coordinates as fields.
        if (field.includes("Trail_Name"))
          return new Response(
            JSON.stringify({
              features: [
                {
                  attributes: {
                    Trail_Name: "TREC TRAIL",
                    PrimaryTrailhead_Latitude: ELK[0] + 0.02,
                    PrimaryTrailhead_Longitude: ELK[1],
                    SecondaryTrailhead_Latitude: 0,
                    SecondaryTrailhead_Longitude: 0,
                  },
                },
              ],
            }),
          );
        return new Response(
          JSON.stringify({
            features: [{ attributes: { [field]: host.toUpperCase() }, geometry: { x: ELK[1], y: ELK[0] } }],
          }),
        );
      },
    };
    return { http, asked };
  };

  it("asks USFS for its trailheads and each state for its parks, within 36 km (22 mi, the Trails row's last cutoff), for the name field only", async () => {
    const q = layers();
    const pts = await officialTrailheads(ELK, { http: q.http, endpoints: DEFAULT_ENDPOINTS });
    expect(
      q.asked.map((a) => [a.host, a.body.get("outFields"), a.body.get("where"), a.body.get("distance")]),
    ).toEqual([
      ["apps.fs.usda.gov", "site_name", "site_subtype='TRAILHEAD'", "36000"],
      ["vginmaps.vdem.virginia.gov", "LandmkName", "PlaceType='State Park Points'", "36000"],
      ["services6.arcgis.com", "FullName", "1=1", "36000"],
      ["services5.arcgis.com", "PARK_NAME", "1=1", "36000"], // never the layer's staff contact fields
      // TREC (step 2): an envelope, the names and trailhead coordinates only, never the lines.
      [
        "services1.arcgis.com",
        "OBJECTID,Trail_Name,PrimaryTrailhead_Latitude,PrimaryTrailhead_Longitude,SecondaryTrailhead_Latitude,SecondaryTrailhead_Longitude",
        null,
        null,
      ],
    ]);
    const trec = q.asked.at(-1)!.body;
    expect([trec.get("geometryType"), trec.get("returnGeometry")]).toEqual(["esriGeometryEnvelope", "false"]);
    expect(pts.map((x) => x.source)).toEqual(["usfs", "state", "state", "state", "state"]);
    // The secondary trailhead at 0,0 is dropped; the primary is a TREC point named for its trail.
    expect(pts.filter((x) => x.trec).map((x) => x.name)).toEqual(["Trec Trail"]);
    expect(pts[0]!.name).toBe("Apps.Fs.Usda.Gov"); // shouted names read in title case
  });

  it("a source that fails is left out, and named as unanswered (v4); the others stand", async () => {
    const unanswered: string[] = [];
    const pts = await officialTrailheads(
      ELK,
      { http: layers("fs.usda").http, endpoints: DEFAULT_ENDPOINTS },
      unanswered,
    );
    expect(pts.map((x) => x.source)).toEqual(["state", "state", "state", "state"]);
    expect(unanswered).toEqual(["USFS recreation sites"]);
    const none: string[] = [];
    await officialTrailheads(ELK, { http: layers("arcgis.com").http, endpoints: DEFAULT_ENDPOINTS }, none);
    expect(none).toEqual([
      "state parks (services6.arcgis.com)",
      "state parks (services5.arcgis.com)",
      "state trails (Tennessee_Statewide_Trails_Lines_Public)",
    ]);
  });

  it("each unanswered list has the report's name for it (follow-up 53); anything else isn't a trailhead list", async () => {
    const unanswered: string[] = [];
    const fails: HttpClient = { fetch: async () => new Response("down", { status: 503 }) };
    await officialTrailheads(ELK, { http: fails, endpoints: DEFAULT_ENDPOINTS }, unanswered);
    expect(unanswered.map(trailheadSourceLabel)).toEqual([
      "USFS recreation sites",
      "VA state parks (VGIN)",
      "NC state parks (DPR)",
      "TN state parks (TDEC)",
      "TN trails (TDEC)",
    ]);
    expect(trailheadSourceLabel("state parks (parks.example.gov)")).toBe("state parks (parks.example.gov)");
    expect(trailheadSourceLabel("OpenStreetMap roads")).toBeNull();
    expect(trailheadSourceLabel("PAD-US (open land beyond a mile)")).toBeNull();
  });

  it("asks a state's parks only when the state is within reach (#122 review): out of reach, its failure can't flag", async () => {
    // Floyd County, VA (Ferney Creek): no NC or TN land within 36 km.
    const FLOYD: [number, number] = [36.8874, -80.4546];
    const q = layers("services5"); // TN would fail, if it were asked
    const unanswered: string[] = [];
    await officialTrailheads(FLOYD, { http: q.http, endpoints: DEFAULT_ENDPOINTS }, unanswered);
    expect(q.asked.map((a) => a.host)).toEqual(["apps.fs.usda.gov", "vginmaps.vdem.virginia.gov"]);
    expect(unanswered).toEqual([]);

    // Raleigh, NC: only NC's, and USFS's, which is asked everywhere.
    const r = layers();
    await officialTrailheads([35.78, -78.64], { http: r.http, endpoints: DEFAULT_ENDPOINTS });
    expect(r.asked.map((a) => a.host)).toEqual(["apps.fs.usda.gov", "services6.arcgis.com"]);
  });

  it("near a state line asks every state in reach: Grayson's Mud Creek, VA, NC and TN; a failure there is named", async () => {
    const MUD_CREEK: [number, number] = [36.5854, -81.562];
    const q = layers("services5");
    const unanswered: string[] = [];
    await officialTrailheads(MUD_CREEK, { http: q.http, endpoints: DEFAULT_ENDPOINTS }, unanswered);
    expect(q.asked.map((a) => a.host)).toEqual([
      "apps.fs.usda.gov",
      "vginmaps.vdem.virginia.gov",
      "services6.arcgis.com",
      "services5.arcgis.com",
      "services1.arcgis.com",
    ]);
    expect(unanswered).toEqual(["state parks (services5.arcgis.com)"]);
  });

  it("a cancel still cancels", async () => {
    const http: HttpClient = { fetch: async () => Promise.reject(new CancelledError()) };
    await expect(officialTrailheads(ELK, { http, endpoints: DEFAULT_ENDPOINTS })).rejects.toBeInstanceOf(
      CancelledError,
    );
  });
});
