/**
 * How it could pay (step 15, docs/plans/step-15-how-it-could-pay.md §1–§2): the shapes every option shares. An option
 * reads the screen result, Panel 1's answers and the parcel's listing, and answers Eligible, Maybe or Not eligible with
 * one reason, the signals that decided it, its number (a range, a formula, or what it would take to get one), what it
 * costs you in use, and the one question for the professional. Pure: display time only, outside the grade (§1).
 */
import type { PayConfidence } from "../config/programs";
import type { LandUses } from "../uses";
import type { Fact, UsesInput } from "../uses/types";

export type Eligibility = "eligible" | "maybe" | "no";

export type PayKey = "easement" | "useValue" | "carbon" | "lease" | "timber" | "split" | "camp";

/**
 * The estimate's own confidence word, beside its figure (plan §3): how firm the number is, not where its source is.
 * "set by law": a statute's rate; "from county rates": the county's figures applied to this parcel; "low": a regional
 * range; "from your cruise": the cruise you typed; "your inputs": the break-even, from the figures you gave.
 */
export type Firmness = "set by law" | "from county rates" | "low" | "from your cruise" | "your inputs";

/** One line of an option's number: the figure or formula, its firmness, and its source with its date. */
export interface PayLine {
  text: string;
  firmness?: Firmness;
  source?: string;
  asOf?: string;
  /** The source's confidence word ("to confirm" until its page is read). */
  confidence?: PayConfidence;
}

/** Virginia's credit slider (§2.1): the formula's inputs; the panel computes the credit as the slider moves. */
export interface CreditSlider {
  state: "VA";
  /** The slider's top, $: the asking price, or $1,000,000 without one. */
  max: number;
  step: number;
}

export interface PayOption {
  key: PayKey;
  name: string;
  eligibility: Eligibility;
  /** One line, without its full stop. */
  reason: string;
  /** The facts that decided it, each with its source and date where data drives it. */
  signals: Fact[];
  number: PayLine[];
  /** Virginia's easement only. */
  slider?: CreditSlider;
  /** A link the option's detail offers: the county's rules for Camp sites, the program for carbon. */
  link?: { label: string; href: string };
  cost: string;
  ask: { who: string; question: string };
}

/** A split scenario's break-even, as Split and resell's row says it (§2.6; the scenario view computes it, §4). */
export interface ScenarioBreakEven {
  name: string;
  /** "North" */
  soldWord: string;
  /** $/ac; null when the scenario has no purchase price yet. */
  perAc: number | null;
}

/** What the options read from the parcel's listing (step 15 §5). */
export interface PayListing {
  askingPrice: number | null;
  /** Typed from the county's record (§5.2). */
  assessed: { value: number; year: number | null } | null;
  /** Typed from a timber cruise (§5.1). */
  timberCruise: { value: number; date: string } | null;
}

export interface PayInput {
  /** Panel 1's input: the result, the card's facts, the marks, lines and listing. */
  uses: UsesInput;
  /** Panel 1's answers (Hunt, Camp now and Divide decide three options). */
  land: LandUses;
  listing: PayListing;
  scenarios: readonly ScenarioBreakEven[];
}
