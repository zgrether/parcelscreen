/**
 * What the land can do (step 14, docs/plans/step-14-land-uses.md §3): the shapes every use shares. A use reads the
 * screen result, the card's facts and the parcel's own marks, lines and listing, and answers Yes, Maybe or No with one
 * reason and the facts that decide it. Pure: display time only, outside the grade (§1).
 */
import type { EasementType, Hoa, LineKind } from "../client/parcelStore";
import type { CardFacts } from "../report/card";
import type { Mark, SepticClass } from "../report/marks";
import type { PartialScreenResult } from "../screen/types";

export type Answer = "yes" | "maybe" | "no";

/** One thing that decides a use: "Forest", "93%", with where the number came from and when, where data drives it. */
export interface Fact {
  label: string;
  value: string;
  source?: string;
  date?: string;
}

export interface UseAnswer {
  answer: Answer;
  /** One line, without its full stop. */
  reason: string;
  decides: Fact[];
}

export type UseKey = "camp" | "build" | "trails" | "garden" | "hunt" | "ride" | "divide";

/** A drawn line as the uses read it (parcelStore's LineMarkup): What limits you lists the easements. */
export interface UseLine {
  id: string;
  name: string;
  kind: LineKind;
  easementType?: EasementType | null;
  recordedIn: string;
}

/** The listing's facts the uses read (parcelStore's WorkingParcel, step 14 §3.2). */
export interface UseListing {
  deedRestrictions: string;
  hoa: Hoa;
  /** The acres the listing claims, as typed: Divide counts on them, as $/ac does (owner, #311). Absent: none typed. */
  listingAcres?: number | null;
}

export interface UsesInput {
  result: PartialScreenResult;
  /**
   * The card's facts as the app builds them at display time (lib/report/card.ts cardFacts): all four gates, the rows
   * at the build site `at`, and the cost to enjoy when the parcel's rates came with it. Build and Camp restate them.
   */
  facts: CardFacts;
  /** With a septic permit's class, as typed (the card's Drawn.marks). */
  marks: readonly (Mark & { septicClass?: SepticClass | null })[];
  lines: readonly UseLine[];
  listing: UseListing;
}
