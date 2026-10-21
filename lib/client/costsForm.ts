/**
 * Settings → Costs (step 10 plan §1, §7): each rate's low and high as typed, the paving switch and threshold (owner,
 * #255 review), and their check. A rate is a number ≥ 0 each, and low ≤ high; the threshold a number within
 * PAVING_PCT. A bad field is named with its reason and nothing is saved, as the rest of Settings does.
 */
import { COST_RATES, PAVING_PCT, type CostKey, type CostSettings, type Rates } from "@/lib/config/costs";
import type { FieldError } from "./settingsForm";

export interface CostForm {
  rates: Record<CostKey, { low: string; high: string }>;
  paving: { on: boolean; abovePct: string };
}

export const toCostForm = (s: CostSettings): CostForm => ({
  rates: Object.fromEntries(
    COST_RATES.map((r) => [r.key, { low: String(s.rates[r.key].low), high: String(s.rates[r.key].high) }]),
  ) as CostForm["rates"],
  paving: { on: s.paving.on, abovePct: String(s.paving.abovePct) },
});

/** "12,000" or "$12,000" reads as 12000. */
const parse = (s: string): number | null => {
  const t = s.replace(/[$,%\s]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** The paving switch's words (owner, #255 review): "Pave stretches steeper than [12]%". */
export const PAVING_LABEL = "Pave stretches steeper than";

export type CostFormResult = { ok: true; settings: CostSettings } | { ok: false; errors: FieldError[] };

export function fromCostForm(form: CostForm): CostFormResult {
  const errors: FieldError[] = [];
  const rates = {} as Rates;
  for (const r of COST_RATES) {
    const low = parse(form.rates[r.key].low);
    const high = parse(form.rates[r.key].high);
    const bad = (end: "low" | "high", reason: string) =>
      errors.push({ id: `cost.${r.key}.${end}`, label: `${r.label} (${end})`, reason });
    if (low === null || low < 0) bad("low", "must be a number, 0 or more");
    if (high === null || high < 0) bad("high", "must be a number, 0 or more");
    if (low !== null && high !== null && low >= 0 && high >= 0 && low > high)
      bad("low", "must not be more than the high");
    rates[r.key] = { low: low ?? 0, high: high ?? 0 };
  }
  const pct = parse(form.paving.abovePct);
  if (pct === null || pct < PAVING_PCT.min || pct > PAVING_PCT.max)
    errors.push({
      id: "cost.paving",
      label: `${PAVING_LABEL} …%`,
      reason: `must be a number from ${PAVING_PCT.min} to ${PAVING_PCT.max}`,
    });
  return errors.length
    ? { ok: false, errors }
    : { ok: true, settings: { rates, paving: { on: form.paving.on, abovePct: pct! } } };
}

/** The same settings: every rate, low and high, and the paving choice. */
export const sameSettings = (a: CostSettings, b: CostSettings): boolean =>
  COST_RATES.every(
    (r) => a.rates[r.key].low === b.rates[r.key].low && a.rates[r.key].high === b.rates[r.key].high,
  ) &&
  a.paving.on === b.paving.on &&
  a.paving.abovePct === b.paving.abovePct;
