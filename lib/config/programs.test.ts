import { describe, expect, it } from "vitest";
import { COUNTIES } from "./counties";
import { COUNTY_PAY } from "./countyPay";
import {
  BREAK_EVEN_DEFAULTS,
  CARBON_PROGRAMS,
  FEDERAL_EASEMENT,
  HUNTING_LEASE,
  PAY_THRESHOLDS,
  STATE_CAMPGROUND,
  STATE_EASEMENT,
  STATE_USE_VALUE,
  TIMBER_CRUISE,
  type Sourced,
} from "./programs";

const isSourced = (x: unknown): x is Sourced<unknown> =>
  !!x && typeof x === "object" && "says" in x && "source" in x && "confidence" in x;

/** Every Sourced fact anywhere inside the config. */
function facts(x: unknown, out: Sourced<unknown>[] = []): Sourced<unknown>[] {
  if (isSourced(x)) out.push(x);
  else if (Array.isArray(x)) x.forEach((v) => facts(v, out));
  else if (x && typeof x === "object") Object.values(x).forEach((v) => facts(v, out));
  return out;
}

const ALL = facts([
  STATE_EASEMENT,
  FEDERAL_EASEMENT,
  STATE_USE_VALUE,
  CARBON_PROGRAMS,
  HUNTING_LEASE,
  PAY_THRESHOLDS,
  BREAK_EVEN_DEFAULTS,
  TIMBER_CRUISE,
  STATE_CAMPGROUND,
  COUNTY_PAY,
]);

describe("how it could pay's config (step 15, plan §3)", () => {
  it("every fact has a source, its date, the date checked and a confidence word", () => {
    expect(ALL.length).toBeGreaterThan(60);
    for (const f of ALL) {
      expect(f.says.length, f.says).toBeGreaterThan(0);
      if (f.kind !== "ours") expect(f.source, f.says).toMatch(/^https:\/\//);
      expect(f.asOf.length, f.says).toBeGreaterThan(0);
      expect(f.checked, f.says).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(
        ["from the statute", "from the agency", "from the program", "from the county", "to confirm", "ours"],
        f.says,
      ).toContain(f.confidence);
    }
  });

  it("a figure of the app's own says so, and nothing else is ours", () => {
    for (const f of ALL) expect(f.kind === "ours", f.says).toBe(f.confidence === "ours");
    for (const f of ALL.filter((x) => x.kind === "ours")) expect(f.says).toMatch(/\((ours|assumed)[;)]/);
  });

  it("nothing read only in an excerpt or from a third party claims more than to confirm (plan §1)", () => {
    // PR 1's session couldn't open the official hosts: every sourced figure is to confirm until a page is read.
    for (const f of ALL.filter((x) => x.kind !== "ours")) expect(f.confidence, f.says).toBe("to confirm");
  });

  it("a number no source gives is null, never guessed", () => {
    const pay = COUNTY_PAY.find((c) => c.fips === "47091")!;
    expect(pay.taxPer100.value).toBeNull();
    expect(STATE_USE_VALUE.TN.forestPerAc.value).toBeNull();
  });

  it("covers exactly the ten counties of counties.ts", () => {
    expect(COUNTY_PAY.map((c) => c.fips).sort()).toEqual(COUNTIES.map((c) => c.fips).sort());
  });

  it("each state has its use-value program and its easement rules; Tennessee has no credit and says so", () => {
    for (const s of ["VA", "NC", "TN"] as const) {
      expect(STATE_USE_VALUE[s].state).toBe(s);
      expect(STATE_EASEMENT[s].state).toBe(s);
      expect(!!STATE_EASEMENT[s].credit !== !!STATE_EASEMENT[s].noCredit, s).toBe(true);
    }
    expect(STATE_EASEMENT.TN.credit).toBeNull();
    expect(STATE_EASEMENT.TN.noCredit?.value).toBe("No state credit");
    expect(STATE_EASEMENT.VA.credit?.ratePct.value).toBe(40);
  });

  it("ranges run low to high", () => {
    const ranges = [
      HUNTING_LEASE.value,
      STATE_USE_VALUE.NC.forestPerAc.value!,
      ...COUNTY_PAY.map((c) => c.forestPerAc.value).filter((r) => r !== null),
    ];
    for (const r of ranges) expect(r.low).toBeLessThanOrEqual(r.high);
  });
});
