import { describe, expect, it } from "vitest";
import { createHttpClient } from "../http";
import { PlaceCellSchema, PlacesIndexSchema, type Place } from "../screen/placeData";
import { areaCells, bakePlaces, inArea, osmCellQuery, osmPlaces } from "./bake";

const MUD_CREEK: [number, number] = [36.598, -81.303];

describe("the baked area", () => {
  it("is VA, NC and TN plus 60 km", () => {
    expect(inArea(MUD_CREEK)).toBe(true);
    expect(inArea([36.6, -84.9])).toBe(true); // Kentucky, 20 km from Tennessee
    expect(inArea([39.5, -77.5])).toBe(true); // Maryland, about 30 km from Virginia
    expect(inArea([33.0, -87.0])).toBe(false); // central Alabama
    expect(inArea([40.5, -80.0])).toBe(false); // Pittsburgh
  });

  it("covers the fixtures' cells and none far off", () => {
    const cells = areaCells();
    for (const c of ["36_-82", "35_-82", "36_-83", "37_-81"]) expect(cells).toContain(c);
    expect(cells).not.toContain("40_-92");
    expect(cells).not.toContain("33_-75"); // the Atlantic
    expect(cells.length).toBeGreaterThan(60);
    expect(cells.length).toBeLessThan(140);
  });
});

describe("OSM's places", () => {
  it("asks a cell's box for supermarkets and both trailhead tags", () => {
    expect(osmCellQuery("36_-82")).toContain("[bbox:36,-82,37,-81]");
    expect(osmCellQuery("36_-82")).toContain('nwr["information"="trailhead"]');
  });

  it("names the unnamed as the near step did, marks chains, and keeps only the area's", () => {
    const places = osmPlaces([
      { type: "node", id: 1, lat: 36.6, lon: -81.3, tags: { shop: "supermarket", name: "Food Lion" } },
      { type: "way", id: 2, center: { lat: 36.61, lon: -81.31 }, tags: { shop: "supermarket" } },
      { type: "node", id: 3, lat: 36.62, lon: -81.32, tags: { highway: "trailhead" } },
      { type: "node", id: 4, lat: 33.0, lon: -87.0, tags: { highway: "trailhead", name: "Far" } },
    ]);
    expect(places).toEqual([
      { kind: "grocer", id: "osm:node/1", name: "Food Lion", ll: [36.6, -81.3], src: "osm", big: true },
      { kind: "grocer", id: "osm:way/2", name: "Supermarket", ll: [36.61, -81.31], src: "osm", big: false },
      { kind: "trailhead", id: "osm:node/3", name: "Trailhead", ll: [36.62, -81.32], src: "osm" },
    ]);
  });
});

/** A fake of every source the bake asks: Overpass answers per query, ArcGIS layers by host. */
function fakeFetch(opts: { usfsFails?: boolean } = {}): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url.includes("interpreter")) {
      const ql = new URLSearchParams(String(init?.body)).get("data")!;
      if (ql.includes('"amenity"="parking"'))
        return json({
          elements: [
            {
              type: "way",
              id: 90,
              center: { lat: 36.6505, lon: -81.5005 },
              tags: { amenity: "parking", name: "Elk Garden" },
            },
            { type: "node", id: 91, lat: 36.651, lon: -81.501, tags: { amenity: "parking", hiking: "yes" } },
          ],
        });
      if (ql.includes("[bbox:36,-82,37,-81]"))
        return json({
          elements: [
            { type: "node", id: 1, lat: 36.6, lon: -81.3, tags: { shop: "supermarket", name: "Food Lion" } },
          ],
        });
      return json({ elements: [] });
    }
    const layer = url.split("?")[0]!;
    if (layer.endsWith("/0") || layer.endsWith("/1")) {
      if (opts.usfsFails && url.includes("apps.fs.usda.gov")) return json({}, 500);
      return json({ objectIdField: "OBJECTID" });
    }
    if (url.includes("apps.fs.usda.gov"))
      return opts.usfsFails
        ? json({}, 500)
        : json({
            features: [
              { attributes: { OBJECTID: 7, site_name: "ELK GARDEN A.T." }, geometry: { x: -81.5, y: 36.65 } },
            ],
          });
    if (url.includes("Tennessee_Statewide_Trails"))
      return json({
        features: [
          {
            attributes: {
              OBJECTID: 3,
              Trail_Name: "Overmountain Victory Trail",
              PrimaryTrailhead_Latitude: 36.1,
              PrimaryTrailhead_Longitude: -82.1,
              SecondaryTrailhead_Latitude: 0,
              SecondaryTrailhead_Longitude: 0,
            },
          },
        ],
      });
    return json({ features: [] });
  };
}

const http = (f: typeof fetch) =>
  createHttpClient({
    env: "node",
    fetchImpl: f,
    hostPolicies: {},
    defaultPolicy: { maxConcurrent: 8, minIntervalMs: 0 },
  });

describe("bakePlaces", () => {
  it("writes each source to its licence's folder, by cell, with the index's counts", async () => {
    const { index, cells } = await bakePlaces({
      http: http(fakeFetch()),
      overpass: ["https://o.test/api/interpreter"],
      today: "2026-10-25",
    });
    for (const c of cells) PlaceCellSchema.parse(c);
    PlacesIndexSchema.parse(index);
    const osm = cells.find((c) => c.folder === "osm" && c.cell === "36_-82")!;
    expect(osm.places.map((p) => p.id)).toEqual(["osm:node/1", "osm:node/91", "osm:way/90"]);
    expect(osm.places.find((p) => p.id === "osm:node/91")).toEqual({
      kind: "parking",
      id: "osm:node/91",
      ll: [36.651, -81.501],
      src: "osm",
      hiking: true,
    });
    const official = cells.find((c) => c.folder === "official" && c.cell === "36_-82")!;
    expect(official.places).toEqual([
      { kind: "trailhead", id: "usfs:7", name: "Elk Garden A.T.", ll: [36.65, -81.5], src: "usfs" },
    ]);
    const trec = cells.find((c) => c.folder === "official" && c.cell === "36_-83")!;
    expect(trec.places).toEqual([
      {
        kind: "trailhead",
        id: "tn-trec:3:p",
        name: "Overmountain Victory Trail",
        ll: [36.1, -82.1],
        src: "tn-trec",
        trec: true,
      },
    ]);
    expect(index.cells.osm["36_-82"]).toBe(3);
    expect(index.sources.find((s) => s.id === "usfs")).toMatchObject({
      count: 1,
      fetched: "2026-10-25",
      folder: "official",
    });
    expect(index.sources.find((s) => s.id === "osm")).toMatchObject({ count: 1, licence: "ODbL 1.0" });
  });

  it("keeps the previous bake's places for a source that doesn't answer, dated then", async () => {
    const first = await bakePlaces({
      http: http(fakeFetch()),
      overpass: ["https://o.test/api/interpreter"],
      today: "2026-09-25",
    });
    const places: Place[] = first.cells.flatMap((c) => c.places);
    const again = await bakePlaces({
      http: http(fakeFetch({ usfsFails: true })),
      overpass: ["https://o.test/api/interpreter"],
      today: "2026-10-25",
      previous: { index: first.index, places },
    });
    expect(again.cells.flatMap((c) => c.places).some((p) => p.id === "usfs:7")).toBe(true);
    expect(again.index.sources.find((s) => s.id === "usfs")!.fetched).toBe("2026-09-25");
    expect(again.index.sources.find((s) => s.id === "osm")!.fetched).toBe("2026-10-25");
  });

  it("fails when a source doesn't answer and there's no previous bake", async () => {
    await expect(
      bakePlaces({
        http: http(fakeFetch({ usfsFails: true })),
        overpass: ["https://o.test/api/interpreter"],
        today: "2026-10-25",
      }),
    ).rejects.toThrow(/usfs didn't answer/);
  });
});
