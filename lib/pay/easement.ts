/**
 * Conservation easement (step 15 §2.1, as PR 1's research changed it, §0b): eligibility from the lots you could give up
 * and the conservation values a land trust looks for (public land or the Parkway within a mile, streams, forest on 50 ac
 * or more). The number is the state's credit as a formula (Virginia's with its slider), or "No state credit", and the
 * federal deduction in one line; never a figure without an appraised value. Pure.
 */
import { FEDERAL_EASEMENT, PAY_THRESHOLDS, STATE_EASEMENT, type EasementCredit } from "../config/programs";
import { fmt } from "../format";
import { ANSWER_WORD, MISSING } from "../uses/words";
import type { Fact } from "../uses/types";
import { factOf, forestAcOf, publicNear, whereOf } from "./common";
import { sliderMax, SLIDER_STEP } from "./credit";
import type { PayInput, PayLine, PayOption } from "./types";
import { money, NUMBER, PAY_ASK, PAY_COST, PAY_NAME, REASON, SIGNAL } from "./words";

const T = PAY_THRESHOLDS;

/** The credit's lines: the formula, its cap, the yearly limit and carry-forward, transfer, end date. */
export function creditLines(c: EasementCredit): PayLine[] {
  const src = (f: { source: string; asOf: string; confidence: PayLine["confidence"] }) => ({
    source: f.source,
    asOf: f.asOf,
    confidence: f.confidence,
  });
  const lines: PayLine[] = [
    {
      text:
        NUMBER.formula(c.name, c.ratePct.value) +
        (c.maxCredit.value !== null ? NUMBER.capped(c.maxCredit.value) : "") +
        (c.donatedBy.value ? `, ${NUMBER.donatedBy(c.donatedBy.value)}` : ""),
      firmness: "set by law",
      ...src(c.ratePct),
    },
    { text: c.carryYears.says, ...src(c.carryYears) },
  ];
  if (c.yearlyUse.value !== null) lines.push({ text: c.yearlyUse.says, ...src(c.yearlyUse) });
  if (c.transfer.value) lines.push({ text: c.transfer.says, ...src(c.transfer) });
  for (const n of c.notes) lines.push({ text: n.says, ...src(n) });
  return lines;
}

const federalLine = (): PayLine => ({
  text: NUMBER.federal(
    FEDERAL_EASEMENT.agiPct.value,
    FEDERAL_EASEMENT.farmerPct.value,
    FEDERAL_EASEMENT.carryYears.value,
  ),
  firmness: "set by law",
  source: FEDERAL_EASEMENT.agiPct.source,
  asOf: FEDERAL_EASEMENT.agiPct.asOf,
  confidence: FEDERAL_EASEMENT.agiPct.confidence,
});

export function easement({ uses, land, listing }: PayInput): PayOption {
  const r = uses.result;
  const where = whereOf(r);
  // Divide's own answer (Panel 1): Yes or Maybe means there are lots to give up, and its reason says how many.
  const divide = land.uses.find((u) => u.key === "divide")!.answer;
  const near = publicNear(r, T.nearPublicMi.value);
  const forestAc = forestAcOf(r);
  const water = r.streams ? r.streams.perennialFt > 0 || r.streams.intermittentFt > 0 : undefined;
  const forested = r.cover ? r.cover.forestPct >= T.easementForestPct.value : undefined;
  const big = r.acres >= T.easementSmallAc.value;

  const signals: Fact[] = [
    { label: SIGNAL.acres, value: `${fmt(r.acres, 2)} ac` },
    {
      label: SIGNAL.lots,
      value: `${ANSWER_WORD[divide.answer]}: ${divide.reason}`,
    },
    {
      label: SIGNAL.publicLand,
      value:
        near === undefined
          ? MISSING.protected
          : near === null
            ? SIGNAL.none
            : SIGNAL.publicNear(near.name, near.adjoins ? SIGNAL.adjoins : SIGNAL.within(near.mi)),
    },
    {
      label: SIGNAL.water,
      value: r.streams ? SIGNAL.waterValue(r.streams.perennialFt, r.streams.intermittentFt) : MISSING.streams,
    },
    {
      label: SIGNAL.forest,
      value:
        r.cover && forestAc !== null
          ? SIGNAL.forestValue(r.cover.forestPct, forestAc)
          : MISSING.cover("forest share"),
    },
    // VOF's guideline is Virginia's own; elsewhere the threshold is ours, after it (the fresh-eyes review).
    where?.state === "VA" || !where
      ? factOf(SIGNAL.small, T.easementSmallAc)
      : { label: SIGNAL.small, value: SIGNAL.smallElsewhere },
  ];

  // The conservation values a land trust looks for; forest alone counts only on 50 ac or more (§0b).
  const values = [
    near ? SIGNAL.publicNear(near.name, near.adjoins ? SIGNAL.adjoins : SIGNAL.within(near.mi)) : null,
    water ? (r.streams!.perennialFt > 0 ? "a year-round stream" : "a seasonal stream") : null,
    forested && big ? "mostly forest" : null,
  ].filter((x): x is string => !!x);
  const lotsToGive = divide.answer !== "no";

  const missing =
    near === undefined
      ? MISSING.protected
      : water === undefined
        ? MISSING.streams
        : forested === undefined
          ? MISSING.cover("forest share")
          : null;
  const [eligibility, reason]: [PayOption["eligibility"], string] =
    lotsToGive && values.length
      ? ["eligible", REASON.easementEligible(values.join(", "))]
      : missing
        ? ["maybe", missing]
        : lotsToGive
          ? [
              "maybe",
              forested ? REASON.easementSmallForest(T.easementSmallAc.value) : REASON.easementLotsOnly,
            ]
          : values.length
            ? ["maybe", REASON.easementNoLots(values.join(", "), divide.reason)]
            : forested
              ? ["maybe", REASON.easementSmallForest(T.easementSmallAc.value)]
              : ["no", REASON.easementNone];

  const state = where?.state ? STATE_EASEMENT[where.state] : null;
  const number: PayLine[] = [{ text: NUMBER.appraisal }];
  if (!where?.state) number.push({ text: REASON.state(r.county?.state ?? "this state") });
  else if (state?.credit) number.push(...creditLines(state.credit));
  else if (state?.noCredit)
    number.push({
      text: NUMBER.noCredit,
      source: state.noCredit.source,
      asOf: state.noCredit.asOf,
      confidence: state.noCredit.confidence,
    });
  if (state?.propertyTax)
    number.push({
      text: state.propertyTax.says,
      source: state.propertyTax.source,
      asOf: state.propertyTax.asOf,
      confidence: state.propertyTax.confidence,
    });
  number.push(federalLine());

  return {
    key: "easement",
    name: PAY_NAME.easement,
    eligibility,
    reason,
    signals,
    number,
    // Virginia's credit as a slider (§2.1): it starts at $0, so no figure shows before you move it.
    ...(where?.state === "VA"
      ? { slider: { state: "VA" as const, max: sliderMax(listing.askingPrice), step: SLIDER_STEP } }
      : {}),
    cost: PAY_COST.easement,
    ask: PAY_ASK.easement,
  };
}

/** The credit under the slider, its value being said above it: "A state credit of $40,000. At $20,000 a year, …". */
export function sliderCredit(
  c: EasementCredit,
  credit: { credit: number; years: number | null; beyondCarry: number },
): string {
  const spread =
    credit.years !== null && c.yearlyUse.value !== null && credit.years > 1
      ? `. ${NUMBER.yearly(c.yearlyUse.value, credit.years)}${credit.beyondCarry > 0 && c.transfer.value ? `; ${NUMBER.sellRest}` : ""}`
      : "";
  const line = `${NUMBER.credit(credit.credit)}${spread}`;
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** The slider's own line as it moves: "a state credit of $40,000", with the yearly limit's spread. */
export function sliderLine(
  value: number,
  c: EasementCredit,
  credit: { credit: number; years: number | null; beyondCarry: number },
): string {
  const spread =
    credit.years !== null && c.yearlyUse.value !== null && credit.years > 1
      ? `. ${NUMBER.yearly(c.yearlyUse.value, credit.years)}${credit.beyondCarry > 0 && c.transfer.value ? `; ${NUMBER.sellRest}` : ""}`
      : "";
  return `${NUMBER.sliderLabel} ${money(value)} → ${NUMBER.credit(credit.credit)}${spread}`;
}
