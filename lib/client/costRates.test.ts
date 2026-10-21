import { describe, expect, it } from "vitest";
import { DEFAULT_COST_SETTINGS, DEFAULT_PAVING, DEFAULT_RATES } from "@/lib/config/costs";
import { loadCostOverrides, saveCostSettings, settingsWith } from "./costRates";
import { fromCostForm, sameSettings, toCostForm } from "./costsForm";
import type { KeyValueStore } from "./prefs";

const memory = (init: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } => {
  const data = { ...init };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
};
const load = (kv: KeyValueStore) => settingsWith(loadCostOverrides(kv));

describe("the profile's cost settings (ps.costs)", () => {
  it("has none at first: the defaults, paving on above 12%", () => {
    expect(load(memory())).toEqual(DEFAULT_COST_SETTINGS);
    expect(DEFAULT_PAVING).toEqual({ on: true, abovePct: 12 });
  });

  it("keeps only what changed, and merges it over the defaults", () => {
    const kv = memory();
    saveCostSettings(
      { rates: { ...DEFAULT_RATES, clearing: { low: 3000, high: 9000 } }, paving: DEFAULT_PAVING },
      kv,
    );
    expect(JSON.parse(kv.data["ps.costs"] ?? "")).toEqual({ clearing: { low: 3000, high: 9000 } });
    const s = load(kv);
    expect(s.rates.clearing).toEqual({ low: 3000, high: 9000 });
    expect(s.rates.culvert).toEqual(DEFAULT_RATES.culvert);
    expect(s.paving).toEqual(DEFAULT_PAVING);
  });

  it("keeps the paving choice when it isn't the default (owner, #255 review)", () => {
    const kv = memory();
    saveCostSettings({ rates: DEFAULT_RATES, paving: { on: false, abovePct: 15 } }, kv);
    expect(JSON.parse(kv.data["ps.costs"] ?? "")).toEqual({ paving: { on: false, abovePct: 15 } });
    expect(load(kv).paving).toEqual({ on: false, abovePct: 15 });
  });

  it("writes an empty set on a reset, so the reset syncs", () => {
    const kv = memory({
      "ps.costs": JSON.stringify({ clearing: { low: 1, high: 2 }, paving: { on: false, abovePct: 12 } }),
    });
    saveCostSettings(DEFAULT_COST_SETTINGS, kv);
    expect(kv.data["ps.costs"]).toBe("{}");
    expect(load(kv)).toEqual(DEFAULT_COST_SETTINGS);
  });

  it("ignores unknown keys, upside-down ranges, a threshold out of range and unreadable text", () => {
    expect(loadCostOverrides(memory({ "ps.costs": "not json" }))).toEqual({ rates: {} });
    expect(loadCostOverrides(memory({ "ps.costs": JSON.stringify({ nope: { low: 1, high: 2 } }) }))).toEqual({
      rates: {},
    });
    expect(
      loadCostOverrides(memory({ "ps.costs": JSON.stringify({ paving: { on: true, abovePct: 90 } }) })),
    ).toEqual({ rates: {} });
    expect(
      loadCostOverrides(
        memory({
          "ps.costs": JSON.stringify({ clearing: { low: 9, high: 2 }, culvert: { low: 100, high: 200 } }),
        }),
      ),
    ).toEqual({ rates: { culvert: { low: 100, high: 200 } } });
  });
});

describe("Settings → Costs' form", () => {
  it("round-trips the settings", () => {
    const r = fromCostForm(toCostForm(DEFAULT_COST_SETTINGS));
    expect(r.ok && sameSettings(r.settings, DEFAULT_COST_SETTINGS)).toBe(true);
  });

  it("reads $ and thousands separators, and the paving switch and threshold", () => {
    const form = toCostForm(DEFAULT_COST_SETTINGS);
    form.rates.clearing = { low: "$3,000", high: " 9,500 " };
    form.paving = { on: false, abovePct: "15%" };
    const r = fromCostForm(form);
    expect(r.ok && r.settings.rates.clearing).toEqual({ low: 3000, high: 9500 });
    expect(r.ok && r.settings.paving).toEqual({ on: false, abovePct: 15 });
  });

  it("names a blank, a negative, a low above the high and a threshold out of range, and returns nothing", () => {
    const form = toCostForm(DEFAULT_COST_SETTINGS);
    form.rates.clearing = { low: "", high: "9000" };
    form.rates.culvert = { low: "-1", high: "10" };
    form.rates["well.pump"] = { low: "3000", high: "2000" };
    form.paving.abovePct = "40";
    const r = fromCostForm(form);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.map((e) => [e.id, e.reason])).toEqual([
      ["cost.culvert.low", "must be a number, 0 or more"],
      ["cost.well.pump.low", "must not be more than the high"],
      ["cost.clearing.low", "must be a number, 0 or more"],
      ["cost.paving", "must be a number from 5 to 25"],
    ]);
    expect(r.errors[0]?.label).toBe("Driveway culvert, installed (low)");
  });
});
