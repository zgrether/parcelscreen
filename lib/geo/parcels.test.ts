import { area, polygon } from "@turf/turf";
import { describe, expect, it } from "vitest";
import { loadFixture } from "../../test/support/fixtures";
import { CancelledError, createHttpClient } from "../http";
import {
  boundarySourceLabel,
  parcelFacts,
  parcelFromLine,
  pickOutline,
  pickParcelAt,
  squareAround,
  type ParcelLine,
} from "./parcels";
import { M2_PER_ACRE } from "./types";

// The prototype's parcel services, in its order (endpoints.parcels).
const NC = "https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/FeatureServer/1";
const VA =
  "https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VA_Base_Layers/VA_Parcels/FeatureServer/0";
const TN = "https://geoviewer.cot.tn.gov/arcgis/rest/services/GeoViewer/Parcels_View/MapServer/0";
const SERVICES = [NC, VA, TN];

describe("pickParcelAt (recorded services)", () => {
  it.each(["ferney-creek-52-47A", "macks-mountain-35-3"] as const)(
    "finds the same parcel the prototype did (%s)",
    async (slug) => {
      const fx = loadFixture(slug);
      const http = createHttpClient({ env: "browser", fetchImpl: fx.replayFetch() });
      const { parcel, report } = await pickParcelAt(http, SERVICES, [fx.input.point.lat, fx.input.point.lon]);
      expect(parcel?.geo).toEqual(fx.input.polygon);
      expect(parcel?.props).toEqual(fx.input.props);
      expect(parcel?.source).toBe(VA);
      expect(parcel?.multiPart).toBe(false);
      // NC answered first with an empty collection; VA had it, so TN was never asked.
      expect(report).toEqual(["services.nconemap.gov: no parcel at this point"]);
    },
  );
});

describe("pickParcelAt (failure reporting)", () => {
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it("reports what each service said when none has a parcel", async () => {
    let n = 0;
    const http = createHttpClient({
      env: "browser",
      fetchImpl: async () => {
        n++;
        if (n === 1) return respond({}, 500);
        if (n === 2) return respond({ error: { message: "Invalid query" } });
        throw new TypeError("Failed to fetch");
      },
    });
    const r = await pickParcelAt(http, SERVICES, [36, -80]);
    expect(r.parcel).toBeNull();
    expect(r.report).toEqual([
      "services.nconemap.gov: HTTP 500",
      "vginmaps.vdem.virginia.gov: Invalid query",
      "geoviewer.cot.tn.gov: Failed to fetch",
    ]);
  });

  it("keeps only the first polygon of a MultiPolygon and says so", async () => {
    const mp = {
      type: "Feature",
      properties: { PARCELID: "x" },
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
          ],
          [
            [
              [5, 5],
              [6, 5],
              [6, 6],
              [5, 5],
            ],
          ],
        ],
      },
    };
    const http = createHttpClient({ env: "browser", fetchImpl: async () => respond({ features: [mp] }) });
    const { parcel } = await pickParcelAt(http, [VA], [0.5, 0.5]);
    expect(parcel?.multiPart).toBe(true);
    expect(parcel?.geo.geometry.coordinates).toEqual([
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ],
    ]);
  });

  it("rethrows cancellation instead of reporting it", async () => {
    const ctl = new AbortController();
    ctl.abort();
    const http = createHttpClient({ env: "browser", fetchImpl: async () => respond({}) });
    await expect(pickParcelAt(http, SERVICES, [36, -80], ctl.signal)).rejects.toBeInstanceOf(CancelledError);
  });
});

describe("parcel facts", () => {
  it("reads the parcel ID case-insensitively and computes acres from the boundary", () => {
    const { input } = loadFixture("ferney-creek-52-47A");
    const f = parcelFacts(input.polygon, input.props);
    expect(f.parcelId).toBe("52-47A"); // VGIN's PARCELID matches "parcelid"
    expect(f.acres).toBeCloseTo(43.88, 2);
    expect(f.owner).toBeNull(); // VGIN publishes no owner name
    // Deviation: VGIN's LOCALITY is the county (the prototype showed none for VA parcels).
    expect(f.county).toBe("Floyd County");
  });

  it("labels each boundary source as the prototype does", () => {
    expect(boundarySourceLabel(VA, {})).toBe("county record");
    expect(boundarySourceLabel("drawn", {})).toBe("drawn by hand");
    expect(boundarySourceLabel("square", {})).toBe("square around a point (not a real boundary)");
    expect(boundarySourceLabel("saved", {})).toBe("saved parcel");
    expect(boundarySourceLabel("split", { split_from: "35-3" })).toBe(
      "split from 35-3 — verify against the recorded plat",
    );
  });

  it("turns a tapped outline into a parcel record", () => {
    const { input } = loadFixture("macks-mountain-35-3");
    const rec = parcelFromLine({
      feature: { type: "Feature", properties: input.props, geometry: input.polygon.geometry },
      source: VA,
    });
    expect(rec.geo.geometry).toEqual(input.polygon.geometry);
    expect(rec.multiPart).toBe(false);
  });
});

describe("squareAround", () => {
  it("makes a square of the requested acreage, with the prototype's floor and default", () => {
    expect(area(squareAround([36.9, -80.5], 5)) / M2_PER_ACRE).toBeCloseTo(5, 2);
    expect(area(squareAround([36.9, -80.5], 0.1)) / M2_PER_ACRE).toBeCloseTo(0.25, 3);
    expect(area(squareAround([36.9, -80.5], 0)) / M2_PER_ACRE).toBeCloseTo(5, 2);
  });
});

describe("pickOutline (which outline a tap means)", () => {
  const box = (w: number, s: number, e: number, n: number, id: string): ParcelLine => ({
    feature: polygon(
      [
        [
          [w, s],
          [e, s],
          [e, n],
          [w, n],
          [w, s],
        ],
      ],
      { PARCELID: id },
    ),
    source: VA,
  });
  // 51-79 (bigger) and 52-44 (smaller) share the line at lon -80.455, as they do in Floyd County.
  const big = box(-80.457, 36.89, -80.455, 36.893, "51-79"),
    small = box(-80.455, 36.89, -80.4535, 36.893, "52-44");

  it("a tap inside one outline picks it, whatever is drawn on top", () => {
    expect(pickOutline([small, big], [36.8915, -80.456])).toBe(big);
    expect(pickOutline([big, small], [36.8915, -80.454])).toBe(small);
  });

  it("a tap on a shared line, inside both, picks the smaller, in either order", () => {
    expect(pickOutline([big, small], [36.8915, -80.455])).toBe(small);
    expect(pickOutline([small, big], [36.8915, -80.455])).toBe(small);
  });

  it("an outline inside another wins over it; outside every outline, nothing", () => {
    const inner = box(-80.4565, 36.8905, -80.4558, 36.891, "inner");
    expect(pickOutline([big, inner], [36.8907, -80.4562])).toBe(inner);
    expect(pickOutline([big, small], [36.9, -80.46])).toBeNull();
  });
});
