import { polygon } from "@turf/turf";
import { describe, expect, it } from "vitest";
import { parseLatLon } from "@/lib/geo/coords";
import { splitPieces } from "@/lib/geo/split";
import type { LatLon } from "@/lib/geo/types";
import { draftData, splitData } from "./overlays";

describe("map overlays", () => {
  it("draft: a line through the corners and a dot each, the first one larger and amber", () => {
    expect(draftData([]).features).toEqual([]);
    const fc = draftData([
      [36.6, -81.3],
      [36.61, -81.3],
    ]);
    expect(fc.features.map((f) => f.geometry.type)).toEqual(["LineString", "Point", "Point"]);
    expect(fc.features[1]!.properties).toEqual({ r: 7, fill: "#9a6a12" });
    expect(fc.features[2]!.properties).toEqual({ r: 4, fill: "#1c2620" });
    expect(fc.features[1]!.geometry).toEqual({ type: "Point", coordinates: [-81.3, 36.6] });
  });

  it("split: yellow left piece, blue right piece, labelled with acres and compass side, then the cut", () => {
    const parcel = polygon([
      [
        [-81.355, 36.628],
        [-81.353, 36.628],
        [-81.353, 36.63],
        [-81.355, 36.63],
        [-81.355, 36.628],
      ],
    ]);
    // A line running north through the middle: west is left of travel, east is right.
    const a: LatLon = [36.627, -81.354],
      b: LatLon = [36.631, -81.354];
    const P = splitPieces(parcel, a, b);
    const fc = splitData(P, a, b);
    expect(fc.features.map((f) => f.geometry.type)).toEqual(["Polygon", "Polygon", "LineString"]);
    expect(fc.features[0]!.properties).toEqual({
      color: "#e0c43c",
      label: `${P.leftAc.toFixed(2)} ac (W side)`,
    });
    expect(fc.features[1]!.properties).toEqual({
      color: "#2b6f8f",
      label: `${P.rightAc.toFixed(2)} ac (E side)`,
    });
  });
});

describe("parseLatLon (proto L568)", () => {
  it("reads a pasted pair, comma or space separated, and nothing else", () => {
    expect(parseLatLon("36.6293, -81.3542")).toEqual([36.6293, -81.3542]);
    expect(parseLatLon("  36.6293 -81.3542 ")).toEqual([36.6293, -81.3542]);
    expect(parseLatLon("36,-81")).toEqual([36, -81]);
    expect(parseLatLon("36.6293")).toBeNull();
    expect(parseLatLon("Galax, VA")).toBeNull();
  });
});
