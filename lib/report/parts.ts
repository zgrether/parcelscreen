/**
 * Report text as parts, so a sentence that points at the map ("Tap any numbered pin…") can be left out
 * where no map sits beside the report (Phase 1's print variant; step 14 plan §6). Each part carries its
 * own leading space or punctuation: joined in order, the parts read exactly as the prototype's text.
 */
export interface Part {
  text: string;
  /** Points at the map: only meaningful next to it. */
  map?: true;
}

export const said = (text: string): Part => ({ text });
export const onMap = (text: string): Part => ({ text, map: true });

/** The parts as one string; with `withMap` false, the ones that point at the map are left out. */
export const joinParts = (parts: readonly Part[], withMap = true): string =>
  parts
    .filter((p) => withMap || !p.map)
    .map((p) => p.text)
    .join("");

/** A section's heading: its title, the small subtitle after it, and the keys the panel needs. */
export interface Heading {
  title: string;
  sub?: string;
  /** The prototype's key for the section's open state (`ps.open`), derived from its title (proto L1560). */
  slug: string;
  /** The help dialog's anchor for the section's "?" link. */
  help: string;
}
