/**
 * The cost to enjoy's settings as this profile uses them (step 10 plan §1): the published rates (lib/config/costs.ts)
 * with the profile's edits from Settings → Costs over them, and the paving choice (owner, #255 review). The edits are
 * kept under "ps.costs" in the profile's documents, synced with the profile as "ps.cfg" is: the rates that differ from
 * the defaults, and `paving` when it differs. They're never a run's input, so an edit never asks for a re-grade; every
 * page that shows a cost reads them live.
 */
import { useSyncExternalStore } from "react";
import { z } from "zod";
import {
  COST_RATES,
  DEFAULT_COST_SETTINGS,
  DEFAULT_PAVING,
  DEFAULT_RATES,
  PAVING_PCT,
  type CostKey,
  type CostSettings,
  type Paving,
  type Rates,
} from "@/lib/config/costs";
import type { KeyValueStore } from "./prefs";
import { activeKv } from "./profileKv";

const KEY = "ps.costs";
/** Fired on this page when the settings change (a save, a reset). */
export const COST_RATES_CHANGED = "ps-cost-rates-changed";

const RangeSchema = z.strictObject({ low: z.number().finite().min(0), high: z.number().finite().min(0) });
const PavingSchema = z.strictObject({
  on: z.boolean(),
  abovePct: z.number().finite().min(PAVING_PCT.min).max(PAVING_PCT.max),
});
/**
 * The stored edits: the rates the person changed, by key, and the paving choice when it isn't the default. A document
 * that isn't this shape is ignored whole.
 */
const StoredSchema = z.strictObject({
  ...(Object.fromEntries(COST_RATES.map((r) => [r.key, RangeSchema.optional()])) as Record<
    CostKey,
    z.ZodOptional<typeof RangeSchema>
  >),
  paving: PavingSchema.optional(),
});
export interface CostOverrides {
  rates: Partial<Rates>;
  paving?: Paving;
}

/** The edits kept for this profile; none when unreadable. */
export function loadCostOverrides(from: KeyValueStore | null = activeKv()): CostOverrides {
  try {
    const raw = from?.getItem(KEY);
    if (!raw) return { rates: {} };
    const parsed = StoredSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return { rates: {} };
    const { paving, ...rates } = parsed.data;
    return {
      // A range kept upside down is ignored rather than trusted.
      rates: Object.fromEntries(
        Object.entries(rates).filter(
          (e): e is [string, { low: number; high: number }] => !!e[1] && e[1].low <= e[1].high,
        ),
      ) as Partial<Rates>,
      ...(paving ? { paving } : {}),
    };
  } catch {
    return { rates: {} };
  }
}

/** The settings in use: the defaults with this profile's edits over them. */
export const settingsWith = (o: CostOverrides): CostSettings => ({
  rates: { ...DEFAULT_RATES, ...o.rates },
  paving: o.paving ?? DEFAULT_PAVING,
});

/** Keeps only what differs from the defaults, and tells the open page. */
export function saveCostSettings(s: CostSettings, to: KeyValueStore | null = activeKv()): void {
  const changed = Object.fromEntries(
    (Object.keys(s.rates) as CostKey[])
      .filter((k) => s.rates[k].low !== DEFAULT_RATES[k].low || s.rates[k].high !== DEFAULT_RATES[k].high)
      .map((k) => [k, s.rates[k]]),
  );
  const paving =
    s.paving.on !== DEFAULT_PAVING.on || s.paving.abovePct !== DEFAULT_PAVING.abovePct
      ? { paving: s.paving }
      : {};
  try {
    // An empty set rather than a removal, so a reset reaches the profile's other devices too.
    to?.setItem(KEY, JSON.stringify({ ...changed, ...paving }));
  } catch {
    /* storage unavailable: the settings last for this page only */
  }
  cached = null;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(COST_RATES_CHANGED));
}

let cached: { raw: string | null; settings: CostSettings } | null = null;
/** The settings in use, the same object until they change (for useSyncExternalStore). */
export function currentCostSettings(): CostSettings {
  const raw = (() => {
    try {
      return activeKv()?.getItem(KEY) ?? null;
    } catch {
      return null;
    }
  })();
  if (!cached || cached.raw !== raw) cached = { raw, settings: settingsWith(loadCostOverrides()) };
  return cached.settings;
}

const subscribe = (changed: () => void) => {
  window.addEventListener(COST_RATES_CHANGED, changed);
  return () => window.removeEventListener(COST_RATES_CHANGED, changed);
};

/** The settings in use, live: a page re-renders when they're saved or reset. */
export const useCostSettings = (): CostSettings =>
  useSyncExternalStore(subscribe, currentCostSettings, () => DEFAULT_COST_SETTINGS);
