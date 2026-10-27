/**
 * Use-value taxation (step 15 §2.2): Virginia's land use assessment, North Carolina's Present-Use Value, Tennessee's
 * Greenbelt. Eligible when the county's program takes forest land and the parcel's forest reaches the minimum; the
 * number is today's tax beside the use-value tax where the county's rate and use values are published. Pure.
 */
import { countyPayOf } from "../config/countyPay";
import { STATE_USE_VALUE, type StateUseValue } from "../config/programs";
import { MISSING } from "../uses/words";
import type { Fact } from "../uses/types";
import { factOf, forestAcOf, whereOf } from "./common";
import type { PayInput, PayLine, PayOption } from "./types";
import { NUMBER, PAY_ASK, PAY_COST, PAY_NAME, REASON, SIGNAL } from "./words";

export interface ProgramTaxInput {
  /** The value the tax is figured on: the assessment, or the asking price as its stand-in. */
  value: number;
  acres: number;
  forestAc: number;
  /** The forest use value, $/ac, low–high by class. */
  perAc: { low: number; high: number };
  /** Assessed value as a share of appraised (TN 0.25; VA and NC 1). */
  assessedShare: number;
  per100: number;
}

/**
 * Today's tax and the use-value tax, low–high: the forest acres at their use value, the rest of the land at its share of
 * the value. Both on the assessed share, at the rate per $100.
 */
export function programTax(i: ProgramTaxInput): { today: number; low: number; high: number } {
  const tax = (v: number) => (v * i.assessedShare * i.per100) / 100;
  const forestShare = i.acres > 0 ? Math.min(1, i.forestAc / i.acres) : 0;
  const rest = i.value * (1 - forestShare);
  return {
    today: tax(i.value),
    low: tax(i.forestAc * i.perAc.low + rest),
    high: tax(i.forestAc * i.perAc.high + rest),
  };
}

export function landUseTax({ uses, listing }: PayInput): PayOption {
  const r = uses.result;
  const where = whereOf(r);
  const forestAc = forestAcOf(r);
  const program: StateUseValue | null = where?.state ? STATE_USE_VALUE[where.state] : null;
  const pay = r.county ? countyPayOf(r.county.fips) : null;

  const signals: Fact[] = [
    {
      label: SIGNAL.forest,
      value:
        r.cover && forestAc !== null
          ? SIGNAL.forestValue(r.cover.forestPct, forestAc)
          : MISSING.cover("forest share"),
    },
    ...(program ? [factOf(SIGNAL.minimum(program.forestMinAc.value), program.forestMinAc)] : []),
    ...(pay ? [factOf(SIGNAL.county, pay.forestUseValue)] : []),
    ...(program ? program.requirements.map((f) => factOf(f.value, f)) : []),
  ];
  const say = (eligibility: PayOption["eligibility"], reason: string): PayOption => ({
    key: "useValue",
    name: PAY_NAME.useValue,
    eligibility,
    reason,
    signals,
    number: numberLines(),
    cost: program ? `${PAY_COST.useValue}: ${program.rollback.says}` : PAY_COST.useValue,
    ask: PAY_ASK.useValue,
  });

  function numberLines(): PayLine[] {
    if (!program) return [];
    const lines: PayLine[] = [];
    const perAc = pay?.forestPerAc.value ?? program.forestPerAc.value;
    const perAcFact = pay?.forestPerAc.value ? pay.forestPerAc : program.forestPerAc;
    const rate = pay?.taxPer100.value ?? null;
    if (!pay) return [{ text: REASON.notCovered(where?.label ?? "this county") }];
    if (pay.forestUseValue.value === false) return [];
    if (rate === null)
      lines.push({
        text: NUMBER.notPublished,
        source: pay.taxPer100.source,
        asOf: pay.taxPer100.asOf,
        confidence: pay.taxPer100.confidence,
      });
    else
      lines.push({
        text: NUMBER.rate(pay.taxPer100.says, pay.taxPer100.asOf),
        source: pay.taxPer100.source,
        asOf: pay.taxPer100.asOf,
        confidence: pay.taxPer100.confidence,
      });
    if (!perAc) {
      lines.push({
        text: NUMBER.noValues,
        source: perAcFact.source,
        asOf: perAcFact.asOf,
        confidence: perAcFact.confidence,
      });
      return lines;
    }
    lines.push({
      text: NUMBER.perAc(perAc.low, perAc.high),
      source: perAcFact.source,
      asOf: perAcFact.asOf,
      confidence: perAcFact.confidence,
    });
    const value = listing.assessed?.value ?? listing.askingPrice;
    if (value === null || value === undefined) {
      lines.push({ text: NUMBER.typeAssessed });
      return lines;
    }
    if (rate === null || forestAc === null) return lines;
    const t = programTax({
      value,
      acres: r.acres,
      forestAc,
      perAc,
      assessedShare: program.assessedShare.value,
      per100: rate,
    });
    const on = listing.assessed ? NUMBER.onAssessed(listing.assessed.year) : NUMBER.onAsking;
    lines.push(
      { text: NUMBER.todayTax(t.today, on), firmness: "from county rates" },
      { text: NUMBER.programTax(t.low, t.high), firmness: "from county rates" },
    );
    return lines;
  }

  if (!where) return say("maybe", MISSING.county);
  if (!program) return say("maybe", REASON.state(r.county!.state));
  if (forestAc === null) return say("maybe", MISSING.cover("forest share"));
  const min = program.forestMinAc.value;
  if (!pay) {
    // Outside the ten counties: the state's rule, not the county's.
    return say(
      forestAc >= min ? "maybe" : "no",
      forestAc >= min ? REASON.notCovered(where.label) : REASON.uvSmall(forestAc, min),
    );
  }
  if (pay.forestUseValue.value === false) return say("no", REASON.uvNoProgram(pay.forestUseValue.says));
  if (forestAc < min) {
    const farm = program.farmMinAc.value;
    const open = r.cover ? (r.acres * r.cover.openPct) / 100 : 0;
    return open >= farm ? say("maybe", REASON.uvAsFarm(farm)) : say("no", REASON.uvSmall(forestAc, min));
  }
  if (pay.forestUseValue.value === null) return say("maybe", pay.forestUseValue.says);
  // North Carolina's ownership years and plan can't be seen from the screen (§2.2).
  if (where.state === "NC")
    return say(
      "maybe",
      REASON.uvRequirements(
        program.requirements.map((f) => f.value.charAt(0).toLowerCase() + f.value.slice(1)).join(" and "),
      ),
    );
  return say("eligible", REASON.uvEligible(forestAc, program.name));
}
