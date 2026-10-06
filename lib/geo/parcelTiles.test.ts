import { polygon } from "@turf/turf";
import { describe, expect, it } from "vitest";
import type { HttpClient } from "../http";
import {
  detailFor,
  fetchTile,
  fullRecord,
  lineKey,
  MAX_PAGES,
  OFFSET_DEG,
  TileCache,
  tilesFor,
} from "./parcelTiles";

const VA =
  "https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VA_Base_Layers/VA_Parcels/FeatureServer/0";
const NC = "https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/FeatureServer/1";

const square = (oid: number) =>
  polygon(
    [
      [
        [-80.455, 36.889],
        [-80.454, 36.889],
        [-80.454, 36.89],
        [-80.455, 36.89],
        [-80.455, 36.889],
      ],
    ],
    { OBJECTID: oid, PARCELID: `52-${oid}`, FIPS: "51063" },
  );

/** An HttpClient that answers each request from `pages` in turn and records what was asked. */
function stub(pages: unknown[]) {
  const asked: URLSearchParams[] = [];
  const urls: string[] = [];
  const http: HttpClient = {
    fetch: async (url, opts) => {
      urls.push(url);
      asked.push(new URLSearchParams(opts?.body instanceof URLSearchParams ? opts.body : url.split("?")[1]));
      const page = pages[Math.min(asked.length - 1, pages.length - 1)];
      return page === 500 ? new Response("", { status: 500 }) : Response.json(page);
    },
  } as HttpClient;
  return { http, asked, urls };
}

// The Floyd test area at zoom 13.5 on a desktop map (840 × 800 px): measured with 9 zoom-14 tiles (plan §1).
const FLOYD_DESKTOP = { west: -80.48005, east: -80.42905, north: 36.90889, south: 36.87011 };

describe("tilesFor", () => {
  it("covers the Floyd desktop view with the 9 zoom-14 tiles the plan measured", () => {
    const tiles = tilesFor(FLOYD_DESKTOP);
    expect(tiles).toHaveLength(9);
    const w = Math.min(...tiles.map((t) => t.bounds.west)),
      e = Math.max(...tiles.map((t) => t.bounds.east)),
      n = Math.max(...tiles.map((t) => t.bounds.north)),
      s = Math.min(...tiles.map((t) => t.bounds.south));
    expect(w).toBeLessThanOrEqual(FLOYD_DESKTOP.west);
    expect(e).toBeGreaterThanOrEqual(FLOYD_DESKTOP.east);
    expect(n).toBeGreaterThanOrEqual(FLOYD_DESKTOP.north);
    expect(s).toBeLessThanOrEqual(FLOYD_DESKTOP.south);
  });
});

describe("fetchTile", () => {
  const tile = tilesFor(FLOYD_DESKTOP)[0]!;

  it("asks for three fields and simplified geometry, coarse below zoom 15 and fine above", async () => {
    for (const [zoom, offset] of [
      [14, OFFSET_DEG.coarse],
      [15.5, OFFSET_DEG.fine],
    ] as const) {
      const { http, asked } = stub([{ features: [square(1)] }]);
      const r = await fetchTile(http, VA, tile, detailFor(zoom));
      expect(r.complete).toBe(true);
      expect(r.lines).toHaveLength(1);
      expect(asked[0]!.get("outFields")).toBe("OBJECTID,PARCELID,FIPS");
      expect(asked[0]!.get("maxAllowableOffset")).toBe(String(offset));
      expect(asked[0]!.get("geometryPrecision")).toBe("5");
      expect(asked[0]!.get("resultRecordCount")).toBe("2000");
    }
    const { http, asked } = stub([{ features: [] }]);
    await fetchTile(http, NC, tile, "coarse");
    expect(asked[0]!.get("outFields")).toBe("objectid,parno,stcntyfips");
    expect(asked[0]!.get("resultRecordCount")).toBe("5000");
  });

  it("pages past the transfer limit, in object-id order", async () => {
    const { http, asked } = stub([
      { features: [square(1)], properties: { exceededTransferLimit: true } },
      { features: [square(2)] },
    ]);
    const r = await fetchTile(http, VA, tile, "coarse");
    expect(r).toMatchObject({ complete: true });
    expect(r.lines).toHaveLength(2);
    expect(asked.map((q) => q.get("resultOffset"))).toEqual(["0", "2000"]);
    expect(asked[0]!.get("orderByFields")).toBe("OBJECTID");
  });

  it(`marks the tile incomplete after ${MAX_PAGES} full pages, or when the service fails`, async () => {
    const over = { features: [square(1)], exceededTransferLimit: true };
    const many = await fetchTile(stub([over]).http, VA, tile, "coarse");
    expect(many).toMatchObject({ complete: false, failed: false });
    expect(many.lines).toHaveLength(MAX_PAGES);
    expect(await fetchTile(stub([500]).http, VA, tile, "coarse")).toMatchObject({
      complete: false,
      failed: true,
    });
    expect(await fetchTile(stub([{ error: { message: "x" } }]).http, VA, tile, "coarse")).toMatchObject({
      complete: false,
      failed: true,
    });
  });
});

describe("lineKey", () => {
  it("identifies an outline by service and object id, whichever tile brought it", () => {
    expect(lineKey({ feature: square(7), source: VA })).toBe(lineKey({ feature: square(7), source: VA }));
    expect(lineKey({ feature: square(7), source: VA })).not.toBe(lineKey({ feature: square(8), source: VA }));
  });
});

describe("fullRecord", () => {
  it("fetches the outline's full record by object id: all fields, full geometry", async () => {
    const full = { ...square(7), properties: { OBJECTID: 7, PARCELID: "52-7", LOCALITY: "Floyd County" } };
    const { http, urls } = stub([{ features: [full] }]);
    const rec = await fullRecord(http, { props: square(7).properties!, source: VA });
    const q = new URLSearchParams(urls[0]!.split("?")[1]);
    expect(q.get("objectIds")).toBe("7");
    expect(q.get("outFields")).toBe("*");
    expect(q.has("maxAllowableOffset")).toBe(false);
    expect(rec.props.LOCALITY).toBe("Floyd County");
    expect(rec.source).toBe(VA);
  });

  it("refuses to stand in a simplified outline: no id, or no record, is an error", async () => {
    await expect(fullRecord(stub([]).http, { props: {}, source: VA })).rejects.toThrow();
    await expect(
      fullRecord(stub([{ features: [] }]).http, { props: { OBJECTID: 1 }, source: VA }),
    ).rejects.toThrow();
  });
});

describe("TileCache", () => {
  it("drops the least recently used tile first", () => {
    const c = new TileCache(2);
    const t = { lines: [], complete: true, failed: false };
    c.set("a", t);
    c.set("b", t);
    c.get("a"); // a is now the most recent
    c.set("c", t);
    expect([c.get("a"), c.get("b"), c.get("c")].map(Boolean)).toEqual([true, false, true]);
    expect(c.size).toBe(2);
  });
});
