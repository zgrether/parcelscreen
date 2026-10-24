/**
 * A parcel's standing in words (WF2, docs/plans/parcel-workflow.md §4): its status, why it was archived and when,
 * and its milestones. Pure; the Info panel, History and the list show these.
 */
import type { Milestone, ParcelStatus, WorkingParcel } from "./parcelStore";

/** Step 8 (plan §8): "In progress" and "Saved" are gone; a favorite has no word, an archived one says so. */
export const STATUS_WORD: Record<ParcelStatus, string> = {
  inProgress: "",
  saved: "",
  // UX part 2 (J-2): the person's decision is Rule out; the stored status keeps its name (no format change).
  archived: "Ruled out",
};

export const MILESTONE_WORD: Record<Milestone, string> = { walked: "Walked", offered: "Offered" };
export const MILESTONES: readonly Milestone[] = ["walked", "offered"];

/** "Oct 20" from a milestone's "2026-10-20" (a calendar date: no time zone moves it a day). */
export function dayWord(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "2026-10-20" for a moment, in the local calendar: a milestone set today. */
export function localDay(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/** "Ruled out Oct 14: Septic", "Ruled out Oct 14" with no reason, or "" for a parcel that isn't ruled out. */
export function statusLine(p: Pick<WorkingParcel, "status" | "archived">): string {
  if (p.status !== "archived" || !p.archived) return STATUS_WORD[p.status];
  const when = `${STATUS_WORD.archived} ${dayWord(localDay(new Date(p.archived.at)))}`;
  return p.archived.reason ? `${when}: ${p.archived.reason}` : when;
}

/** "Walked Oct 20 · Offered Nov 2", or "" with none. */
export function milestonesLine(p: Pick<WorkingParcel, "milestones">): string {
  return MILESTONES.flatMap((k) => {
    const d = p.milestones[k];
    return d ? [`${MILESTONE_WORD[k]} ${dayWord(d)}`] : [];
  }).join(" · ");
}

// ---------- the changes (WF2): the explorer's reducer and the list both make them ----------
// Each returns the parcel itself when nothing changes, so a caller can tell and save nothing.

/**
 * Ruled out (Not for us, P-4): any parcel, on the list or only in Recent, with an optional reason, when, and what it
 * was. It joins Your list as Ruled out (the household's), greyed on the map.
 */
export function withArchive(p: WorkingParcel, reason: string, now: string): WorkingParcel {
  if (p.status === "archived") return p;
  return { ...p, status: "archived", archived: { reason: reason.trim(), at: now, from: p.status } };
}

/** Move back (P-4): where it was before it was ruled out, on the list or in its adder's Recent. */
export const withRestore = (p: WorkingParcel): WorkingParcel =>
  p.status === "archived" ? { ...p, status: p.archived?.from ?? "saved", archived: null } : p;

/** A milestone's date ("2026-10-20"), or null to clear it. */
export const withMilestone = (p: WorkingParcel, which: Milestone, date: string | null): WorkingParcel =>
  p.milestones[which] === date ? p : { ...p, milestones: { ...p.milestones, [which]: date } };
