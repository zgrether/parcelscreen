/**
 * Settings → Costs (step 10 plan §1, §7): each rate's low and high as typed, and their check. A number ≥ 0 each, and
 * low ≤ high; a bad field is named with its reason and nothing is saved, as the rest of Settings does.
 */
import { COST_RATES, type CostKey, type Rates } from "@/lib/config/costs";
import type { FieldError } from "./settingsForm";

export type CostForm = Record<CostKey, { low: string; high: string }>;

export const toCostForm = (rates: Rates): CostForm =>
  Object.fromEntries(
    COST_RATES.map((r) => [r.key, { low: String(rates[r.key].low), high: String(rates[r.key].high) }]),
  ) as CostForm;

/** "12,000" or "$12,000" reads as 12000. */
const parse = (s: string): number | null => {
  const t = s.replace(/[$,\s]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export type CostFormResult = { ok: true; rates: Rates } | { ok: false; errors: FieldError[] };

export function fromCostForm(form: CostForm): CostFormResult {
  const errors: FieldError[] = [];
  const rates = {} as Rates;
  for (const r of COST_RATES) {
    const low = parse(form[r.key].low);
    const high = parse(form[r.key].high);
    const bad = (end: "low" | "high", reason: string) =>
      errors.push({ id: `cost.${r.key}.${end}`, label: `${r.label} (${end})`, reason });
    if (low === null || low < 0) bad("low", "must be a number, 0 or more");
    if (high === null || high < 0) bad("high", "must be a number, 0 or more");
    if (low !== null && high !== null && low >= 0 && high >= 0 && low > high)
      bad("low", "must not be more than the high");
    rates[r.key] = { low: low ?? 0, high: high ?? 0 };
  }
  return errors.length ? { ok: false, errors } : { ok: true, rates };
}

/** The same rates, low and high, for every key. */
export const sameRates = (a: Rates, b: Rates): boolean =>
  COST_RATES.every((r) => a[r.key].low === b[r.key].low && a[r.key].high === b[r.key].high);
