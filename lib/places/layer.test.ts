/** The Places layer's features and tap card (step 14d plan §5, §9). */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import type { Place } from "../screen/placeData";
import {
  airportFeatures,
  bakedFeatures,
  cardLines,
  cellsInBox,
  longTrailFeatures,
  timedMinutes,
  type PlaceProps,
} from "./layer";

const places: Place[] = [
  { kind: "grocer", id: "osm:node/1", name: "Food City", ll: [36.6, -81.5], src: "osm", big: true },
  { kind: "trailhead", id: "usfs:9", name: "Elk Garden", ll: [36.65, -81.58], src: "usfs" },
  { kind: "parking", id: "osm:way/2", ll: [36.65, -81.581], src: "osm" },
  {
    kind: "launch",
    id: "osm:node/3",
    name: "Rat Branch Boat Ramp",
    ll: [36.3, -81.9],
    src: "osm",
    water: "flat",
    waterName: "Watauga Lake",
  },
  {
    kind: "launch",
    id: "osm:node/4",
    name: "Guy Ford access",
    ll: [36.3, -81.8],
    src: "osm",
    water: "river",
  },
];

const props = (over: Partial<PlaceProps>): PlaceProps => ({
  id: "x",
  kind: "trailhead",
  name: "Elk Garden",
  source: "US Forest Service",
  checked: "2026-10-25",
  water: "",
  of: "",
  ...over,
});

describe("the baked places as features", () => {
  it("groceries, trailheads and launches, each a point at [lon, lat]; parking isn't shown", () => {
    const f = bakedFeatures(places, "2026-10-25");
    expect(Object.keys(f).sort()).toEqual(["grocery", "launch", "trailhead"]);
    expect(f.grocery![0]!.geometry.coordinates).toEqual([-81.5, 36.6]);
    expect(f.trailhead![0]!.properties).toMatchObject({ source: "US Forest Service", checked: "2026-10-25" });
    expect(f.launch!.map((x) => [x.properties.water, x.properties.of])).toEqual([
      ["flat", "Watauga Lake"],
      ["river", ""],
    ]);
  });

  it("Settings' airports and the long trails' access points, with no source or date", () => {
    const [a] = airportFeatures([{ name: "Tri-Cities airport (TRI)", lat: 36.4752, lon: -82.4074 }]);
    expect(a!.properties).toMatchObject({ kind: "airport", source: "", checked: "" });
    const t = longTrailFeatures([
      { name: "New River Trail", miles: 57, points: [{ name: "Fries", lat: 36.7, lon: -81 }] },
    ]);
    expect(t[0]!.properties).toMatchObject({ kind: "longTrail", name: "Fries", of: "New River Trail" });
  });

  it("the cells a box touches, south to north, west to east", () => {
    expect(cellsInBox([-82.3, 35.8, -80.9, 36.2])).toEqual([
      "35_-83",
      "35_-82",
      "35_-81",
      "36_-83",
      "36_-82",
      "36_-81",
    ]);
  });
});

describe("the tap card", () => {
  it("name, type, where it's from, checked; a river launch adds its warning", () => {
    expect(cardLines(props({}), null)).toEqual([
      "Elk Garden",
      "Trailhead",
      "From US Forest Service",
      "Checked 2026-10-25",
    ]);
    expect(
      cardLines(
        props({ kind: "launch", name: "Guy Ford access", water: "river", of: "Watauga River" }),
        null,
      ),
    ).toEqual([
      "Guy Ford access",
      "Paddle launch: river, Watauga River",
      "From US Forest Service",
      "Checked 2026-10-25",
      "Check the river's class (how hard its rapids are) before paddling",
    ]);
    // Beside a graded parcel, its missing drive is by design (polish 2, P11).
    expect(
      cardLines(props({ kind: "launch", name: "Guy Ford access", water: "river" }), null, false, true),
    ).toContain("Not timed: rivers are listed, not graded");
  });

  it("flatwater says what it is the first time; the drive from the parcel when the grade timed it", () => {
    const p = props({
      kind: "launch",
      name: "Rat Branch Boat Ramp",
      water: "flat",
      of: "Watauga Lake",
      source: "OpenStreetMap",
    });
    expect(cardLines(p, 28, true)[1]).toBe("Paddle launch: flatwater (a lake or reservoir), Watauga Lake");
    expect(cardLines(p, 28)).toEqual([
      "Rat Branch Boat Ramp",
      "Paddle launch: flatwater, Watauga Lake",
      "From OpenStreetMap",
      "Checked 2026-10-25",
      "28 min from this parcel",
    ]);
  });

  it("the minutes come from the open parcel's result, matched by name or position; nothing timed reads null", () => {
    const r = expectedOf("roan-hwy-143-099-046-02", "run");
    const f = r.paddling!.flat!;
    expect(
      timedMinutes(r, props({ kind: "launch", name: f.name, water: "flat", of: f.water ?? "" }), [0, 0]),
    ).toBe(f.min);
    const er = r.drives!.find((d) => d.label === "Nearest hospital")!;
    expect(timedMinutes(r, props({ kind: "er", name: er.name }), [0, 0])).toBe(er.min);
    const th = r.near!.trailheads.find((t) => t.drive)!;
    expect(timedMinutes(r, props({ name: "anything" }), th.ll)).toBe(th.drive!.min);
    expect(timedMinutes(r, props({ kind: "grocery", name: "Nowhere Market" }), [0, 0])).toBeNull();
    expect(timedMinutes(null, props({}), [0, 0])).toBeNull();
  });
});
