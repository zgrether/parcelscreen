/** Climbing's measurement (step 17 plan §3): which areas are timed, and the figures from their drives. */
import { describe, expect, it } from "vitest";
import { climbingFrom, cragsToTime } from "./climbing";
import type { BakedCrag, CragType } from "./placeData";
import type { LatLon } from "./util";

const crag = (id: string, types: CragType[], ll: LatLon): BakedCrag => ({
  kind: "crag",
  id: `crag:${id}`,
  name: id,
  ll,
  src: "crags",
  types,
  access: "test",
  url: "https://example.org",
  checked: "2026-10-31",
});
const leg = (min: number) => ({ min, mi: min * 0.8 });
const HOME: LatLon = [36.0, -82.0];

describe("the areas timed", () => {
  it("the nearest rope and bouldering areas within 150 km, each once", () => {
    const near = crag("near", ["sport", "bouldering"], [36.05, -82.0]);
    const far = crag("far", ["trad"], [37.5, -82.0]); // about 167 km
    const tr = crag("tr", ["top-rope"], [36.1, -82.0]);
    const out = cragsToTime(HOME, [far, tr, near]);
    expect(out.map((c) => c.id)).toEqual(["crag:near"]);
  });

  it("at most 12 rope areas and 3 bouldering areas", () => {
    const ropes = Array.from({ length: 15 }, (_, i) => crag(`r${i}`, ["sport"], [36 + i * 0.01, -82]));
    const boulders = Array.from({ length: 5 }, (_, i) =>
      crag(`b${i}`, ["bouldering"], [36 + i * 0.01, -82.01]),
    );
    const out = cragsToTime(HOME, [...ropes, ...boulders]);
    expect(out.filter((c) => c.types.includes("sport"))).toHaveLength(12);
    expect(out.filter((c) => c.types.includes("bouldering"))).toHaveLength(3);
  });
});

describe("the figures", () => {
  it("the nearest rope area and bouldering area by road, not by line; top-rope alone isn't rope", () => {
    const a = crag("a", ["trad"], [36.01, -82]);
    const b = crag("b", ["sport", "bouldering"], [36.02, -82]);
    const t = crag("t", ["top-rope", "bouldering"], [36.03, -82]);
    const c = climbingFrom([a, b, t], [leg(50), leg(40), leg(10)]);
    expect(c.rope).toEqual({ id: "b", name: "b", types: ["sport", "bouldering"], ...leg(40) });
    expect(c.boulder).toEqual({ id: "t", name: "t", ...leg(10) });
    expect(c.timed).toEqual([
      { id: "a", min: 50 },
      { id: "b", min: 40 },
      { id: "t", min: 10 },
    ]);
  });

  it("counts the rope areas within 60 minutes, at 60 and not at 61; an unrouted area is skipped", () => {
    const xs = ["a", "b", "c", "d"].map((id) => crag(id, ["sport"], [36, -82]));
    const c = climbingFrom(xs, [leg(60), leg(61), null, leg(12)]);
    expect(c.ropeWithin).toBe(2);
    expect(c.timed.map((t) => t.id)).toEqual(["a", "b", "d"]);
  });

  it("nothing within reach: no rope area, no bouldering, none within the hour", () => {
    expect(climbingFrom([], [])).toEqual({ rope: null, boulder: null, ropeWithin: 0, timed: [] });
  });
});
