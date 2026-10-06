import { booleanPointInPolygon, point, polygon } from "@turf/turf";
import { describe, expect, it } from "vitest";
import { parseLatLon } from "@/lib/geo/coords";
import { splitPieces } from "@/lib/geo/split";
import type { LatLon } from "@/lib/geo/types";
import { combineParcels } from "@/lib/geo/combine";
import { combineData, draftData, pieceLabels, selectionData, splitData } from "./overlays";

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

  it("split: yellow left piece, blue right piece, then the cut; a label inside each piece", () => {
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
    expect(fc.features[0]!.properties).toEqual({ side: -1, color: "#e0c43c" });
    expect(fc.features[1]!.properties).toEqual({ side: 1, color: "#2b6f8f" });

    const labels = pieceLabels(P, a, b);
    expect(labels.map((l) => [l.side, l.text])).toEqual([
      [-1, `W · ${P.leftAc.toFixed(2)} ac`],
      [1, `E · ${P.rightAc.toFixed(2)} ac`],
    ]);
    expect(labels[0]!.at[1]).toBeLessThan(-81.354);
    expect(labels[1]!.at[1]).toBeGreaterThan(-81.354);
  });

  it("a piece's label stays inside it, even when the piece is an L", () => {
    // An L whose centre of mass falls in the notch.
    const L = polygon([
      [
        [0, 0],
        [0.002, 0],
        [0.002, 0.0004],
        [0.0004, 0.0004],
        [0.0004, 0.002],
        [0, 0.002],
        [0, 0],
      ],
    ]);
    const [l] = pieceLabels({ left: L, right: null, leftAc: 1, rightAc: 0 }, [-1, 0.001], [1, 0.001]);
    expect(booleanPointInPolygon(point([l!.at[1], l!.at[0]]), L)).toBe(true);
  });
});

describe("selection overlay (13e-4)", () => {
  const sq = polygon([
    [
      [-81.355, 36.628],
      [-81.353, 36.628],
      [-81.353, 36.63],
      [-81.355, 36.63],
      [-81.355, 36.628],
    ],
  ]);
  const part = { geo: sq, props: {}, source: "drawn", multiPart: false };
  const a: LatLon = [36.627, -81.354],
    b: LatLon = [36.631, -81.354];
  const P = splitPieces(sq, a, b);
  const shapes = { strip: null, stripAcres: 0, gapM: 0, pieces: P };
  const kinds = (layer: Parameters<typeof selectionData>[0], keep: 1 | -1 | null = -1) =>
    selectionData(layer, [part], shapes, keep).features.map((f) => [
      f.properties!.kind,
      f.geometry === P.left?.geometry
        ? "left piece"
        : f.geometry === P.right?.geometry
          ? "right piece"
          : "part",
    ]);

  it("a part is drawn white; the parcel, the house and nothing selected add nothing", () => {
    expect(kinds("part:0")).toEqual([["sel", "part"]]);
    for (const l of ["parcel", "house", null] as const) expect(kinds(l)).toEqual([]);
  });

  it("the split, or the kept piece, shows the piece left out dashed; the other piece shows as selected", () => {
    expect(kinds("split")).toEqual([["left", "right piece"]]);
    expect(kinds("piece:-1")).toEqual([
      ["sel", "left piece"],
      ["left", "right piece"],
    ]);
    expect(kinds("piece:1")).toEqual([["sel", "right piece"]]);
  });
});

describe("combine overlay", () => {
  it("marks the picked parcels as members, and adds the combined outline only when they combine", () => {
    const a = polygon([
      [
        [-81.355, 36.628],
        [-81.354, 36.628],
        [-81.354, 36.629],
        [-81.355, 36.629],
        [-81.355, 36.628],
      ],
    ]);
    const b = polygon([
      [
        [-81.354, 36.628],
        [-81.353, 36.628],
        [-81.353, 36.629],
        [-81.354, 36.629],
        [-81.354, 36.628],
      ],
    ]);
    expect(combineData([a], null).features.map((f) => f.properties)).toEqual([{ kind: "member" }]);
    const r = combineParcels([a, b], { maxGapM: 30, touchM: 1 });
    expect(combineData([a, b], r).features.map((f) => f.properties!.kind)).toEqual([
      "member",
      "member",
      "result",
    ]);
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
