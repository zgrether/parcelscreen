import { describe, expect, it } from "vitest";
import { COST_GROUPS, COST_RATES, COSTS_CHECKED, DEFAULT_RATES, rateOf } from "./costs";

describe("the published cost rates (step 10 plan §1)", () => {
  it("has each key once, in a known group", () => {
    const keys = COST_RATES.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    const groups = new Set(COST_GROUPS.map((g) => g.id));
    for (const r of COST_RATES) expect(groups.has(r.group), r.key).toBe(true);
    // Every group has a rate, so Settings shows no empty heading.
    for (const g of COST_GROUPS)
      expect(
        COST_RATES.some((r) => r.group === g.id),
        g.id,
      ).toBe(true);
  });

  it("gives every rate a range with low ≤ high, both ≥ 0", () => {
    for (const r of COST_RATES) {
      expect(r.low, r.key).toBeGreaterThanOrEqual(0);
      expect(r.low, r.key).toBeLessThanOrEqual(r.high);
    }
  });

  it("gives every rate a label, a unit, a note and at least one dated source with a link", () => {
    for (const r of COST_RATES) {
      expect(r.label, r.key).not.toBe("");
      expect(r.unit, r.key).not.toBe("");
      expect(r.note, r.key).not.toBe("");
      expect(r.sources.length, r.key).toBeGreaterThan(0);
      for (const s of r.sources) {
        expect(s.name, r.key).not.toBe("");
        expect(s.url, r.key).toMatch(/^https:\/\//);
        expect(s.date, r.key).not.toBe("");
        expect(s.where, r.key).not.toBe("");
      }
    }
    expect(COSTS_CHECKED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("holds the plan's table (rule 4: a change here is a declared numbers change)", () => {
    expect(DEFAULT_RATES).toMatchInlineSnapshot(`
      {
        "clearing": {
          "high": 8500,
          "low": 2500,
        },
        "culvert": {
          "high": 6000,
          "low": 1200,
        },
        "driveway.new": {
          "high": 84,
          "low": 24,
        },
        "driveway.paving": {
          "high": 84,
          "low": 30,
        },
        "driveway.upgrade.improved": {
          "high": 12,
          "low": 5,
        },
        "driveway.upgrade.pioneer": {
          "high": 25,
          "low": 14,
        },
        "driveway.upgrade.uncleared": {
          "high": 84,
          "low": 21,
        },
        "easement.legal": {
          "high": 11000,
          "low": 3200,
        },
        "pad.flat": {
          "high": 11000,
          "low": 6500,
        },
        "pad.sloped": {
          "high": 18000,
          "low": 11000,
        },
        "pad.steep": {
          "high": 35000,
          "low": 18000,
        },
        "power.hookup": {
          "high": 2500,
          "low": 575,
        },
        "power.perFt": {
          "high": 15,
          "low": 0,
        },
        "septic.alternative": {
          "high": 55000,
          "low": 15000,
        },
        "septic.conventional": {
          "high": 15000,
          "low": 3500,
        },
        "septic.modified": {
          "high": 20000,
          "low": 7000,
        },
        "track.pioneer": {
          "high": 18,
          "low": 5,
        },
        "well.depthFt": {
          "high": 400,
          "low": 150,
        },
        "well.perFt": {
          "high": 80,
          "low": 30,
        },
        "well.pump": {
          "high": 2500,
          "low": 400,
        },
      }
    `);
  });

  it("finds a rate by its key", () => {
    expect(rateOf("well.depthFt").unit).toBe("ft");
  });
});
