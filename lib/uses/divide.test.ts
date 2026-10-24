/**
 * Divide (step 14 plan §3.3) on synthetic parcels: frontage-limited, size-limited, no zoning, a county not covered,
 * Mitchell's minimum by slope, a county with no frontage rule or no minimum, and exceptions never added.
 */
import { describe, expect, it } from "vitest";
import { COUNTIES, countyByFips, type CountyRules, type Fact } from "../config/counties";
import { divide, divideHeadline, type DivideInput } from "./divide";

const fact = <T>(value: T): Fact<T> => ({
  value,
  says: "",
  source: "https://example.org",
  checked: "2026-10-23",
  confidence: "from the ordinance",
});
const county = (over: Partial<CountyRules> = {}): CountyRules => ({
  fips: "00000",
  name: "Test",
  state: "VA",
  ordinance: fact("Test ordinance"),
  zoning: fact(false),
  ruralDistrict: fact(null),
  minLotAc: fact(2),
  frontageFt: fact(200),
  exceptions: [fact("Family division")],
  review: fact("Staff"),
  exemptOverAc: fact(null),
  discharge: fact(null),
  zoningLayer: null,
  notes: [],
  ...over,
});
const input = (over: Partial<DivideInput>): DivideInput => ({
  acres: 10,
  publicFrontageFt: 1000,
  slopePct: 10,
  county: county(),
  district: null,
  ...over,
});

describe("Divide", () => {
  it("frontage-limited: 30 ac but 600 ft of road at 200 ft per lot is 3 lots, the frontage named", () => {
    const r = divide(input({ acres: 30, publicFrontageFt: 600 }));
    expect(r).toMatchObject({ kind: "lots", lots: 3, binding: "frontage", byAcres: 15, byFrontage: 3 });
    expect(divideHeadline(r)).toBe("Up to 3 lots: limited by 600 ft of road frontage at 200 ft per lot");
  });

  it("size-limited: 9.3 ac at a 2 ac minimum is 4 lots, though the frontage allows 10", () => {
    const r = divide(input({ acres: 9.3, publicFrontageFt: 2000 }));
    expect(r).toMatchObject({ kind: "lots", lots: 4, binding: "size", byAcres: 4, byFrontage: 10 });
    expect(divideHeadline(r)).toBe("Up to 4 lots: limited by 9.3 ac at a 2 ac minimum");
  });

  it("both at once, and one lot: the parcel as it is", () => {
    expect(divide(input({ acres: 6, publicFrontageFt: 600 }))).toMatchObject({ lots: 3, binding: "both" });
    const one = divide(input({ acres: 3, publicFrontageFt: 1000 }));
    expect(one).toMatchObject({ lots: 1, binding: "size" });
    expect(divideHeadline(one)).toBe("1 lot: limited by 3 ac at a 2 ac minimum");
    const noRoad = divide(input({ acres: 30, publicFrontageFt: 0 }));
    expect(noRoad).toMatchObject({ lots: 1, binding: "frontage", byFrontage: 0 });
    expect(divideHeadline(noRoad)).toBe("1 lot: limited by 0 ft of road frontage at 200 ft per lot");
  });

  it("no county zoning: the subdivision ordinance's minimum applies; nothing is assumed", () => {
    const r = divide(input({ acres: 30, publicFrontageFt: 5000 }));
    expect(r).toMatchObject({ lots: 15, assumedDefault: false });
  });

  it("county zoning without a map reading: the rural default is assumed, and said", () => {
    const zoned = county({ zoning: fact(true), ruralDistrict: fact("RF") });
    expect(divide(input({ county: zoned }))).toMatchObject({ assumedDefault: true });
    expect(divide(input({ county: zoned, district: "RF" }))).toMatchObject({ assumedDefault: false });
  });

  it("no frontage rule (or no frontage measured): the size alone decides", () => {
    const r = divide(input({ acres: 9, county: county({ frontageFt: fact(null) }) }));
    expect(r).toMatchObject({ lots: 4, binding: "size", byFrontage: null });
    expect(divide(input({ acres: 9, publicFrontageFt: null }))).toMatchObject({ lots: 4, binding: "size" });
  });

  it("no minimum lot size we could read: unknown, with the county named; outside the counties: not covered", () => {
    const none = county({ name: "Johnson", minLotAc: fact(null) });
    const r = divide(input({ county: none }));
    expect(r.kind).toBe("unknown");
    expect(divideHeadline(r)).toBe("Johnson County's minimum lot size isn't online: ask the county");
    expect(divide(input({ county: null }))).toEqual({ kind: "notCovered" });
    expect(divideHeadline({ kind: "notCovered" })).toBe("Not covered here yet");
  });

  it("Mitchell's minimum by slope: 1 ac to 15%, 1.5 ac to 25%, 2 ac to 35%, none over", () => {
    const mitchell = countyByFips("37121")!;
    const at = (slopePct: number) =>
      divide(input({ acres: 6, publicFrontageFt: null, slopePct, county: mitchell }));
    expect(at(10)).toMatchObject({ lots: 6, minLotAc: 1 });
    expect(at(20)).toMatchObject({ lots: 4, minLotAc: 1.5 });
    expect(at(30)).toMatchObject({ lots: 3, minLotAc: 2 });
    expect(at(40).kind).toBe("unknown");
  });

  it("exceptions are listed by the county, never counted", () => {
    const r = divide(input({ acres: 3 }));
    expect(r).toMatchObject({ lots: 1 });
    if (r.kind === "lots") expect(r.county.exceptions.map((e) => e.value)).toEqual(["Family division"]);
  });
});

describe("the county rules", () => {
  it("the ten counties of the brief, each once", () => {
    expect(COUNTIES.map((c) => `${c.name} ${c.state}`)).toEqual([
      "Floyd VA",
      "Grayson VA",
      "Carroll VA",
      "Patrick VA",
      "Ashe NC",
      "Alleghany NC",
      "Avery NC",
      "Mitchell NC",
      "Carter TN",
      "Johnson TN",
    ]);
    expect(new Set(COUNTIES.map((c) => c.fips)).size).toBe(10);
  });

  it("every fact has a source, a date and a confidence word; a missing number says so", () => {
    for (const c of COUNTIES) {
      const facts = [
        c.ordinance,
        c.zoning,
        c.ruralDistrict,
        c.minLotAc,
        c.frontageFt,
        c.review,
        c.exemptOverAc,
        c.discharge,
        ...c.exceptions,
      ];
      for (const f of facts) {
        expect(f.source, c.name).toMatch(/^https:\/\//);
        expect(f.checked, c.name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(["from the ordinance", "from the county's summary", "to confirm"], c.name).toContain(
          f.confidence,
        );
        expect(f.says.length, `${c.name}: ${String(f.value)}`).toBeGreaterThan(0);
      }
      // A number the ordinance doesn't give is null, never guessed, and its fact is to confirm.
      for (const f of [c.minLotAc, c.frontageFt])
        if (f.value === null) expect(f.confidence).toBe("to confirm");
    }
  });

  it("a zoning layer only where the county has zoning; Grayson's is the one found", () => {
    for (const c of COUNTIES) if (c.zoningLayer) expect(c.zoning.value, c.name).toBe(true);
    expect(COUNTIES.filter((c) => c.zoningLayer).map((c) => c.name)).toEqual(["Grayson"]);
  });
});
