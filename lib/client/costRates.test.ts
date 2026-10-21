import { describe, expect, it } from "vitest";
import { DEFAULT_RATES } from "@/lib/config/costs";
import { loadCostOverrides, ratesWith, saveCostRates } from "./costRates";
import { fromCostForm, sameRates, toCostForm } from "./costsForm";
import type { KeyValueStore } from "./prefs";

const memory = (init: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } => {
  const data = { ...init };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
};

describe("the profile's cost overrides (ps.costs)", () => {
  it("has none at first: the rates are the defaults", () => {
    const kv = memory();
    expect(loadCostOverrides(kv)).toEqual({});
    expect(ratesWith(loadCostOverrides(kv))).toEqual(DEFAULT_RATES);
  });

  it("keeps only the changed rates, and merges them over the defaults", () => {
    const kv = memory();
    saveCostRates({ ...DEFAULT_RATES, clearing: { low: 3000, high: 9000 } }, kv);
    expect(JSON.parse(kv.data["ps.costs"] ?? "")).toEqual({ clearing: { low: 3000, high: 9000 } });
    const rates = ratesWith(loadCostOverrides(kv));
    expect(rates.clearing).toEqual({ low: 3000, high: 9000 });
    expect(rates.culvert).toEqual(DEFAULT_RATES.culvert);
  });

  it("writes an empty set on a reset, so the reset syncs", () => {
    const kv = memory({ "ps.costs": JSON.stringify({ clearing: { low: 1, high: 2 } }) });
    saveCostRates(DEFAULT_RATES, kv);
    expect(kv.data["ps.costs"]).toBe("{}");
    expect(loadCostOverrides(kv)).toEqual({});
  });

  it("ignores unknown keys, upside-down ranges and unreadable text", () => {
    expect(loadCostOverrides(memory({ "ps.costs": "not json" }))).toEqual({});
    expect(loadCostOverrides(memory({ "ps.costs": JSON.stringify({ nope: { low: 1, high: 2 } }) }))).toEqual(
      {},
    );
    expect(
      loadCostOverrides(
        memory({
          "ps.costs": JSON.stringify({ clearing: { low: 9, high: 2 }, culvert: { low: 100, high: 200 } }),
        }),
      ),
    ).toEqual({ culvert: { low: 100, high: 200 } });
  });
});

describe("Settings → Costs' form", () => {
  it("round-trips the rates", () => {
    const r = fromCostForm(toCostForm(DEFAULT_RATES));
    expect(r.ok && sameRates(r.rates, DEFAULT_RATES)).toBe(true);
  });

  it("reads $ and thousands separators", () => {
    const form = toCostForm(DEFAULT_RATES);
    form.clearing = { low: "$3,000", high: " 9,500 " };
    const r = fromCostForm(form);
    expect(r.ok && r.rates.clearing).toEqual({ low: 3000, high: 9500 });
  });

  it("names a blank, a negative and a low above the high, and returns no rates", () => {
    const form = toCostForm(DEFAULT_RATES);
    form.clearing = { low: "", high: "9000" };
    form.culvert = { low: "-1", high: "10" };
    form["well.pump"] = { low: "3000", high: "2000" };
    const r = fromCostForm(form);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.map((e) => [e.id, e.reason])).toEqual([
      ["cost.culvert.low", "must be a number, 0 or more"],
      ["cost.well.pump.low", "must not be more than the high"],
      ["cost.clearing.low", "must be a number, 0 or more"],
    ]);
    expect(r.errors[0]?.label).toBe("Driveway culvert, installed (low)");
  });
});
