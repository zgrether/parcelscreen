import { destination, polygon } from "@turf/turf";
import type { Feature, Polygon } from "geojson";
import { describe, expect, it } from "vitest";
import { plainParcel, type WorkingParcel } from "@/lib/client/parcelStore";
import type { ParcelRecord } from "@/lib/geo/parcels";
import { deriveParcel, drawnPart } from "@/lib/geo/recipe";
import type { LatLon } from "@/lib/geo/types";
import { findLayer, layerTree, parcelShapes, type LayerNode } from "./layers";

const LIMITS = { maxGapM: 30, touchM: 1 };
const ORIGIN = [-81.35, 36.63];
function ll(eastM: number, northM: number): LatLon {
  const p = destination(destination(ORIGIN, eastM, 90, { units: "meters" }), northM, 0, { units: "meters" });
  const [lon, lat] = p.geometry.coordinates as [number, number];
  return [lat, lon];
}
function rect(eastM: number, w = 200): Feature<Polygon> {
  const c = [ll(eastM, 0), ll(eastM + w, 0), ll(eastM + w, 200), ll(eastM, 200)].map(([lat, lon]) => [
    lon,
    lat,
  ]);
  return polygon([[...c, c[0]!]]);
}
const county = (eastM: number, id: string): ParcelRecord => ({
  geo: rect(eastM),
  props: { PARCELID: id },
  source: "https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VA_Base_Layers/VA_Parcels/FeatureServer/0",
  multiPart: false,
});
const NOW = "2026-10-05T12:00:00.000Z";
const working = (over: Partial<WorkingParcel>): WorkingParcel => ({
  ...plainParcel(county(0, "52-47A"), NOW),
  ...over,
});
const tree = (p: WorkingParcel) =>
  layerTree(
    p,
    deriveParcel({ parts: p.pieces, ...(p.split ? { split: p.split } : {}) }, LIMITS),
    parcelShapes(p, LIMITS),
  );
/** The tree as indented lines: "name [acres] (eye) (×)". */
const outline = (n: LayerNode, d = 0): string[] => [
  `${"  ".repeat(d)}${n.name}${n.acres !== null ? ` ${n.acres.toFixed(1)}` : ""}${n.hideable ? " (eye)" : ""}${n.deletable ? " (×)" : ""}`,
  ...n.children.flatMap((c) => outline(c, d + 1)),
];

describe("layerTree", () => {
  it("a plain parcel: its one part, which can't be taken out", () => {
    expect(outline(tree(working({})))).toEqual(["52-47A 9.9 (eye)", "  52-47A 9.9"]);
  });

  it("before a split, the parts and the road strip sit under the parcel; the house after them", () => {
    const p = working({ pieces: [county(0, "52-47A"), county(220, "52-61")], house: ll(100, 100) });
    expect(outline(tree(p))).toEqual([
      "52-47A + 52-61 19.8 (eye)",
      "  52-47A 9.9 (×)",
      "  52-61 9.9 (×)",
      "  Road strip (not in acres) 0.9",
      "  Existing house (eye) (×)",
    ]);
  });

  it("after a split: Made from, then the pieces with the kept one first", () => {
    const p = working({
      pieces: [county(0, "52-47A"), drawnPart(rect(200, 100))],
      split: { a: ll(150, -50), b: ll(150, 250), keep: 1 },
    });
    const t = tree(p);
    expect(outline(t)).toEqual([
      "52-47A + drawn 7.4 (eye)",
      "  Made from",
      "    52-47A 9.9 (×)",
      "    Drawn shape 4.9 (×)",
      "  Split into 2 pieces (×)",
      "    E piece · kept 7.4",
      "    W piece 7.4",
    ]);
    expect(findLayer(t, "piece:1")?.kept).toBe(true);
    expect(findLayer(t, "piece:-1")?.kept).toBe(false);
  });

  it("a split that no longer crosses is listed so it can be removed", () => {
    const p = working({ split: { a: ll(400, -50), b: ll(400, 250), keep: -1 } });
    expect(outline(tree(p))).toEqual([
      "52-47A 9.9 (eye)",
      "  Made from",
      "    52-47A 9.9",
      "  Split (no longer crosses) (×)",
    ]);
  });

  it("marks hidden layers", () => {
    const t = tree(working({ house: ll(100, 100), hidden: ["house"] }));
    expect(findLayer(t, "house")?.hidden).toBe(true);
    expect(t.hidden).toBe(false);
  });
});
