/**
 * Point and area markers on the card (WF4, docs/plans/parcel-workflow.md §3.1; owner's tests, WF4 review): a septic
 * permit passes the Septic gate, with its reminder appended, and where it is when it's more than 200 ft from the build
 * site; a spring within 300 ft of the garden the row names is noted. Existing text stays first (rule 7).
 */
import { destination, point } from "@turf/turf";
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import type { LatLon } from "../geo/types";
import type { ScreenResult } from "../screen/types";
import { cardFacts } from "./card";
import { feetTo, PERMIT_ON_FILE, SPRING_MARKED, type Mark, type PointMark } from "./marks";
import { panelText } from "./cardPanels";

/** A place `ft` from `ll`, toward `bearing` (degrees from north). */
const away = (ll: LatLon, ft: number, bearing = 90): LatLon => {
  const [lon, lat] = destination(point([ll[1], ll[0]]), ft, bearing, { units: "feet" }).geometry.coordinates;
  return [lat!, lon!];
};
const permitAt = (ll: LatLon): PointMark => ({ id: "p", shape: "point", kind: "septic", ll });
const springAt = (ll: LatLon): PointMark => ({ id: "s", shape: "point", kind: "spring", ll });
/** A square area, `side` ft across, whose west edge is `ft` east of `ll` (its nearest edge to it). */
const fieldEastOf = (ll: LatLon, ft: number, side = 100): Mark => {
  const w = away(ll, ft),
    e = away(ll, ft + side);
  const n = away(w, side / 2, 0)[0],
    s = away(w, side / 2, 180)[0];
  return {
    id: "f",
    shape: "area",
    kind: "septic",
    ring: [
      [s, w[1]],
      [s, e[1]],
      [n, e[1]],
      [n, w[1]],
    ],
  };
};
const septic = (r: ScreenResult, marks: Mark[]) =>
  cardFacts(r, undefined, undefined, { names: new Map(), marks }).gates.find((g) => g.key === "septic")!;
const garden = (r: ScreenResult, marks: Mark[]) =>
  cardFacts(r, undefined, undefined, { names: new Map(), marks }).rows.find((x) => x.key === "garden")!;

describe("a septic permit you mark passes the Septic gate", () => {
  it("turns a warn into a pass: the soils' sentence first, then the reminder", () => {
    const r = expectedOf("macks-mountain-35-3", "run");
    const before = septic(r, []);
    expect(before.status).toBe("warn");
    const after = septic(r, [permitAt(r.sites![0]!.ll)]);
    expect(after).toMatchObject({ status: "pass", reason: `${before.reason}; ${PERMIT_ON_FILE}` });
  });

  it("turns an unknown into a pass; the soils that didn't load are still said, and still missing", () => {
    const r = structuredClone(expectedOf("ferney-creek-52-47A", "run"));
    delete r.soils;
    expect(septic(r, [])).toMatchObject({ status: "unknown", missing: "the NRCS soils" });
    expect(septic(r, [permitAt(r.sites![0]!.ll)])).toEqual({
      key: "septic",
      label: "Septic",
      status: "pass",
      reason: `The NRCS soils didn't load; ${PERMIT_ON_FILE}`,
      missing: "the NRCS soils",
    });
  });

  it("says where the permit is when it's more than 200 ft from site #1: at 201 ft, not at 199 ft", () => {
    const r = expectedOf("macks-mountain-35-3", "run");
    const site = r.sites![0]!.ll;
    expect(feetTo(permitAt(away(site, 201)), site)).toBeCloseTo(201, 3);
    expect(septic(r, [permitAt(away(site, 201))]).reason).toMatch(
      /; the permit is 201 ft from site #1; it covers the spot that was tested$/,
    );
    expect(septic(r, [permitAt(away(site, 199))]).reason.endsWith(`; ${PERMIT_ON_FILE}`)).toBe(true);
    // Two permits: the nearer one counts.
    expect(septic(r, [permitAt(away(site, 500)), permitAt(away(site, 150, 0))]).reason).not.toMatch(
      /ft from/,
    );
  });

  it("measures from the marked house when there is one, and says so", () => {
    const r = expectedOf("ferney-creek-52-47A", "houseRun");
    const house = (r.house as { ll: LatLon }).ll;
    expect(septic(r, [permitAt(away(house, 201))]).reason).toMatch(
      /; the permit is 201 ft from the marked house; it covers the spot that was tested$/,
    );
    expect(septic(r, [permitAt(away(house, 199))]).reason).not.toMatch(/ft from/);
  });

  it("an area: to its nearest edge, 0 when the site is inside it", () => {
    const r = expectedOf("macks-mountain-35-3", "run");
    const site = r.sites![0]!.ll;
    expect(feetTo(fieldEastOf(site, 201), site)).toBeCloseTo(201, 0);
    expect(septic(r, [fieldEastOf(site, 201)]).reason).toMatch(/the permit is 201 ft from site #1/);
    expect(septic(r, [fieldEastOf(site, 199)]).reason).not.toMatch(/ft from/);
    expect(feetTo(fieldEastOf(away(site, 50, 270), 0), site)).toBe(0);
  });

  it("the Septic panel's How it's scored says so, after what it said (rule 7)", () => {
    expect(panelText("septic").howScored).toBe(
      "Warns when no soil on the parcel rates better than very limited; never fails, because a soil evaluation on the spot decides. A septic permit you mark passes it, with a reminder to get a copy.",
    );
  });
});

describe("a spring you mark near the garden is noted on the Garden row", () => {
  it("within 300 ft of the garden the row names, and not beyond; the grade is the same", () => {
    const r = expectedOf("ferney-creek-52-47A", "run");
    const before = garden(r, []);
    // The row names its best garden, on prime farmland: the first of the result's gardens here.
    expect(before.detail).toBe("a 2.48 ac garden on prime farmland");
    const at = r.gardens![0]!.ll;
    expect(garden(r, [springAt(away(at, 290))])).toMatchObject({
      grade: before.grade,
      detail: `${before.detail}; ${SPRING_MARKED}`,
      short: before.short,
    });
    expect(garden(r, [springAt(away(at, 310))])).toEqual(before);
    // A well isn't a spring.
    expect(garden(r, [{ ...springAt(away(at, 10)), kind: "well" }])).toEqual(before);
  });

  it("the largest garden, when that's the one the row names", () => {
    const r = structuredClone(expectedOf("ferney-creek-52-47A", "run"));
    r.soils = r.soils!.map((x) => ({ ...x, farmlndcl: "Not prime farmland" }));
    const before = garden(r, []);
    expect(before.detail).toBe("the largest garden is 3.10 ac");
    const largest = r.gardens!.reduce((a, x) => (x.acres > a.acres ? x : a));
    expect(garden(r, [springAt(away(largest.ll, 250))]).detail).toBe(`${before.detail}; ${SPRING_MARKED}`);
    // Near another garden, not the one named: nothing.
    expect(garden(r, [springAt(r.gardens![0]!.ll)]).detail).toBe(before.detail);
  });
});
