/**
 * How it could pay (step 15, docs/plans/step-15-how-it-could-pay.md §2): every option's answer, in the panel's order.
 * Display time only: it reads the result, Panel 1's answers and the listing, and nothing reads it back (§1).
 */
import { easement } from "./easement";
import { campSites, carbon, lease, splitResell, timber } from "./others";
import type { PayInput, PayKey, PayOption } from "./types";
import { landUseTax } from "./landUseTax";

export type {
  Eligibility,
  PayInput,
  PayKey,
  PayLine,
  PayListing,
  PayOption,
  ScenarioBreakEven,
} from "./types";

const OPTIONS: readonly [PayKey, (input: PayInput) => PayOption][] = [
  ["easement", easement],
  ["useValue", landUseTax],
  ["carbon", carbon],
  ["lease", lease],
  ["timber", timber],
  ["split", splitResell],
  ["camp", campSites],
];

/** The options in the panel's order (the loading rows name them before the answers come). */
export const PAY_ORDER: readonly PayKey[] = OPTIONS.map(([key]) => key);

/** Not eligible says why, what it would cost and whom to ask, but no number: there's nothing to price (§1). */
export const howItCouldPay = (input: PayInput): PayOption[] =>
  OPTIONS.map(([, option]) => option(input)).map((o) =>
    o.eligibility === "no" ? { ...o, number: [], slider: undefined } : o,
  );
