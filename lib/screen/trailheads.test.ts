import { describe, expect, it } from "vitest";
import { CancelledError, type HttpClient } from "../http";
import { DEFAULT_ENDPOINTS } from "./config";
import { cellsWithin, type Place, type PlaceSource, type PlacesSource } from "./placeData";
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
/** A client that must not be asked: the places come from the source given. */
const noHttp: HttpClient = {
  fetch: async () => {
    throw new Error("no request expected");
  },
};
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

describe("the official sources, baked (step 14d)", () => {
  const place = (id: string, src: PlaceSource, ll: [number, number], trec?: true): Place => ({
    kind: "trailhead",
    id,
    name: id,
    ll,
    src,
    ...(trec ? { trec } : {}),
  });
  /** The official cells around Elk Garden, and which cells were asked for. */
  const baked = () => {
    const asked: { folder: string; cells: readonly string[] }[] = [];
    const places: PlacesSource = async (folder, cells) => {
      asked.push({ folder, cells });
      return [
        place("usfs:1", "usfs", ELK),
        place("va-parks:2", "va-parks", east(500)),
        place("nc-parks:3", "nc-parks", east(35_000)),
        place("tn-parks:4", "tn-parks", east(37_000)), // past 36 km
        place("tn-trec:5:p", "tn-trec", east(900), true),
        { kind: "grocer", id: "osm:node/9", name: "Food Lion", ll: ELK, src: "osm", big: true },
      ];
    };
    return { places, asked };
  };

  it("reads the official cells within 36 km (22 mi, the Trails row's last cutoff), each source as its rank", async () => {
    const b = baked();
    const pts = await officialTrailheads(ELK, {
      http: noHttp,
      endpoints: DEFAULT_ENDPOINTS,
      places: b.places,
    });
    expect(b.asked).toEqual([{ folder: "official", cells: cellsWithin(ELK, 36) }]);
    expect(pts.map((x) => [x.name, x.source, x.trec ?? false])).toEqual([
      ["usfs:1", "usfs", false],
      ["va-parks:2", "state", false],
      ["nc-parks:3", "state", false],
      ["tn-trec:5:p", "state", true],
    ]);
  });

  it("without a source given, reads endpoints.places through the client", async () => {
    const seen: string[] = [];
    const http: HttpClient = {
      fetch: async (url) => {
        seen.push(url);
        return new Response("", { status: 404 });
      },
    };
    expect(await officialTrailheads(ELK, { http, endpoints: DEFAULT_ENDPOINTS })).toEqual([]);
    expect(seen[0]).toBe(`${DEFAULT_ENDPOINTS.places}/official/${cellsWithin(ELK, 36)[0]}.json`);
  });

  it("the cells failing rejects (the near step loses its places half); a cancel still cancels", async () => {
    const down: PlacesSource = async () => Promise.reject(new Error("places official/36_-82: 503"));
    await expect(
      officialTrailheads(ELK, { http: noHttp, endpoints: DEFAULT_ENDPOINTS, places: down }),
    ).rejects.toThrow(/503/);
    const cancel: PlacesSource = async () => Promise.reject(new CancelledError());
    await expect(
      officialTrailheads(ELK, { http: noHttp, endpoints: DEFAULT_ENDPOINTS, places: cancel }),
    ).rejects.toBeInstanceOf(CancelledError);
  });

  it("an older grade's unanswered list still reads in the report's words (follow-up 53)", () => {
    expect(
      [
        "USFS recreation sites",
        "state parks (vginmaps.vdem.virginia.gov)",
        "state parks (services6.arcgis.com)",
        "state parks (services5.arcgis.com)",
        "state trails (Tennessee_Statewide_Trails_Lines_Public)",
      ].map(trailheadSourceLabel),
    ).toEqual([
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
});
