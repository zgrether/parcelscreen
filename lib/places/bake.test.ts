import { describe, expect, it } from "vitest";
import { createHttpClient } from "../http";
import { PlaceCellSchema, PlacesIndexSchema, type Place, type PlacesIndex } from "../screen/placeData";
import type { Polygon } from "geojson";
import {
  areaCells,
  bakePlaces,
  classifyLaunches,
  inArea,
  osmCellQuery,
  osmLaunches,
  osmPlaces,
  type RawLaunch,
} from "./bake";

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
function fakeFetch(
  opts: { usfsFails?: boolean; launch?: boolean; nhd?: () => "ok" | "down"; towns?: boolean } = {},
): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    const host = new URL(url).host;
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url.includes("interpreter")) {
      const ql = new URLSearchParams(String(init?.body)).get("data")!;
      if (ql.includes("place~"))
        return json({
          elements: opts.towns
            ? [
                {
                  type: "node",
                  id: 70,
                  lat: 36.6357,
                  lon: -81.7873,
                  tags: { place: "town", name: "Damascus" },
                },
                { type: "node", id: 71, lat: 10, lon: 10, tags: { place: "city", name: "Elsewhere" } },
              ]
            : [],
        });
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
            ...(opts.launch
              ? [{ type: "node", id: 5, lat: 36.55, lon: -81.4, tags: { leisure: "slipway", name: "Fries" } }]
              : []),
          ],
        });
      return json({ elements: [] });
    }
    if (host === "hydro.nationalmap.gov")
      return (opts.nhd?.() ?? "ok") === "down"
        ? json({}, 504)
        : json({ type: "FeatureCollection", features: [] });
    const layer = url.split("?")[0]!;
    if (layer.endsWith("/0") || layer.endsWith("/1")) {
      if (opts.usfsFails && host === "apps.fs.usda.gov") return json({}, 500);
      return json({ objectIdField: "OBJECTID" });
    }
    if (host === "apps.fs.usda.gov" && String(init?.body).includes("BOAT"))
      return opts.usfsFails ? json({}, 500) : json({ features: [] });
    if (host === "apps.fs.usda.gov")
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

  it("the towns over the area, for the refresh summary; outside it, none", async () => {
    const { index } = await bakePlaces({
      http: http(fakeFetch({ towns: true })),
      overpass: ["https://o.test/api/interpreter"],
      today: "2026-10-25",
    });
    expect(index.towns).toEqual([{ name: "Damascus", ll: [36.6357, -81.7873] }]);
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

describe("bakePlaces' launches and NHD (10/25: a 504 lost every launch)", () => {
  const bake = (nhd: () => "ok" | "down", previous?: { index: PlacesIndex; places: Place[] }) =>
    bakePlaces({
      http: http(fakeFetch({ launch: true, nhd })),
      overpass: ["https://o.test/api/interpreter"],
      today: "2026-10-25",
      sleep: async () => {},
      ...(previous ? { previous } : {}),
    });
  const launchIn = (cells: { places: Place[] }[]) =>
    cells.flatMap((c) => c.places).find((p) => p.id === "osm:node/5");

  it("asks NHD again after a 504, and classifies the launch", async () => {
    let calls = 0;
    const { cells } = await bake(() => (++calls <= 2 ? "down" : "ok"));
    expect(launchIn(cells)).toMatchObject({ kind: "launch", name: "Fries", water: "river" });
    expect(calls).toBeGreaterThan(2);
  });

  it("a batch NHD never answers keeps the previous bake's launches; the rest of the bake goes on", async () => {
    const first = await bake(() => "ok");
    const again = await bake(() => "down", {
      index: first.index,
      places: first.cells.flatMap((c) => c.places),
    });
    expect(launchIn(again.cells)).toEqual(launchIn(first.cells));
    expect(again.cells.flatMap((c) => c.places).some((p) => p.id === "osm:node/1")).toBe(true);
  });

  it("past the classification's 90 minutes, a batch keeps the previous bake's launches, and says so", async () => {
    let t = 0;
    const { cells, kept } = await bakePlaces({
      http: http(fakeFetch({ launch: true })),
      overpass: ["https://o.test/api/interpreter"],
      today: "2026-10-25",
      sleep: async () => {},
      // 100 minutes a look at the clock: the first batch is already past the deadline.
      now: () => (t += 100 * 60_000),
    });
    expect(launchIn(cells)).toBeUndefined();
    expect(kept).toContain("launch classification (NHD) in 1 cells");
  });

  it("with no previous bake, a batch NHD never answers is left out until the next bake", async () => {
    const { cells } = await bake(() => "down");
    expect(launchIn(cells)).toBeUndefined();
    expect(cells.flatMap((c) => c.places).some((p) => p.id === "osm:node/1")).toBe(true);
  });
});

describe("paddle launches (step 14d plan §2.4)", () => {
  it("asks a cell for slipways, canoe and whitewater put-ins, access points, and the canoe routes they're on", () => {
    const q = osmCellQuery("36_-82");
    for (const tag of [
      'nwr["leisure"="slipway"]',
      '"canoe"~"^(put_in|egress|put_in;egress)$"',
      '"whitewater"~',
      '"waterway"="access_point"',
    ])
      expect(q).toContain(tag);
    expect(q).toContain('rel(bn.l)["route"="canoe"];out body;');
  });

  it("keeps launches, not canoe=no slipways or private ones; a canoe route names its trail; whitewater is marked", () => {
    const got = osmLaunches([
      { type: "node", id: 1, lat: 36.6, lon: -81.3, tags: { leisure: "slipway", name: "Rat Branch" } },
      { type: "node", id: 2, lat: 36.6, lon: -81.31, tags: { leisure: "slipway", canoe: "no" } },
      { type: "node", id: 3, lat: 36.6, lon: -81.32, tags: { canoe: "put_in", access: "private" } },
      { type: "node", id: 4, lat: 36.6, lon: -81.33, tags: { whitewater: "put_in;egress" } },
      { type: "node", id: 5, lat: 36.6, lon: -81.34, tags: { waterway: "access_point" } },
      { type: "node", id: 6, lat: 36.6, lon: -81.35, tags: { shop: "supermarket" } },
      {
        type: "relation",
        id: 9,
        tags: { type: "route", route: "canoe", name: "New River Blueway" },
        members: [{ type: "node", ref: 5, role: "" }],
      },
    ]);
    expect(got).toEqual([
      { id: "osm:node/1", ll: [36.6, -81.3], src: "osm", name: "Rat Branch" },
      { id: "osm:node/4", ll: [36.6, -81.33], src: "osm", whitewater: true },
      { id: "osm:node/5", ll: [36.6, -81.34], src: "osm", trail: "New River Blueway" },
    ]);
    // A canoe route isn't a place, and a slipway isn't a grocer or a trailhead.
    expect(osmPlaces([{ type: "relation", id: 9, tags: { route: "canoe", name: "X" } }])).toEqual([]);
  });

  /** A square lake `sideM` metres a side, its west shore `fromM` metres east of the launch at L. */
  const L: [number, number] = [36.3, -81.9];
  const lake = (fromM: number, sideM: number, props: Record<string, unknown>) => {
    const dLon = (m: number) => m / (111_320 * Math.cos((L[0] * Math.PI) / 180));
    const dLat = (m: number) => m / 111_320;
    const x0 = L[1] + dLon(fromM),
      x1 = x0 + dLon(sideM),
      y0 = L[0] - dLat(sideM / 2),
      y1 = L[0] + dLat(sideM / 2);
    const geometry: Polygon = {
      type: "Polygon",
      coordinates: [
        [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
          [x0, y0],
        ],
      ],
    };
    return { type: "Feature" as const, properties: props, geometry };
  };
  const river = (name: string, offsetM: number) => ({
    type: "Feature" as const,
    properties: { GNIS_NAME: name },
    geometry: {
      type: "LineString" as const,
      coordinates: [
        [L[1] - 0.01, L[0] + offsetM / 111_320],
        [L[1] + 0.01, L[0] + offsetM / 111_320],
      ],
    },
  });
  const launch = (extra: Partial<RawLaunch> = {}): RawLaunch => ({
    id: "osm:node/1",
    ll: L,
    src: "osm",
    ...extra,
  });
  const RESERVOIR = { GNIS_NAME: "Watauga Lake", FTYPE: 436, AREASQKM: 0.162 }; // 40 ac

  it("on a 40 ac reservoir's shore: flatwater, named for it, with its acres", () => {
    const [l] = classifyLaunches([launch({ name: "Rat Branch" })], [lake(0, 640, RESERVOIR)], []);
    expect(l).toMatchObject({ water: "flat", waterName: "Watauga Lake", waterAc: 40, name: "Rat Branch" });
  });

  it("50 m from the lake is on it; 70 m isn't (paddling.flatwaterWithinM, 60 m)", () => {
    expect(classifyLaunches([launch()], [lake(50, 640, RESERVOIR)], [])[0]!.water).toBe("flat");
    expect(classifyLaunches([launch()], [lake(70, 640, RESERVOIR)], [])[0]!.water).toBe("river");
  });

  it("a 3 ac pond isn't flatwater to paddle (paddling.flatwaterMinAc, 5 ac); a swamp never is", () => {
    const pond = lake(0, 110, { GNIS_NAME: "Mill Pond", FTYPE: 390, AREASQKM: 0.012 });
    expect(classifyLaunches([launch()], [pond], [])[0]!.water).toBe("river");
    const swamp = lake(0, 640, { GNIS_NAME: "Big Swamp", FTYPE: 466, AREASQKM: 0.162 });
    expect(classifyLaunches([launch()], [swamp], [])[0]!.water).toBe("river");
  });

  it("a whitewater put-in on a lake is a river launch; its river is the nearest named flowline within 100 m", () => {
    const [l] = classifyLaunches(
      [launch({ whitewater: true })],
      [lake(0, 640, RESERVOIR)],
      [river("Watauga River", 40), river("Elk Creek", 90)],
    );
    expect(l).toMatchObject({ water: "river", waterName: "Watauga River", name: "Watauga River access" });
    expect(classifyLaunches([launch()], [], [river("Far Creek", 150)])[0]).toMatchObject({
      water: "river",
      name: "Boat launch",
    });
  });

  it("unnamed water: an unnamed lake still makes it flatwater; the launch keeps a plain name", () => {
    const [l] = classifyLaunches([launch()], [lake(0, 640, { FTYPE: 390, AREASQKM: 0.162 })], []);
    expect(l).toMatchObject({ water: "flat", name: "Boat launch" });
    expect(l!.waterName).toBeUndefined();
  });
});
