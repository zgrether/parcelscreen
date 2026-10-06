import { describe, expect, it } from "vitest";
import type { HttpClient } from "../http";
import { coordinatesIn, idPattern, matchesId, matchesName, normalizeId, parcelNumberWhere } from "./query";
import { searchParcelNumbers, searchPlaces } from "./sources";

const VA =
  "https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VA_Base_Layers/VA_Parcels/FeatureServer/0";
const TN = "https://geoviewer.cot.tn.gov/arcgis/rest/services/GeoViewer/Parcels_View/MapServer/0";

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

describe("searchParcelNumbers", () => {
  it("asks each county in view, keeps true prefix matches, sorted, with a centre to aim at", async () => {
    const { http, asked } = stub((url) =>
      url.startsWith(VA)
        ? { features: [outline(2, "55A2-1-Y-47A", -80.46), outline(1, "52-47A", -80.455)] }
        : { features: [] },
    );
    const hits = await searchParcelNumbers(
      http,
      new Map([
        [VA, new Set(["51063"])],
        [TN, new Set(["JOHNSON"])],
      ]),
      "52 47",
    );
    expect(asked).toHaveLength(2);
    expect(asked[0]!.body!.get("where")).toBe("FIPS='51063' AND UPPER(PARCELID) LIKE '5%2%4%7%'");
    expect(asked[1]!.body!.get("where")).toBe("COUNTY='JOHNSON' AND UPPER(PARCELID) LIKE '5%2%4%7%'");
    expect(hits.map((h) => h.id)).toEqual(["52-47A"]);
    expect(hits[0]!.centre[0]).toBeCloseTo(36.881, 6);
    expect(hits[0]!.props.OBJECTID).toBe(1);
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
