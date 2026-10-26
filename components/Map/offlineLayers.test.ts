import { describe, expect, it } from "vitest";
import { tileUrl } from "@/lib/offline/tiles";
import { BASEMAPS_NOT_KEPT, isKept, OFFLINE_LAYERS, offlineLayerFor, tileCacheKey } from "./offlineLayers";
import { BASEMAPS } from "./style";

const T = { z: 16, x: 18093, y: 25553 };
const layerOf = (href: string, sameOrigin = false) => offlineLayerFor(new URL(href), sameOrigin)?.id ?? null;

describe("which map requests the offline cache keeps", () => {
  it("knows each layer's own tiles by its template", () => {
    for (const l of OFFLINE_LAYERS) {
      if (!l.template) continue;
      expect(layerOf(tileUrl(l.template, T)), l.id).toBe(l.id);
    }
  });

  it("knows the rest by host and path", () => {
    expect(
      layerOf("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/16/1/2"),
    ).toBe("esri");
    expect(layerOf("https://tiles.openfreemap.org/planet")).toBe("roads-tilejson");
    expect(layerOf("https://tiles.openfreemap.org/planet/20251015_001001_pt/14/4520/6390.pbf")).toBe("roads");
    expect(layerOf("http://localhost:3100/places/v1/osm/36_-82.json", true)).toBe("places");
    expect(
      layerOf("https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/FeatureServer/1/query"),
    ).toBe("parcel-lines");
  });

  it("never matches a grade's own requests", () => {
    // The DEM: 3DEP's export on the UTM grid, a float TIFF with no slope rule.
    expect(
      layerOf(
        "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage?bbox=1,2,3,4&bboxSR=26917&format=tiff&pixelType=F32&f=image",
      ),
    ).toBeNull();
    // The sky step's binary atlas, beside the image tiles.
    expect(
      layerOf("https://djlorenz.github.io/astronomy/binary_tiles/2025/binary_tile_1_2.dat.gz"),
    ).toBeNull();
    expect(layerOf("https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest")).toBeNull();
    expect(layerOf("https://router.project-osrm.org/route/v1/driving/1,2;3,4")).toBeNull();
    expect(layerOf("http://localhost:3100/explore", true)).toBeNull();
  });

  it("keeps nothing of Esri's, and the elevation tiles only once allowed", () => {
    const by = Object.fromEntries(OFFLINE_LAYERS.map((l) => [l.id, l]));
    expect(isKept(by.esri!)).toBe(false);
    expect(isKept(by.relief!)).toBe(false);
    expect(isKept(by.terrarium!)).toBe(false);
    expect(isKept(by["usgs-imagery"]!)).toBe(true);
    expect(isKept(by.slope!)).toBe(true);
    expect(BASEMAPS.filter((b) => BASEMAPS_NOT_KEPT.has(b.id)).map((b) => b.label)).toEqual([
      "Aerial (Esri)",
      "Streets (Esri)",
    ]);
  });

  it("keys a box URL by its tile, however its numbers are written", () => {
    const slope = OFFLINE_LAYERS.find((l) => l.id === "slope")!;
    const canonical = tileUrl(slope.template!, T);
    const url = new URL(canonical);
    const [a, b, c, d] = url.searchParams.get("bbox")!.split(",").map(Number) as [
      number,
      number,
      number,
      number,
    ];
    url.searchParams.set("bbox", [a + 1e-7, b - 1e-7, c, d].map((n) => n.toPrecision(17)).join(","));
    expect(tileCacheKey(slope, url)).toBe(canonical);
  });

  it("keys a parcel-line tile by its sorted body, and passes a grade's lookup through", () => {
    const lines = OFFLINE_LAYERS.find((l) => l.id === "parcel-lines")!;
    const url = new URL(
      "https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/FeatureServer/1/query",
    );
    const one = "geometryType=esriGeometryEnvelope&maxAllowableOffset=0.000025&f=geojson";
    const two = "f=geojson&maxAllowableOffset=0.000025&geometryType=esriGeometryEnvelope";
    expect(tileCacheKey(lines, url, one)).toBe(tileCacheKey(lines, url, two));
    expect(tileCacheKey(lines, url, "geometryType=esriGeometryPoint&f=json")).toBeNull();
    expect(tileCacheKey(lines, url)).toBeNull();
  });
});
