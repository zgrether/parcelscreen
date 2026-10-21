/**
 * The cost to enjoy's rates as this profile uses them (step 10 plan §1): the published defaults
 * (lib/config/costs.ts) with the profile's edits from Settings → Costs over them. The edits are kept as overrides under
 * "ps.costs" in the profile's documents, synced with the profile as "ps.cfg" is. They're never a run's input, so editing
 * a rate never asks for a re-grade; every page that shows a cost reads them live.
 */
import { useSyncExternalStore } from "react";
import { z } from "zod";
import { COST_RATES, DEFAULT_RATES, type CostKey, type Rates } from "@/lib/config/costs";
import type { KeyValueStore } from "./prefs";
import { activeKv } from "./profileKv";

const KEY = "ps.costs";
/** Fired on this page when the rates change (a save, a reset). */
export const COST_RATES_CHANGED = "ps-cost-rates-changed";

const KEYS = COST_RATES.map((r) => r.key) as [CostKey, ...CostKey[]];
const RangeSchema = z.strictObject({ low: z.number().finite().min(0), high: z.number().finite().min(0) });
/** The stored overrides: only the rates the person changed. A document that isn't this shape is ignored whole. */
const OverridesSchema = z.partialRecord(z.enum(KEYS), RangeSchema);
export type CostOverrides = Partial<Rates>;

/** The overrides kept for this profile; none when unreadable. */
export function loadCostOverrides(from: KeyValueStore | null = activeKv()): CostOverrides {
  try {
    const raw = from?.getItem(KEY);
    if (!raw) return {};
    const parsed = OverridesSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return {};
    // A range kept upside down is ignored rather than trusted.
    return Object.fromEntries(
      Object.entries(parsed.data).filter(([, r]) => r.low <= r.high),
    ) as CostOverrides;
  } catch {
    return {};
  }
}

/** The rates in use: the defaults with this profile's overrides over them. */
export const ratesWith = (o: CostOverrides): Rates => ({ ...DEFAULT_RATES, ...o });

/** Keeps only the rates that differ from the defaults, and tells the open page. */
export function saveCostRates(rates: Rates, to: KeyValueStore | null = activeKv()): void {
  const changed = Object.fromEntries(
    (Object.keys(rates) as CostKey[])
      .filter((k) => rates[k].low !== DEFAULT_RATES[k].low || rates[k].high !== DEFAULT_RATES[k].high)
      .map((k) => [k, rates[k]]),
  );
  try {
    // An empty set rather than a removal, so a reset reaches the profile's other devices too.
    to?.setItem(KEY, JSON.stringify(changed));
  } catch {
    /* storage unavailable: the rates last for this page only */
  }
  cached = null;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(COST_RATES_CHANGED));
}

let cached: { raw: string | null; rates: Rates } | null = null;
/** The rates in use, the same object until they change (for useSyncExternalStore). */
export function currentCostRates(): Rates {
  const raw = (() => {
    try {
      return activeKv()?.getItem(KEY) ?? null;
    } catch {
      return null;
    }
  })();
  if (!cached || cached.raw !== raw) cached = { raw, rates: ratesWith(loadCostOverrides()) };
  return cached.rates;
}

const subscribe = (changed: () => void) => {
  window.addEventListener(COST_RATES_CHANGED, changed);
  return () => window.removeEventListener(COST_RATES_CHANGED, changed);
};

/** The rates in use, live: a page re-renders when they're saved or reset. */
export const useCostRates = (): Rates =>
  useSyncExternalStore(subscribe, currentCostRates, () => DEFAULT_RATES);
