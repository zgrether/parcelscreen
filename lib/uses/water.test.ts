/** Uses' Water on the land (docs/plans/water.md §2): the summary line, its detail, and nothing for an older grade. */
import { describe, expect, it } from "vitest";
import type { ScreenResult } from "../screen/types";
import { expectedOf } from "../../test/support/expected";
import { septicWetLine, waterView } from "./water";

type W = NonNullable<ScreenResult["water"]>;
const shed = (o: Partial<NonNullable<W["watershed"]>> = {}): NonNullable<W["watershed"]> => ({
  acres: 46.2,
  outline: null,
  capped: false,
  reachKm: 1,
  cover: { forest: 71, open: 22, crops: 0, developed: 4, water: 0, other: 3 },
  roadMi: 0.4,
  inflow: { ll: [36.6, -81.5], acres: 31 },
  ...o,
});
const outline = {
  type: "Feature" as const,
  properties: {},
  geometry: { type: "Polygon" as const, coordinates: [] },
};
const water = (o: Partial<W> = {}): W => ({
  watershed: shed(),
  flow: {
    lines: [{ coords: [], acres: 52 }],
    wet: [
      { ll: [36.6, -81.5], acres: 0.4, outline },
      { ll: [36.6, -81.5], acres: 0.2, outline },
    ],
    ponds: [{ ll: [36.6, -81.5], acres: 55 }],
  },
  soils: [
    {
      mukey: "1",
      name: "Codorus loam",
      acres: 2,
      awcIn: 8,
      drainage: "Somewhat poorly drained",
      waterTableIn: 18,
      hydGroup: "B/D",
      omPct: 3,
    },
  ],
  garden: null,
  ...o,
});

describe("waterView", () => {
  it("the summary line names what drains onto it and what was found", () => {
    const v = waterView(water())!;
    expect(v.line).toBe("46 ac drains onto it, mostly forest; 2 likely wet spots, 1 possible pond site");
    expect(v.sections[0]!.lines).toEqual([
      "46 ac of land drains onto the parcel",
      "Land cover: 71% forest, 22% open land and pasture",
      "Roads in that land: 0.4 mi",
      "Its largest inflow: 31 ac of it enters at one point",
    ]);
    expect(v.soils).toEqual([
      {
        name: "Codorus loam",
        facts:
          "holds 8.0 in of water in the top 40 in; somewhat poorly drained; water table at 18 in; runoff group B/D (sheds most rain); 3.0% organic matter",
      },
    ]);
  });
  it("a ridge-top parcel, a capped watershed, and the parts that didn't load", () => {
    expect(waterView(water({ watershed: shed({ acres: 0 }), flow: null }))!.line).toBe(
      "No land drains onto it",
    );
    expect(waterView(water({ watershed: shed({ capped: true, reachKm: 5 }) }))!.sections[0]!.lines[1]).toBe(
      "The watershed reaches past 5.0 km; shown to there",
    );
    const v = waterView(water({ watershed: null, flow: null }))!;
    expect(v.sections.map((s) => s.lines[0])).toEqual([
      "The 10 m elevation didn't load: grade again for the watershed",
      "The 3 m lidar didn't load: grade again for flow and wet ground",
    ]);
  });
  it("nothing for a grade from before the measurement", () => {
    expect(waterView(undefined)).toBeNull();
  });
});

describe("septicWetLine (Septic's panel)", () => {
  const base = { soils: [], soilUnits: [] } as unknown as ScreenResult;
  const wetPatch = {
    ll: [36.6, -81.5] as [number, number],
    acres: 0.3,
    outline: {
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "Polygon" as const,
        coordinates: [
          [
            [-81.501, 36.599],
            [-81.499, 36.599],
            [-81.499, 36.601],
            [-81.501, 36.601],
            [-81.501, 36.599],
          ],
        ],
      },
    },
  };
  it("on a wet patch: the warning; off it, nothing", () => {
    const r = { ...base, water: water({ flow: { lines: [], wet: [wetPatch], ponds: [] } }) } as ScreenResult;
    expect(septicWetLine(r, [36.6, -81.5])).toBe(
      "The build site is on likely wet ground; a drainfield needs drier soil.",
    );
    expect(septicWetLine(r, [36.7, -81.5])).toBeNull();
  });
  it("nothing for a grade from before the measurement", () => {
    expect(septicWetLine(base, [36.6, -81.5])).toBeNull();
  });
  it("the fixtures' build sites", () => {
    for (const slug of [
      "ferney-creek-52-47A",
      "macks-mountain-35-3",
      "grayson-mud-creek-6273",
      "roan-hwy-143-099-046-02",
    ] as const) {
      const r = expectedOf(slug, "run");
      const ll = r.sites?.[0]?.ll;
      expect([slug, ll ? septicWetLine(r, ll) : null]).toEqual([slug, null]);
    }
  });
});
