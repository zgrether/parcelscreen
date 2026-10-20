/**
 * The current profile's rubrics (step 1, PR 5; docs/plans/step-1-profiles-grading.md §3.5): its own ("mine"), then
 * each other household member's own (step 6, docs/plans/step-6-household.md §2, lib/client/household.ts), under their
 * name. A profile's stored `others` (step 1's stand-ins for the household) are no longer read. The card, the list,
 * Compare and the rulebook grade with these, and the one on show is the profile's `ps.rubricView`.
 */
import { defaultRubric } from "@/lib/rubric/default";
import type { ProfileRubrics } from "@/lib/rubric/schema";
import { MINE, type NamedRubric } from "@/lib/rubric/types";
import { otherMembers } from "./household";
import { getPref, setPref } from "./prefs";
import { RUBRICS_CHANGED } from "./profileEvents";

export { RUBRICS_CHANGED };

/** The profile's rubrics as kept, or the default alone before it has its own (what an export writes). */
export const effectiveRubrics = (): ProfileRubrics =>
  getPref("ps.rubrics") ?? { mine: defaultRubric(), others: [] };

/** Replaces the profile's rubrics (null: back to the default alone) and tells the open pages. */
export function setProfileRubrics(r: ProfileRubrics | null): void {
  setPref("ps.rubrics", r);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(RUBRICS_CHANGED));
}

/** The profile's own rubric, named: the first choice everywhere. */
export const mineNamed = (rubric = defaultRubric()): NamedRubric => ({ id: MINE, name: "Mine", rubric });

/** Every rubric the profile grades with: its own first, then each other member's who has set their priorities. */
export function profileRubrics(): NamedRubric[] {
  const stored = getPref("ps.rubrics");
  const others = otherMembers()
    .filter((m) => m.rubric !== null)
    .map((m): NamedRubric => ({ id: m.id, name: m.name, rubric: m.rubric! }));
  return [stored ? mineNamed(stored.mine) : mineNamed(), ...others];
}

/** The rubric on show (the switch), falling back to the profile's own when the remembered one is gone. */
export function viewedRubric(rubrics: readonly NamedRubric[] = profileRubrics()): NamedRubric {
  const id = getPref("ps.rubricView");
  return rubrics.find((r) => r.id === id) ?? rubrics[0]!;
}

export function setViewedRubric(id: string): void {
  setPref("ps.rubricView", id);
}

/** The switch's label: "My grade", or "{name}'s grade". */
export const switchLabel = (r: { id: string; name: string }): string =>
  r.id === MINE ? "My grade" : `${r.name}'s grade`;

/** The short label beside a grade on a card: "Mine", or the name. */
export const shortLabel = (r: { id: string; name: string }): string => (r.id === MINE ? "Mine" : r.name);
