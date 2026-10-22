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

/** The row panel's section (plan §3, §8). */
export const ADJUST_WORDS = {
  title: "Adjust for this parcel",
  override: "Override the grade",
  pass: "Count it as passed",
  fail: "Count it as failed",
  setAside: "Set aside for this parcel",
  reason: "Why? (required)",
  save: "Save",
  cancel: "Cancel",
  remove: "Remove adjustment",
  removed: "Adjustment removed.",
  undo: "Undo",
  /** Only your grade: another member's ignores it. */
  yours: "Only your grade changes; others in your household keep theirs.",
} as const;

/** What an existing adjustment did, in the panel: "You set it to B; the app says D." */
export function adjustedWords(
  a: { kind: "override" | "setAside"; grade?: string; status?: string },
  app: string,
): string {
  if (a.kind === "setAside") return "You set it aside for this parcel.";
  if (a.grade) return `You set it to ${a.grade}; the app says ${valueWord(app)}.`;
  return `You count it as ${a.status === "pass" ? "passed" : "failed"}; the app says ${valueWord(app)}.`;
}

/** A set-aside factor's reading at the top of its panel. */
export const SET_ASIDE_READING = (reason: string): string => `Set aside for this parcel: “${reason}”.`;

/** Full's section (plan §3, §8): every adjustment on the parcel, by whom. */
export const ADJUSTMENTS_TITLE = "Your adjustments";

/** What an adjustment changed, in a line: "B → A", "Check first → Pass", "set aside". */
export function adjustChange(a: {
  kind: "override" | "setAside";
  grade?: string;
  status?: string;
  was: string;
}): string {
  if (a.kind === "setAside") return "set aside";
  const now = a.grade ?? (a.status === "pass" ? "Pass" : "Fail");
  return `${valueWord(a.was)} → ${now}`;
}
