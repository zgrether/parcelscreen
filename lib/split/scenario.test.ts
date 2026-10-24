/** Split as a scenario (step 14 §5, §11, §13 Q7): naming by side, what each piece is graded with, the edits. */
import { polygon } from "@turf/turf";
import { describe, expect, it } from "vitest";
import type { ParcelRecord } from "../geo/parcels";
import type { LatLon } from "../geo/types";
import { withListing } from "../client/parcelEdits";
import { plainParcel, type Markup, type Scenario, type WorkingParcel } from "../client/parcelStore";
import {
  markupInside,
  nextScenarioName,
  pieceAsParcel,
  pieceOf,
  piecesOf,
  pieceSideWord,
  relined,
  renamed,
  withoutScenario,
  withPieceScreen,
  withScenario,
} from "./scenario";

const NOW = "2026-10-24T12:00:00.000Z";
// A square 0.002° on a side; the line runs north through its middle (left of a→b is west, right is east).
const square: ParcelRecord = {
  geo: polygon([
    [
      [-81.355, 36.628],
      [-81.353, 36.628],
      [-81.353, 36.63],
      [-81.355, 36.63],
      [-81.355, 36.628],
    ],
  ]),
  props: { PARCELID: "52-47A" },
  source: "https://vginmaps.vdem.virginia.gov/x",
  multiPart: false,
};
const line = { a: [36.627, -81.354] as LatLon, b: [36.631, -81.354] as LatLon };
const WEST: LatLon = [36.629, -81.3545],
  EAST: LatLon = [36.629, -81.3535];

const mark = (id: string, ll: LatLon): Markup => ({
  id,
  shape: "point",
  kind: "spring",
  ll,
  name: id,
  septicClass: null,
  note: "",
  at: NOW,
});
const area = (id: string, ring: LatLon[]): Markup => ({
  id,
  shape: "area",
  kind: "clearing",
  ring,
  name: id,
  septicClass: null,
  note: "",
  at: NOW,
});
const track: Markup = {
  id: "t1",
  shape: "line",
  kind: "track",
  name: "Track 1",
  condition: "pioneer",
  line: [WEST, EAST],
  widthFt: 10,
  note: "",
  recordedIn: "",
  at: NOW,
};
const scenario = (over: Partial<Scenario> = {}): Scenario => ({
  id: "sc1",
  name: "Split 1",
  ...line,
  screens: { left: null, right: null },
  at: NOW,
  ...over,
});
const parcel = (over: Partial<WorkingParcel> = {}): WorkingParcel => ({
  ...plainParcel(square, NOW),
  key: "k1",
  ...over,
});

describe("a piece's name", () => {
  it("is the compass side it lies on from the line", () => {
    expect(pieceSideWord(line.a, line.b, "left")).toBe("West");
    expect(pieceSideWord(line.a, line.b, "right")).toBe("East");
    // A line running east: left is north.
    expect(pieceSideWord([36.629, -81.356], [36.629, -81.352], "left")).toBe("North");
    // Running north-east: right is south-east.
    expect(pieceSideWord([36.627, -81.356], [36.631, -81.351], "right")).toBe("Southeast");
  });

  it("a scenario is Split 1, then one past the highest default name", () => {
    expect(nextScenarioName([])).toBe("Split 1");
    expect(nextScenarioName([{ name: "Split 1" }, { name: "Sell the east" }, { name: "Split 3" }])).toBe(
      "Split 4",
    );
  });
});

describe("what a piece is graded with", () => {
  it("every line as drawn; the points inside it; an area by its centre", () => {
    const west = pieceOf(parcel(), line, "left")!.geo;
    const markup = [
      track,
      mark("west spring", WEST),
      mark("east spring", EAST),
      // Mostly west of the line: it goes with the west piece.
      area("clearing", [
        [36.6285, -81.3548],
        [36.6285, -81.3538],
        [36.6295, -81.3538],
        [36.6295, -81.3548],
      ]),
    ];
    expect(markupInside(markup, west).map((m) => m.id)).toEqual(["t1", "west spring", "clearing"]);
  });

  it("the same parts with the split kept on its side; the house only if inside; no scenarios of its own", () => {
    const p = parcel({
      house: EAST,
      markup: [track, mark("west spring", WEST)],
      scenarios: [scenario()],
      drivewayLine: "t1",
    });
    const [left, right] = piecesOf(p, line)!;
    expect(left.word).toBe("West");
    expect(left.acres).toBeGreaterThan(0);
    expect(left.acres).toBeCloseTo(right.acres, 1); // the line halves it
    expect(left.parcel).toMatchObject({
      pieces: [square],
      split: { ...line, keep: -1 },
      house: null,
      scenarios: [],
    });
    expect(left.parcel.markup.map((m) => m.id)).toEqual(["t1", "west spring"]);
    expect(right.parcel).toMatchObject({ split: { ...line, keep: 1 }, house: EAST, drivewayLine: "t1" });
    expect(right.parcel.markup.map((m) => m.id)).toEqual(["t1"]);
  });

  it("a line that misses the parts makes no pieces", () => {
    const miss = { a: [36.627, -81.36] as LatLon, b: [36.631, -81.36] as LatLon };
    expect(piecesOf(parcel(), miss)).toBeNull();
  });
});

describe("Add this piece to the list", () => {
  it("a new parcel on the list, with the piece's split, house, marks and screen; no price or listing", () => {
    const p = parcel({ house: EAST, askingPrice: 200_000, listingUrl: "https://x.test/l", markup: [track] });
    const piece = pieceOf(p, line, "right")!;
    const made = pieceAsParcel(piece, "scr-right", "Ferney, East piece", NOW);
    expect(made).toMatchObject({
      key: null,
      name: "Ferney, East piece",
      status: "saved",
      pieces: [square],
      split: { ...line, keep: 1 },
      house: EAST,
      screenIds: ["scr-right"],
      askingPrice: null,
      listingUrl: "",
      scenarios: [],
    });
    expect(made.markup.map((m) => m.id)).toEqual(["t1"]);
    expect(pieceAsParcel(piece, null, "Ferney, East piece", NOW).screenIds).toEqual([]);
    // Nothing typed on the parent: nothing marked.
    expect(made.fromOriginal).toBeUndefined();
  });

  it("the parent's deed restrictions and HOA come with it, marked from the original parcel; an edit makes one its own", () => {
    const p = parcel({ deedRestrictions: "No mobile homes", hoa: "no" });
    const made = pieceAsParcel(pieceOf(p, line, "right")!, null, "Ferney, East piece", NOW);
    expect(made).toMatchObject({
      deedRestrictions: "No mobile homes",
      hoa: "no",
      fromOriginal: ["deedRestrictions", "hoa"],
    });
    expect(withListing(made, { hoa: "yes" }).fromOriginal).toEqual(["deedRestrictions"]);
    expect(withListing(made, { hoa: "no" })).toBe(made); // no change: still copied
    expect(
      withListing(withListing(made, { hoa: "yes" }), { deedRestrictions: "" }).fromOriginal,
    ).toBeUndefined();
    // Only the HOA picked on the parent: only it is marked.
    const hoaOnly = pieceAsParcel(pieceOf(parcel({ hoa: "yes" }), line, "left")!, null, "x", NOW);
    expect(hoaOnly.fromOriginal).toEqual(["hoa"]);
  });
});

describe("the parcel's scenarios", () => {
  const p = withScenario(parcel(), scenario());

  it("a piece's screen kept; the same one again changes nothing", () => {
    const s = withPieceScreen(p, "sc1", "left", "scr1");
    expect(s.scenarios[0]?.screens).toEqual({ left: "scr1", right: null });
    expect(withPieceScreen(s, "sc1", "left", "scr1")).toBe(s);
    expect(withPieceScreen(s, "nope", "left", "scr2")).toBe(s);
  });

  it("a new line drops both screens", () => {
    const graded = withPieceScreen(withPieceScreen(p, "sc1", "left", "l"), "sc1", "right", "r");
    const b2: LatLon = [36.631, -81.3535];
    expect(relined(graded, "sc1", line.a, b2, "later").scenarios[0]).toMatchObject({
      b: b2,
      screens: { left: null, right: null },
      at: "later",
    });
  });

  it("renamed (blank ignored), removed", () => {
    expect(renamed(p, "sc1", " Sell the east ").scenarios[0]?.name).toBe("Sell the east");
    expect(renamed(p, "sc1", "  ")).toBe(p);
    expect(withoutScenario(p, "sc1").scenarios).toEqual([]);
    expect(withoutScenario(p, "nope")).toBe(p);
  });
});
