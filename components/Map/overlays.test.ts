import { booleanPointInPolygon, point, polygon } from "@turf/turf";
import { describe, expect, it } from "vitest";
import { parseLatLon } from "@/lib/geo/coords";
import { splitPieces } from "@/lib/geo/split";
import type { LatLon } from "@/lib/geo/types";
import { combineParcels } from "@/lib/geo/combine";
import { combineData, draftData, markupData, pieceLabels, selectionData, splitData } from "./overlays";

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
      // Owner, after #312: the panel's style.
      [-1, `West piece, ${P.leftAc.toFixed(1)} ac`],
      [1, `East piece, ${P.rightAc.toFixed(1)} ac`],
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

describe("drawn lines (follow-up 34)", () => {
  it("one line feature per track or easement, with its kind for the style", () => {
    const fc = markupData([
      {
        id: "a",
        name: "Track 1",
        shape: "line" as const,
        recordedIn: "",
        kind: "track",
        condition: "pioneer",
        line: [
          [36.6, -81.5],
          [36.61, -81.51],
        ],
        widthFt: null,
        note: "",
        at: "",
      },
      {
        id: "b",
        name: "Deeded right-of-way",
        shape: "line" as const,
        recordedIn: "",
        kind: "easement",
        condition: "uncleared",
        line: [
          [36.62, -81.5],
          [36.63, -81.5],
        ],
        widthFt: 30,
        note: "deed",
        at: "",
      },
    ]);
    expect(fc.features.map((f) => [f.properties!.kind, f.geometry])).toEqual([
      [
        "track",
        {
          type: "LineString",
          coordinates: [
            [-81.5, 36.6],
            [-81.51, 36.61],
          ],
        },
      ],
      [
        "easement",
        {
          type: "LineString",
          coordinates: [
            [-81.5, 36.62],
            [-81.5, 36.63],
          ],
        },
      ],
    ]);
    // The tooltip (34-2): its name (#127; with its kind when the name doesn't say it) and its length, until a
    // screen grades it.
    expect(fc.features.map((f) => f.properties!.tip)).toEqual([
      "Track 1: 4,678 ft",
      "Deeded right-of-way (Easement): 3,648 ft",
    ]);
  });

  it("a screened line's tooltip has its grades (owner, 34-1 answer 3)", () => {
    const m = {
      id: "a",
      name: "Track 1",
      shape: "line" as const,
      recordedIn: "",
      kind: "track" as const,
      condition: "pioneer" as const,
      line: [
        [36.6, -81.5],
        [36.61, -81.51],
      ] as [number, number][],
      widthFt: null,
      note: "",
      at: "",
    };
    const measured = {
      id: "a",
      shape: "line" as const,
      recordedIn: "",
      kind: "track" as const,
      condition: "pioneer" as const,
      lengthFt: 938,
      widthFt: null,
      outsideFt: 0,
      gradedFt: 938,
      avgGradePct: 11.2,
      maxGradePct: 16.6,
    };
    expect(markupData([m], [measured]).features[0]!.properties!.tip).toBe(
      "Track 1: 938 ft · avg 11% · steepest 17% over 30 m",
    );
    expect(markupData([m], [{ ...measured, id: "other" }]).features[0]!.properties!.tip).toMatch(
      /: 4,678 ft$/,
    );
    // The line selected in Layers is highlighted, with its points; a hovered row's line lightly (owner, #127).
    const both = [m, { ...m, id: "b" }];
    const sel = markupData(both, [], "b", "a").features;
    expect(sel.map((f) => [f.geometry.type, f.properties!.kind, f.properties!.hl])).toEqual([
      ["LineString", "track", "hover"],
      ["LineString", "track", "selected"],
      ["Point", "point", undefined],
      ["Point", "point", undefined],
    ]);
    expect(markupData(both).features.map((f) => f.properties!.hl)).toEqual(["none", "none"]);
  });
});

describe("area markers (WF4)", () => {
  it("an area is a polygon with its name and acres; a point isn't in the source (it's a pin); a selected area shows its corners", () => {
    const ring: [number, number][] = [
      [36.6, -81.5],
      [36.6, -81.499],
      [36.601, -81.499],
    ];
    const fc = markupData(
      [
        {
          id: "c",
          name: "Clearing 1",
          shape: "area",
          kind: "clearing",
          ring,
          septicClass: null,
          note: "",
          at: "",
        },
        {
          id: "s",
          name: "Spring 1",
          shape: "point",
          kind: "spring",
          ll: [36.6, -81.5],
          septicClass: null,
          note: "",
          at: "",
        },
      ],
      [],
      "c",
    );
    expect(fc.features.map((f) => [f.geometry.type, f.properties!.kind])).toEqual([
      ["Polygon", "area"],
      ["Point", "point"],
      ["Point", "point"],
      ["Point", "point"],
    ]);
    expect(fc.features[0]!.properties).toMatchObject({ drawn: "clearing", id: "c", hl: "selected" });
    expect(fc.features[0]!.properties!.tip).toMatch(/^Clearing 1: \d\.\d\d ac$/);
  });
});
