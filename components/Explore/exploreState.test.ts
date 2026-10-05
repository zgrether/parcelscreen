import { area, polygon } from "@turf/turf";
import { describe, expect, it } from "vitest";
import type { ParcelRecord } from "@/lib/geo/parcels";
import { splitPieces } from "@/lib/geo/split";
import { M2_PER_ACRE, type LatLon } from "@/lib/geo/types";
import { exploreReducer, INITIAL, type ExploreAction, type ExploreState } from "./exploreState";

const run = (actions: ExploreAction[], from: ExploreState = INITIAL) => actions.reduce(exploreReducer, from);

// A ~200 m square near Galax.
const square = polygon([
  [
    [-81.355, 36.628],
    [-81.353, 36.628],
    [-81.353, 36.63],
    [-81.355, 36.63],
    [-81.355, 36.628],
  ],
]);
const county: ParcelRecord = {
  geo: square,
  props: { PARCELID: "52-47A", OWNER: "Someone" },
  source: "https://vginmaps.vdem.virginia.gov/x",
  multiPart: false,
};

describe("explore state", () => {
  it("a tap lookup that finds a parcel stays in tap mode; a report is replaced by the parcel", () => {
    const s = run([
      { type: "mode", mode: "pick" },
      {
        type: "noParcel",
        ll: [36.6, -81.3],
        report: ["vginmaps.vdem.virginia.gov: no parcel at this point"],
      },
      { type: "parcel", parcel: county },
    ]);
    expect(s.mode).toBe("pick");
    expect(s.noParcel).toBeNull();
    expect(s.parcel).toBe(county);
  });

  it("a failed lookup keeps the loaded parcel and shows the report", () => {
    const s = run([
      { type: "parcel", parcel: county },
      { type: "noParcel", ll: [36.6, -81.3], report: ["x: HTTP 500"] },
    ]);
    expect(s.parcel).toBe(county);
    expect(s.noParcel?.report).toEqual(["x: HTTP 500"]);
  });

  it("draws a boundary: needs three corners, closes the ring, ends draw mode", () => {
    const corners: LatLon[] = [
      [36.628, -81.355],
      [36.628, -81.353],
      [36.63, -81.353],
    ];
    const two = run([
      { type: "startDraw" },
      ...corners.slice(0, 2).map((ll) => ({ type: "draftAdd" as const, ll })),
    ]);
    expect(exploreReducer(two, { type: "finishDraw" })).toBe(two); // not enough corners: unchanged
    const s = run([{ type: "draftAdd", ll: corners[2]! }, { type: "finishDraw" }], two);
    expect(s.mode).toBeNull();
    expect(s.draft).toEqual([]);
    expect(s.parcel?.source).toBe("drawn");
    expect(s.parcel?.geo.geometry.coordinates[0]).toEqual([
      [-81.355, 36.628],
      [-81.353, 36.628],
      [-81.353, 36.63],
      [-81.355, 36.628],
    ]);
  });

  it("Esc drops the draft; starting a new drawing starts from no corners", () => {
    const s = run([{ type: "startDraw" }, { type: "draftAdd", ll: [36.6, -81.3] }, { type: "draftCancel" }]);
    expect(s).toMatchObject({ mode: null, draft: [] });
    expect(run([{ type: "draftAdd", ll: [36.6, -81.3] }, { type: "startDraw" }]).draft).toEqual([]);
  });

  it("marks the house to 6 decimals and leaves house mode", () => {
    const s = run([
      { type: "mode", mode: "house" },
      { type: "house", ll: [36.62912345678, -81.35421987654] },
    ]);
    expect(s.house).toEqual([36.629123, -81.35422]);
    expect(s.mode).toBeNull();
    // Dragging the bulls-eye later doesn't change the mode.
    expect(
      run([
        { type: "mode", mode: "pick" },
        { type: "house", ll: [36.6, -81.3] },
      ]).mode,
    ).toBe("pick");
  });

  it("splits: two taps set the line and end split mode; using a piece records where it came from", () => {
    const a: LatLon = [36.627, -81.354],
      b: LatLon = [36.631, -81.354];
    const s = run([{ type: "parcel", parcel: county }, { type: "startSplit" }, { type: "splitTap", ll: a }]);
    expect(s).toMatchObject({ mode: "split", split: { a, b: null } });
    const t = exploreReducer(s, { type: "splitTap", ll: b });
    expect(t).toMatchObject({ mode: null, split: { a, b } });
    expect(exploreReducer(t, { type: "splitTap", ll: [0, 0] })).toBe(t); // a third tap does nothing

    const pieces = splitPieces(county.geo, a, b);
    const used = exploreReducer(t, { type: "usePiece", pieces, side: 1 });
    expect(used.split).toBeNull();
    expect(used.parcel?.source).toBe("split");
    expect(used.parcel?.props).toEqual({ PARCELID: "52-47A", OWNER: "Someone", split_from: "52-47A" });
    expect(area(used.parcel!.geo) / M2_PER_ACRE).toBeCloseTo(pieces.rightAc, 6);
  });

  it("a new parcel ends a split of the old one; Clear resets everything", () => {
    const s = run([
      { type: "parcel", parcel: county },
      { type: "startSplit" },
      { type: "splitTap", ll: [36.627, -81.354] },
      { type: "parcel", parcel: { ...county, source: "square" } },
    ]);
    expect(s.split).toBeNull();
    expect(run([{ type: "house", ll: [36.6, -81.3] }, { type: "clear" }], s)).toEqual(INITIAL);
  });
});

describe("combining (step 13b)", () => {
  const other: ParcelRecord = {
    geo: polygon([
      [
        [-81.353, 36.628],
        [-81.351, 36.628],
        [-81.351, 36.63],
        [-81.353, 36.63],
        [-81.353, 36.628],
      ],
    ]),
    props: { PARCELID: "52-42" },
    source: "https://vginmaps.vdem.virginia.gov/x",
    multiPart: false,
  };

  it("starts with the loaded parcel; a second tap on a parcel takes it out", () => {
    const s = run([{ type: "parcel", parcel: county }, { type: "startCombine" }]);
    expect(s.mode).toBe("combine");
    expect(s.combine).toEqual([county]);
    const two = exploreReducer(s, { type: "combineToggle", parcel: other });
    expect(two.combine).toEqual([county, other]);
    // The same parcel again (a fresh record from a new lookup): out.
    const back = exploreReducer(two, {
      type: "combineToggle",
      parcel: { ...other, props: { ...other.props } },
    });
    expect(back.combine).toEqual([county]);
    expect(exploreReducer(two, { type: "combineRemove", index: 0 }).combine).toEqual([other]);
  });

  it("a drawn piece is never matched: adding the same drawn shape twice keeps both, and parcels still toggle", () => {
    const drawn: ParcelRecord = {
      geo: other.geo,
      props: { PARCELID: "52-42A" },
      source: "drawn",
      multiPart: false,
    };
    const s = run([
      { type: "startCombine" },
      { type: "combineToggle", parcel: other },
      { type: "combineToggle", parcel: drawn },
      { type: "combineToggle", parcel: drawn },
    ]);
    expect(s.combine?.map((m) => m.source)).toEqual([other.source, "drawn", "drawn"]);
    // Same shape and the same stray ID as "other", but drawn: tapping "other" takes out only "other".
    expect(exploreReducer(s, { type: "combineToggle", parcel: other }).combine?.map((m) => m.source)).toEqual(
      ["drawn", "drawn"],
    );
  });

  it("starts empty with no parcel loaded; taps are ignored when not combining", () => {
    expect(run([{ type: "startCombine" }]).combine).toEqual([]);
    expect(run([{ type: "combineToggle", parcel: other }]).combine).toBeNull();
  });

  it("ends when cancelled, when a parcel is loaded, or when another tool starts", () => {
    const s = run([{ type: "startCombine" }, { type: "combineToggle", parcel: other }]);
    expect(exploreReducer(s, { type: "combineCancel" })).toMatchObject({ combine: null, mode: null });
    expect(exploreReducer(s, { type: "parcel", parcel: county }).combine).toBeNull();
    expect(exploreReducer(s, { type: "startDraw" }).combine).toBeNull();
    expect(exploreReducer(s, { type: "startSplit" }).combine).toBeNull();
    expect(exploreReducer(s, { type: "mode", mode: "pick" }).combine).toBeNull();
    // Marking the house doesn't end it.
    expect(exploreReducer(s, { type: "mode", mode: "house" }).combine).toEqual([other]);
  });
});
