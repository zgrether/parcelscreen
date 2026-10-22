/**
 * The learning nudge on What matters (step 12, plan §3; lib/rubric/nudge.ts): the current person's offer, read from
 * their adjustments and the parcels still kept, shown once; its answer kept in `ps.rubrics.nudged`.
 */
import { moveDown, nudgeFor, type Nudge, type NudgeMark } from "@/lib/rubric/nudge";
import type { Factor, Rubric } from "@/lib/rubric/types";
import type { Tier } from "@/lib/rubric/words";
import { currentParcels } from "./liveParcels";
import { getPref, setPref } from "./prefs";
import { effectiveRubrics } from "./rubrics";
import { currentProfileId } from "./profiles";
import { EMPTY_HOUSEHOLD } from "./takes";

/** The offer for the current person now, or null. */
export function pendingNudge(): Nudge | null {
  // A profile that never saved its priorities grades by the starting list: the offer reads that.
  const stored = effectiveRubrics();
  const me = currentProfileId();
  if (!me) return null;
  const kept = new Set(currentParcels().built.flatMap((p) => (p.key ? [p.key] : [])));
  const adjusts = (getPref("ps.household") ?? EMPTY_HOUSEHOLD).adjusts;
  return nudgeFor(adjusts, me, kept, stored.nudged ?? {}, stored.mine);
}

/** Marks a factor's offer: it isn't made again. */
export function markNudge(f: Factor, mark: NudgeMark): void {
  const stored = effectiveRubrics();
  setPref("ps.rubrics", { ...stored, nudged: { ...stored.nudged, [f]: mark } });
}

/** Move it down: marks it moved and returns the rubric a tier lower, for What matters to save as any change. */
export function acceptNudge(f: Factor, r: Rubric): { rubric: Rubric; to: Tier } {
  markNudge(f, "moved");
  return moveDown(r, f);
}
