import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { DEFAULT_RATES, type Rates } from "../config/costs";
import type { LatLon } from "../geo/types";
import { NO_PRACTICAL_ROUTE } from "../screen/score";
import type { PartialScreenResult } from "../screen/types";
import {
  COST_ITEMS,
  COST_NOTES,
  costToEnjoy,
  groundAlong,
  groundBetween,
  LOWER_IT,
  padOf,
  roundCost,
  type CostInput,
  type CostItem,
  type CostLine,
  type CostMark,
} from "./cost";
import { scoredRoute } from "./lines";
import { lineString } from "@turf/turf";

const MUD = "grayson-mud-creek-6273";
const mud = (): PartialScreenResult => expectedOf(MUD, "run");

const run = (over: Partial<CostInput> = {}) => {
  const c = costToEnjoy({
    result: mud(),
    lines: [],
    marks: [],
    askingPrice: 185_000,
    rates: DEFAULT_RATES,
    ...over,
  });
  if (c?.kind !== "priced") throw new Error("not priced");
  return c;
};
const itemOf = (items: readonly CostItem[], label: string) => items.find((i) => i.label === label);

/** The route's own line, entrance to site, [lat, lon]. */
const routeLatLon = (r: PartialScreenResult): LatLon[] =>
  scoredRoute(r.driveway!)!.line.geometry.coordinates.map(([lon, lat]) => [lat!, lon!] as LatLon);
const siteLl = (r: PartialScreenResult): LatLon => r.sites![0]!.ll;

const track = (line: LatLon[], condition: CostLine["condition"] = "pioneer"): CostLine => ({
  id: "t1",
  kind: "track",
  condition,
  line,
  recordedIn: "",
});
const pointMark = (kind: "power" | "well" | "spring" | "campsite" | "septic", ll: LatLon): CostMark => ({
  id: `${kind}1`,
  shape: "point",
  kind,
  ll,
  septicClass: kind === "septic" ? "conventional" : null,
});
/** A square area mark around a place, ~±20 m. */
const around = (ll: LatLon): CostMark => {
  const d = 0.0002;
  return {
    id: "c1",
    shape: "area",
    kind: "clearing",
    ring: [
      [ll[0] - d, ll[1] - d],
      [ll[0] - d, ll[1] + d],
      [ll[0] + d, ll[1] + d],
      [ll[0] + d, ll[1] - d],
    ],
    septicClass: null,
  };
};

describe("the cost to enjoy (step 10 plan §2)", () => {
  it("prices Mud Creek at its listing price: the camp's items, then the build's", () => {
    const c = run();
    expect(c.site).toBe("site #1");
    expect(c.camp.items.map((i) => i.label)).toEqual([
      COST_ITEMS.land,
      COST_ITEMS.track,
      COST_ITEMS.campClearing,
    ]);
    expect(c.build.items.map((i) => i.label)).toEqual([
      COST_ITEMS.land,
      COST_ITEMS.track,
      COST_ITEMS.campClearing,
      COST_ITEMS.driveway,
      "Paving, 2,185 ft over 12%",
      COST_ITEMS.culverts,
      "Well (150–400 ft)",
      "Septic, modified",
      "Power, 1,094 ft from the road",
      COST_ITEMS.hookup,
      COST_ITEMS.houseClearing,
      "House pad, sloped",
    ]);
    expect(c.camp.total).toEqual({ low: 200_000, high: 240_000 });
    expect(c.build.total).toEqual({ low: 330_000, high: 595_000 });
    expect(c.camp.land).toBe(185_000);
  });

  it("keeps every total a range, its low the sum of the lows and its high the sum of the highs", () => {
    const c = run();
    for (const e of [c.camp, c.build]) {
      const low = e.items.reduce((t, i) => t + i.total.low, 0);
      const high = e.items.reduce((t, i) => t + i.total.high, 0);
      expect(e.total).toEqual({ low: roundCost(low), high: roundCost(high) });
      expect(e.total.low).toBeLessThan(e.total.high);
    }
  });

  it("says 'plus the land' without a price: no land item, and the total leaves it out", () => {
    const priced = run();
    const c = run({ askingPrice: null });
    expect(c.camp.land).toBeNull();
    expect(itemOf(c.camp.items, COST_ITEMS.land)).toBeUndefined();
    expect(c.camp.total.low).toBe(priced.camp.total.low - 185_000);
  });

  it("drops the camp's track to $0 with a pioneer track drawn along the route, and lowers the build", () => {
    const before = run();
    const c = run({ lines: [track(routeLatLon(mud()))] });
    const t = itemOf(c.camp.items, COST_ITEMS.track)!;
    expect(t.total).toEqual({ low: 0, high: 0 });
    expect(t.lower).toBeNull();
    expect(c.camp.total.high).toBeLessThan(before.camp.total.high);
    // The finished driveway is the same upgrade either way: the camp's track is in place.
    expect(itemOf(c.build.items, COST_ITEMS.driveway)!.total).toEqual(
      itemOf(before.build.items, COST_ITEMS.driveway)!.total,
    );
  });

  it("prices an improved drive along the route at the improved upgrade, and a paved one at $0, paving included", () => {
    const line = routeLatLon(mud());
    const improved = run({ lines: [track(line, "improved")] });
    const d = itemOf(improved.build.items, COST_ITEMS.driveway)!;
    expect(d.parts.map((p) => p.rate)).toEqual(["driveway.upgrade.improved"]);
    const paved = run({ lines: [track(line, "paved")] });
    expect(itemOf(paved.build.items, COST_ITEMS.driveway)!.parts).toEqual([]);
    expect(paved.build.items.some((i) => i.label.startsWith("Paving"))).toBe(false);
  });

  it("paves the steep stretches on top of the gravel, with its length and threshold (owner, #255 review)", () => {
    const pave = itemOf(run().build.items, "Paving, 2,185 ft over 12%")!;
    expect(pave.parts.map((p) => p.rate)).toEqual(["driveway.paving"]);
    expect(pave.lower).toBe(LOWER_IT.paving);
    // A higher threshold paves less.
    const at15 = run({ paving: { on: true, abovePct: 15 } }).build.items.find((i) =>
      i.label.startsWith("Paving"),
    )!;
    expect(at15.label).toMatch(/^Paving, [\d,]+ ft over 15%$/);
    expect(at15.total.high).toBeLessThan(pave.total.high);
  });

  it("leaves steep stretches gravel with paving off: no paving cost, a note on the driveway", () => {
    const on = run();
    const off = run({ paving: { on: false, abovePct: 12 } });
    expect(off.build.items.some((i) => i.label.startsWith("Paving"))).toBe(false);
    expect(itemOf(off.build.items, COST_ITEMS.driveway)!.notes).toEqual([COST_NOTES.steepGravel]);
    expect(itemOf(on.build.items, COST_ITEMS.driveway)!.notes).toEqual([]);
    expect(off.build.total.high).toBeLessThan(on.build.total.high);
    // Ferney's route is gentle: nothing steep, so no note either way.
    const ferney = costToEnjoy({
      result: expectedOf("ferney-creek-52-47A", "run"),
      lines: [],
      marks: [],
      askingPrice: null,
      rates: DEFAULT_RATES,
      paving: { on: false, abovePct: 12 },
    });
    expect(ferney?.kind === "priced" && itemOf(ferney.build.items, COST_ITEMS.driveway)!.notes).toEqual([]);
  });

  it("ignores a line farther than 15 m from the route", () => {
    // The route's line moved ~1 km north (the route switches back, so a near copy would touch another leg).
    const far = routeLatLon(mud()).map(([lat, lon]) => [lat + 0.009, lon] as LatLon);
    expect(run({ lines: [track(far)] }).camp.total).toEqual(run().camp.total);
  });

  it("takes power from a Power mark near the site, without 'assumes power along the road'", () => {
    const before = run();
    const s = siteLl(mud());
    const c = run({ marks: [pointMark("power", [s[0] + 0.0005, s[1]])] });
    const p = c.build.items.find((i) => i.label.startsWith("Power, "))!;
    expect(p.label).toMatch(/^Power, \d+ ft from your power mark$/);
    expect(p.notes).not.toContain(COST_NOTES.powerAlongRoad);
    expect(p.lower).toBeNull();
    expect(c.build.total.high).toBeLessThan(before.build.total.high);
  });

  it("prices a pump and line for a well or a spring marked near the site, and a drilled well otherwise", () => {
    const s = siteLl(mud());
    const spring = run({ marks: [pointMark("spring", s)] });
    const pump = itemOf(spring.build.items, COST_ITEMS.pump)!;
    expect(pump.notes).toEqual([COST_NOTES.spring]);
    expect(itemOf(run({ marks: [pointMark("well", s)] }).build.items, COST_ITEMS.pump)!.notes).toEqual([]);
    // A spring 0.5 mi off doesn't serve the site.
    const far = run({ marks: [pointMark("spring", [s[0] + 0.007, s[1]])] });
    expect(itemOf(far.build.items, COST_ITEMS.pump)).toBeUndefined();
    expect(itemOf(far.build.items, "Well (150–400 ft)")!.lower).toBe(LOWER_IT.water);
  });

  it("uses a septic permit's class near the site over the soil's", () => {
    const c = run({ marks: [pointMark("septic", siteLl(mud()))] });
    const s = itemOf(c.build.items, "Septic, conventional")!;
    expect(s.lower).toBeNull();
    expect(s.total).toEqual(DEFAULT_RATES["septic.conventional"]);
  });

  it("clears nothing where the site sits in a Clearing mark", () => {
    const c = run({ marks: [around(siteLl(mud()))] });
    expect(itemOf(c.build.items, COST_ITEMS.houseClearing)!.total).toEqual({ low: 0, high: 0 });
    // The camp is the site, so its clearing is free too.
    expect(itemOf(c.camp.items, COST_ITEMS.campClearing)!.total).toEqual({ low: 0, high: 0 });
  });

  it("runs the track to a Campsite mark: its share of the route, then off it × 1.2; the rest of the route is new", () => {
    const line = routeLatLon(mud());
    // A third of the way along the route, ~45 m to one side.
    const mid = line[Math.floor(line.length / 3)]!;
    const c = run({ marks: [pointMark("campsite", [mid[0], mid[1] + 0.0005])] });
    const t = itemOf(c.camp.items, COST_ITEMS.track)!;
    expect(t.notes).toEqual([COST_NOTES.offRoute]);
    expect(t.parts).toHaveLength(2);
    expect(t.total.high).toBeLessThan(itemOf(run().camp.items, COST_ITEMS.track)!.total.high);
    const fresh = itemOf(c.build.items, COST_ITEMS.newDriveway)!;
    expect(fresh.parts[0]!.rate).toBe("driveway.new");
    expect(fresh.notes).toEqual([COST_NOTES.beyondTrack]);
  });

  it("adds a legal way in where the route needs an easement (Roan), and none where it doesn't (Mud Creek)", () => {
    const roan = costToEnjoy({
      result: expectedOf("roan-hwy-143-099-046-02", "run"),
      lines: [],
      marks: [],
      askingPrice: null,
      rates: DEFAULT_RATES,
    });
    expect(roan?.kind === "priced" && itemOf(roan.camp.items, COST_ITEMS.easement)).toBeTruthy();
    expect(itemOf(run().camp.items, COST_ITEMS.easement)).toBeUndefined();
  });

  it("reads Settings' rates: doubling clearing raises both costs", () => {
    const rates: Rates = { ...DEFAULT_RATES, clearing: { low: 5_000, high: 17_000 } };
    const c = run({ rates });
    expect(itemOf(c.camp.items, COST_ITEMS.campClearing)!.total).toEqual({ low: 500, high: 1_700 });
    expect(c.build.total.high).toBeGreaterThan(run().build.total.high);
  });

  it("says no practical drive when the screen found none, and waits for the driveway", () => {
    const r = structuredClone(mud());
    r.driveway = { ...r.driveway!, note: NO_PRACTICAL_ROUTE, routes: [], overLimit: undefined };
    expect(costToEnjoy({ result: r, lines: [], marks: [], askingPrice: 1, rates: DEFAULT_RATES })).toEqual({
      kind: "noWay",
    });
    const pending = structuredClone(mud());
    delete pending.driveway;
    expect(
      costToEnjoy({ result: pending, lines: [], marks: [], askingPrice: 1, rates: DEFAULT_RATES }),
    ).toBeNull();
  });
});

describe("the cost's helpers", () => {
  it("rounds to $1k under $100k and to $5k from there", () => {
    expect(roundCost(12_400)).toBe(12_000);
    expect(roundCost(99_400)).toBe(99_000);
    expect(roundCost(212_400)).toBe(210_000);
    expect(roundCost(243_000)).toBe(245_000);
  });

  it("picks the pad by slope", () => {
    expect([padOf(2), padOf(4), padOf(10), padOf(10.5), padOf(null)]).toEqual([
      "flat",
      "sloped",
      "sloped",
      "steep",
      "sloped",
    ]);
  });

  it("splits a route into runs by the best condition within 15 m, scaled to its length", () => {
    const route = lineString([
      [-81.56, 36.585],
      [-81.55, 36.585],
    ]);
    // A paved line along the first half, and an uncleared one over the whole.
    const half: LatLon[] = [
      [36.585, -81.56],
      [36.585, -81.555],
    ];
    const whole: LatLon[] = [
      [36.585, -81.56],
      [36.585, -81.55],
    ];
    const runs = groundAlong(route, 1000, [track(whole, "uncleared"), { ...track(half, "paved"), id: "t2" }]);
    expect(runs.map((r) => r.ground)).toEqual(["paved", "uncleared"]);
    const g = groundBetween(runs, 0, 1000);
    expect(g.paved + g.uncleared).toBeCloseTo(1000, 6);
    // Half the route, plus the 15 m past the paved line's end that's still within reach of it (~893 m in all).
    expect(g.paved).toBeGreaterThan(510);
    expect(g.paved).toBeLessThan(525);
  });
});
