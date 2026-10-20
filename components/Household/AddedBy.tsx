"use client";
/**
 * "Added by Zach" (step 6, docs/plans/step-6-household.md §1): who first kept a parcel on the household's list. Said
 * only in a household of more than one, and only when the adder is still a member (a parcel kept before step 6 has
 * none).
 */
import { useSyncExternalStore } from "react";
import { memberName, members } from "@/lib/client/household";
import { RUBRICS_CHANGED } from "@/lib/client/profileEvents";

const subscribe = (changed: () => void) => {
  window.addEventListener(RUBRICS_CHANGED, changed);
  return () => window.removeEventListener(RUBRICS_CHANGED, changed);
};

/** The line's words, or null when there's nothing to say. */
export function addedByLine(addedBy: string | null): string | null {
  if (members().length < 2) return null;
  const name = memberName(addedBy);
  return name ? `Added by ${name}` : null;
}

export function AddedBy({ addedBy }: { addedBy: string | null }) {
  const line = useSyncExternalStore(
    subscribe,
    () => addedByLine(addedBy),
    () => null,
  );
  return line ? <p className="tiny muted added-by">{line}</p> : null;
}
