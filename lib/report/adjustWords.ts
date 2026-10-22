/**
 * Per-parcel adjustments' words (step 12, docs/plans/step-12-raise-the-grade.md §8: declared, new strings only). Pure;
 * the card, the panel and the report read them.
 */

/** The ✎ mark's title, wherever an adjusted grade or row shows. */
export const ADJUSTED_TITLE = "Adjusted for this parcel";

/** A set-aside row's or Must's line. */
export const SET_ASIDE_WORDS = "set aside for this parcel";

const STATUS_WORDS: Record<string, string> = {
  pass: "Pass",
  warn: "Check first",
  fail: "Fail",
  unknown: "Unknown",
};

/** A letter as it is, a Must's status in the card's words ("warn" → "Check first"). */
export const valueWord = (v: string): string => STATUS_WORDS[v] ?? v;

/** After a re-grade changed the app's own value since the person adjusted it. */
export const APP_NOW_SAYS = (v: string): string => `app now says ${valueWord(v)}`;
