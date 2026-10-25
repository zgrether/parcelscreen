import { describe, expect, it } from "vitest";
import type { HttpClient } from "../http";
import { coordinatesIn, idPattern, matchesId, matchesName, normalizeId, parcelNumberWhere } from "./query";
import { countyLabel, searchParcelNumbers, searchPlaces } from "./sources";
import { REGION } from "./region";

const VA =
  "https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VA_Base_Layers/VA_Parcels/FeatureServer/0";
const TN =
  "https://services1.arcgis.com/YuVBSS7Y1of2Qud1/arcgis/rest/services/Tennessee_Property_Boundaries_Public_Use/FeatureServer/0";

describe("coordinatesIn", () => {
  it("reads a pasted lat, lon pair", () => {
    expect(coordinatesIn("36.8874, -80.45455")).toEqual([36.8874, -80.45455]);
    expect(coordinatesIn("  36.8874 -80.45455 ")).toEqual([36.8874, -80.45455]);
  });

  it("leaves parcel numbers and out-of-range pairs alone", () => {
    for (const s of ["52 47", "52-47A", "36.88", "36.8874, -80.45455 lot 2", "91.5, -80.1"])
      expect(coordinatesIn(s)).toBeNull();
  });
});

describe("parcel numbers", () => {
  it("are the same query whatever the separators (owner, 13f)", () => {
    for (const q of ["52-47A", "52 47A", "5247A", "52.47a", " 52 - 47 a "])
      expect(normalizeId(q)).toBe("5247A");
  });

  it("are searched with a pattern tolerant of the county's separators, from 3 characters", () => {
    expect(idPattern("52-47A")).toBe("5%2%4%7%A%");
    expect(idPattern("5-2")).toBeNull();
  });

  it("match by prefix, separators ignored, so the pattern's over-matches are filtered out", () => {
    expect(matchesId("52-47A", "52 47")).toBe(true);
    expect(matchesId("046 001    00500 000 2027", "046 001 005")).toBe(true);
    expect(matchesId("55A2-1-Y-47A", "5247A")).toBe(false);
  });

  it("are asked per county, with quotes escaped", () => {
    expect(parcelNumberWhere({ id: "PARCELID", county: "FIPS" }, "51063", "5%2%")).toBe(
      "FIPS='51063' AND UPPER(PARCELID) LIKE '5%2%'",
    );
    expect(parcelNumberWhere({ id: "PARCELID", county: "COUNTY" }, "O'Brien", "1%")).toBe(
      "COUNTY='O''Brien' AND UPPER(PARCELID) LIKE '1%'",
    );
  });
});

describe("saved parcel names", () => {
  it("match by contained text, or as a parcel number prefix", () => {
    expect(matchesName("52-47A + 52-42A", "42a")).toBe(true);
    expect(matchesName("52-47A", "5247")).toBe(true);
    expect(matchesName("Drawn parcel", "drawn")).toBe(true);
    expect(matchesName("52-47A", "61")).toBe(false);
  });
});

/** An HttpClient answering each request with `reply(url, body)` and recording the requests. */
function stub(reply: (url: string, body: URLSearchParams | null) => unknown) {
  const asked: { url: string; body: URLSearchParams | null }[] = [];
  const http = {
    fetch: async (url: string, opts?: { body?: unknown }) => {
      const body = opts?.body instanceof URLSearchParams ? opts.body : null;
      asked.push({ url, body });
      const r = reply(url, body);
      return r === 500 ? new Response("", { status: 500 }) : Response.json(r);
    },
  } as unknown as HttpClient;
  return { http, asked };
}

const outline = (oid: number, id: string, x: number) => ({
  type: "Feature",
  properties: { OBJECTID: oid, PARCELID: id, FIPS: "51063" },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [x, 36.88],
        [x + 0.002, 36.88],
        [x + 0.002, 36.882],
        [x, 36.882],
        [x, 36.88],
      ],
    ],
  },
});

/** A Virginia service: the numbers' ask (no geometry) answers `rows`; the outlines' ask (by object id) their outlines. */
function virginia(rows: { oid: number; id: string; ptm?: string }[]) {
  return (url: string, body: URLSearchParams | null) => {
    if (!url.startsWith(VA)) return { features: [] };
    if (body?.get("returnGeometry") === "false")
      return {
        features: rows.map((r) => ({
          type: "Feature",
          properties: {
            OBJECTID: r.oid,
            PARCELID: r.id,
            PTM_ID: r.ptm ?? r.id,
            FIPS: "51063",
            LOCALITY: "Floyd County",
          },
          geometry: null,
        })),
      };
    const where = body?.get("where") ?? "";
    const asked = new Set((/IN \(([^)]*)\)/.exec(where)?.[1] ?? "").split(",").map(Number));
    return { features: rows.filter((r) => asked.has(r.oid)).map((r) => outline(r.oid, r.id, -80.455)) };
  };
}

describe("searchParcelNumbers", () => {
  it("asks each county in view, keeps true prefix matches, sorted, with a centre to aim at", async () => {
    const { http, asked } = stub(
      virginia([
        { oid: 2, id: "55A2-1-Y-47A" },
        { oid: 1, id: "52-47A" },
      ]),
    );
    const hits = await searchParcelNumbers(
      http,
      new Map([
        [VA, new Set(["51063"])],
        [TN, new Set(["Johnson"])],
      ]),
      "52 47",
    );
    const va = asked.filter((a) => a.url.startsWith(VA));
    expect(va).toHaveLength(2);
    // The numbers first, the parcel number and the tax map number, as many as the service gives, no outlines.
    expect(va[0]!.body!.get("where")).toBe(
      "FIPS='51063' AND (UPPER(PARCELID) LIKE '5%2%4%7%' OR UPPER(PTM_ID) LIKE '5%2%4%7%')",
    );
    expect(va[0]!.body!.get("returnGeometry")).toBe("false");
    expect(va[0]!.body!.get("resultRecordCount")).toBe("2000");
    // Then the true matches' outlines, by object id.
    expect(va[1]!.body!.get("where")).toBe("OBJECTID IN (1)");
    // Tennessee is asked by control map and parcel ("52 47" reads as map 052, parcel 047…), railroads and conflicts left out.
    expect(asked.find((a) => a.url.startsWith(TN))!.body!.get("where")).toBe(
      "(PARCEL_TYPE NOT IN (4,5)) AND (COUNTY_NAME='Johnson' AND CMAP='052' AND PARCEL LIKE '047%')",
    );
    expect(hits.map((h) => h.id)).toEqual(["52-47A"]);
    expect(hits[0]!.county).toBe("Floyd Co., VA"); // the county named, with its state (UX part 2 PR 4)
    expect(hits[0]!.centre[0]).toBeCloseTo(36.881, 6);
    expect(hits[0]!.props.OBJECTID).toBe(1);
  });

  it("finds a number its pattern over-matches many times over: 35-3 behind 3-153, 30-35, 31-53… (B-3)", async () => {
    // Floyd's ids matching '3%5%3%' that sort ahead of 35-3: more than the 25 the search used to fetch.
    const ahead = Array.from({ length: 40 }, (_, i) => ({ oid: 100 + i, id: `3-${i}53` }));
    const { http } = stub(virginia([...ahead, { oid: 7, id: "35-3" }, { oid: 8, id: "35-31" }]));
    const hits = await searchParcelNumbers(http, new Map([[VA, new Set(["51063"])]]), "35-3");
    expect(hits.map((h) => h.id)).toEqual(["35-3", "35-31"]);
  });

  it("finds Virginia's tax map number, and shows the record's id beside it: 63-A-62 (6273) (B-3)", async () => {
    const { http } = stub(virginia([{ oid: 9, id: "6273", ptm: "63-A-62" }]));
    const hits = await searchParcelNumbers(http, new Map([[VA, new Set(["51077"])]]), "63-A-62");
    expect(hits.map((h) => h.id)).toEqual(["63-A-62 (6273)"]);
    expect(hits[0]!.props.PARCELID).toBe("6273");
  });

  it("asks each service once within the region's box, with no county, the county named in each hit (UX part 2 PR 4)", async () => {
    const { http, asked } = stub(virginia([{ oid: 9, id: "6273", ptm: "63-A-62" }]));
    const hits = await searchParcelNumbers(http, { sources: [VA, TN], bbox: REGION.bbox }, "63-A-62");
    const va = asked.filter((a) => a.url.startsWith(VA));
    expect(va[0]!.body!.get("where")).toBe(
      "(UPPER(PARCELID) LIKE '6%3%A%6%2%' OR UPPER(PTM_ID) LIKE '6%3%A%6%2%')",
    );
    expect(va[0]!.body!.get("geometry")).toBe(REGION.bbox.join(","));
    expect(va[0]!.body!.get("geometryType")).toBe("esriGeometryEnvelope");
    expect(va[0]!.body!.get("inSR")).toBe("4326");
    // It reads as a Tennessee tax card too (map 063, group A, parcel 062): asked within the box, with no county.
    const tn = asked.find((a) => a.url.startsWith(TN))!;
    expect(tn.body!.get("where")).toBe(
      "(PARCEL_TYPE NOT IN (4,5)) AND (CMAP='063' AND GP='A' AND PARCEL LIKE '062%')",
    );
    expect(tn.body!.get("geometry")).toBe(REGION.bbox.join(","));
    expect(hits.map((h) => [h.id, h.county])).toEqual([["63-A-62 (6273)", "Floyd Co., VA"]]);
  });

  it("names a county as the listings do: Grayson Co., VA; a bare code stays as it is", () => {
    expect(countyLabel(VA, "Grayson County")).toBe("Grayson Co., VA");
    expect(countyLabel(TN, "CARTER")).toBe("Carter Co., TN");
    expect(countyLabel(VA, "51077")).toBe("51077");
  });

  it("skips a county whose service fails, and asks nothing for short queries", async () => {
    const failing = stub(() => 500);
    expect(await searchParcelNumbers(failing.http, new Map([[VA, new Set(["51063"])]]), "5247")).toEqual([]);
    const short = stub(() => ({ features: [] }));
    expect(await searchParcelNumbers(short.http, new Map([[VA, new Set(["51063"])]]), "52")).toEqual([]);
    expect(short.asked).toHaveLength(0);
  });
});

describe("searchPlaces", () => {
  it("asks Photon near the map's centre and labels each place with its town, county and state", async () => {
    const { http, asked } = stub(() => ({
      features: [
        {
          geometry: { coordinates: [-80.32, 36.91] },
          properties: {
            name: "Floyd",
            county: "Floyd County",
            state: "Virginia",
            extent: [-80.33, 36.92, -80.31, 36.9],
          },
        },
        { geometry: { coordinates: [0, 0] }, properties: {} },
      ],
    }));
    const hits = await searchPlaces(http, "https://photon.komoot.io/api/", "floyd", [36.88, -80.45]);
    expect(asked[0]!.url).toBe("https://photon.komoot.io/api/?q=floyd&lat=36.88&lon=-80.45&limit=5&lang=en");
    expect(hits).toEqual([
      {
        label: "Floyd",
        detail: "Floyd County, Virginia",
        ll: [36.91, -80.32],
        extent: [-80.33, 36.92, -80.31, 36.9],
      },
    ]);
  });

  it("rejects an unexpected response", async () => {
    await expect(searchPlaces(stub(() => ({ nope: 1 })).http, "https://p/", "x", [0, 0])).rejects.toThrow();
  });
});

describe("searchPlaces within the region (UX part 2 PR 4)", () => {
  it("asks Photon for places within the box only", async () => {
    const { http, asked } = stub(() => ({ features: [] }));
    await searchPlaces(
      http,
      "https://photon.komoot.io/api/",
      "floyd",
      [36.88, -80.45],
      undefined,
      REGION.bbox,
    );
    expect(asked[0]!.url).toBe(
      `https://photon.komoot.io/api/?q=floyd&lat=36.88&lon=-80.45&limit=5&lang=en&bbox=${REGION.bbox.join(",")}`,
    );
  });
});
