/**
 * Every string How it could pay says (step 15, docs/plans/step-15-how-it-could-pay.md §8; CLAUDE.md rule 7: all new,
 * additive). The programs' own rules are config (lib/config/programs.ts), quoted by their `says`.
 */
import { fmt } from "../format";
import type { Eligibility, PayKey } from "./types";

export const money = (n: number): string => `$${fmt(Math.round(n))}`;
export const moneyRange = (low: number, high: number): string =>
  low === high ? money(low) : `${money(low)}–${money(high)}`;
const ac = (n: number): string => fmt(n, n < 10 ? (n < 1 ? 2 : 1) : 0);

export const PAY_WORDS = {
  section: "How it could pay",
  number: "The number",
  costs: "What it costs you",
  ask: "Ask",
  signals: "What decides it",
  /** The segment's not-advice line gains this sentence after Panel 1's (plan §12 Q1). */
  notAdvice: "For how it could pay, talk to a tax advisor, a land trust or a forester before acting.",
  notCovered: "Not covered here yet",
  toConfirm: "to confirm",
} as const;

export const ELIGIBILITY_WORD: Record<Eligibility, string> = {
  eligible: "Eligible",
  maybe: "Maybe",
  no: "Not eligible",
};

export const PAY_NAME: Record<PayKey, string> = {
  easement: "Conservation easement",
  useValue: "Use-value tax",
  carbon: "Forest carbon",
  lease: "Hunting lease",
  timber: "Selective timber",
  split: "Split and resell",
  camp: "Camp sites",
};

export const PAY_COST: Record<PayKey, string> = {
  easement: "Permanent: a lower resale value and limited building rights",
  useValue: "Rollback taxes if the use changes",
  carbon: "A practice contract, often with limits on harvesting",
  lease: "Your own use in season; liability and a lease",
  timber: "The woods look different for some years",
  split: "Less land and a neighbour; covenants or an easement can protect your side",
  camp: "Visitors on the land",
};

export const PAY_ASK: Record<PayKey, { who: string; question: string }> = {
  easement: {
    who: "a land trust",
    question: "Would you hold an easement here, and what would its appraised value be?",
  },
  useValue: {
    who: "the county's commissioner of the revenue or assessor",
    question: "What would this parcel's use value be in the forest class?",
  },
  carbon: {
    who: "the program",
    question: "What would you pay for this forest, and what would the contract limit?",
  },
  lease: {
    who: "a lease broker or the state's extension forester",
    question: "What are leases on land like this getting near here?",
  },
  timber: {
    who: "a consulting forester",
    question: "What would a cruise put this stand at, and when would a selective cut make sense?",
  },
  split: {
    who: "a surveyor and a land-use attorney",
    question:
      "What will surveying, the plat and the deed cost for this split, and will the county approve it?",
  },
  camp: { who: "the county's zoning office", question: "What permits would paying campers here need?" },
};

/** The figures' own words (§8 Numbers). */
export const NUMBER = {
  appraisal: "Needs an appraisal",
  cruise: "Needs a timber cruise: ask a consulting forester for a cruise",
  programQuotes: "The program quotes the payment",
  rough: "a rough range, not a quote",
  notPublished: "Not published by the county",
  noCredit: "No state credit",
  onAsking: "on the asking price; the county's assessment may differ",
  typeAssessed: "Type the assessed value",
  cruiseValued: (value: number, date: string) => `A cruise valued the timber at ${money(value)} (${date})`,
  sliderLabel: "If the easement's appraised value were",
  credit: (credit: number) => `a state credit of ${money(credit)}`,
  /** The credit's formula, as the export says it (no slider there). */
  formula: (name: string, pct: number) => `${name}: ${pct}% of the easement's appraised value`,
  capped: (cap: number) => `, at most ${money(cap)}`,
  yearly: (limit: number, years: number) =>
    `At ${money(limit)} a year, you'd use it over ${years} ${years === 1 ? "year" : "years"}`,
  sellRest: "the rest can be sold",
  carry: (years: number) => `unused credit carries forward ${years} years`,
  donatedBy: (date: string) => `for donations made by ${date}`,
  federal: (agi: number, farmer: number, carry: number) =>
    `Federal: a donated easement is deductible up to ${agi}% of your income a year (${farmer}% for a qualified farmer), carried forward ${carry} years`,
  todayTax: (tax: number, on: string) => `Today's tax: about ${money(tax)} a year (${on})`,
  programTax: (low: number, high: number) => `In the program: about ${moneyRange(low, high)} a year`,
  onAssessed: (year: number | null) => `on the assessed value${year ? `, ${year}` : ""}`,
  rate: (says: string, year: string) => `The county's rate: ${says} (${year})`,
  perAc: (low: number, high: number) => `Forest use values: ${moneyRange(low, high)} an acre by class`,
  noValues: "The county's use values aren't published",
  lease: (low: number, high: number, acres: number, perAc: { low: number; high: number }) =>
    `About ${moneyRange(low, high)} a year (${ac(acres)} ac at $${perAc.low}–${perAc.high} an acre)`,
  breakEven: (name: string, word: string, perAc: number) =>
    `${name}: sell the ${word} piece at ${money(perAc)}/ac or more to break even`,
  breakEvenNoPrice: (name: string) => `${name}: type the purchase price to see its break-even`,
  trySplit: "Try a split to see its break-even",
  campNone: "No number: the county's rules decide whether visitors can pay to camp",
} as const;

/** Each option's reasons (§2), without a full stop. */
export const REASON = {
  missing: (what: string) => `${what}: not known`,
  notCovered: (county: string) => `Not covered here yet: ${county}`,
  state: (state: string) => `Not covered here yet: ${state}`,
  // Conservation easement
  easementEligible: (values: string) => `Lots to give up, and ${values}`,
  easementLotsOnly: "Lots to give up, but a land trust looks for a conservation value too",
  easementNoLots: (values: string, divide: string) =>
    `${values}, but an easement's value is mostly the building rights it retires: ${divide.charAt(0).toLowerCase()}${divide.slice(1)}`,
  easementSmallForest: (minAc: number) =>
    `Under ${minAc} ac, forest alone is rarely enough: a land trust looks for public land, the Parkway or water`,
  easementNone: "No lots to give up, and no public land, water or forest to protect",
  // Use-value tax
  uvEligible: (forestAc: number, name: string) => `${ac(forestAc)} ac of forest, enough for ${name}`,
  uvNoProgram: (says: string) => says,
  uvSmall: (forestAc: number, min: number) => `${ac(forestAc)} ac of forest, under the ${min} ac minimum`,
  uvAsFarm: (min: number) =>
    `Not enough forest, but ${min} ac or more could qualify as farm land, if it's farmed`,
  uvRequirements: (what: string) => `Enough forest, but ${what}`,
  // Forest carbon
  carbonEligible: (program: string, min: number) => `Enough forest for the ${program} (${min} ac or more)`,
  carbonNear: (forestAc: number, min: number) =>
    `${ac(forestAc)} ac of forest, just under the ${min} ac minimum`,
  carbonSmall: (forestAc: number, min: number) => `${ac(forestAc)} ac of forest, under the ${min} ac minimum`,
  carbonRegion: (state: string) => `The program enrolls western ${state} only: check your county`,
  // Hunting lease
  leaseEligible: (acres: number) => `${ac(acres)} ac you can hunt: big enough to lease`,
  leaseSmallish: (acres: number, min: number) => `${ac(acres)} ac: under ${min} ac is small for a lease`,
  leaseHunt: (reason: string) =>
    `Hunting is a maybe here: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}`,
  leaseNo: "Too small to lease",
  // Selective timber
  timberEligible: (forestAc: number) => `${ac(forestAc)} ac of forest, enough for a logger to bid`,
  timberSmall: (forestAc: number, min: number) =>
    `${ac(forestAc)} ac of forest: loggers typically want ${min} ac or more`,
  timberNone: "Almost no forest",
  // Split and resell, camp sites: Panel 1's reasons, with these
  splitDivide: (reason: string) => reason,
  campCounty: "The county's rules decide",
  campNo: (reason: string) => reason,
} as const;

/** The signals' labels (What decides it). */
export const SIGNAL = {
  lots: "Lots you could give up",
  publicLand: "Public land or the Parkway",
  publicNear: (name: string, mi: string) => `${name}, ${mi}`,
  adjoins: "next door",
  within: (mi: number) => `within ${fmt(mi, 1)} mi`,
  water: "Streams",
  waterValue: (perennialFt: number, intermittentFt: number) =>
    perennialFt > 0
      ? `${fmt(perennialFt)} ft of year-round stream`
      : intermittentFt > 0
        ? `${fmt(intermittentFt)} ft of seasonal stream`
        : "none mapped",
  forest: "Forest",
  forestValue: (pct: number, acres: number) => `${fmt(pct)}% (${ac(acres)} ac)`,
  acres: "Acres",
  small: "Small easements",
  county: "County",
  program: (name: string) => name,
  minimum: (min: number) => `${min} ac minimum`,
  hunt: "Hunt",
  camp: "Camp now",
  divide: "Divide",
  cruise: "Timber cruise",
  none: "none",
} as const;
