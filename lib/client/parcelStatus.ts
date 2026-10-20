/**
 * A parcel's standing in words (WF2, docs/plans/parcel-workflow.md §4): its status, why it was archived and when,
 * and its milestones. Pure; the Info panel, History and the list show these.
 */
import { reasonGiven, type Milestone, type ParcelStatus, type WorkingParcel } from "./parcelStore";

/** Step 8 (plan §8): "In progress" and "Saved" are gone; a favorite has no word, an archived one says so. */
export const STATUS_WORD: Record<ParcelStatus, string> = {
  inProgress: "",
  saved: "",
  archived: "Archived",
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

/** "Archived Oct 14: Sold", or "" for a parcel that isn't archived. */
export function statusLine(p: Pick<WorkingParcel, "status" | "archived">): string {
  if (p.status !== "archived" || !p.archived) return STATUS_WORD[p.status];
  return `Archived ${dayWord(localDay(new Date(p.archived.at)))}: ${p.archived.reason}`;
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

/** Archived for a reason that says something (not blank, not "Rejected:" alone), with when and what it was. */
export function withArchive(p: WorkingParcel, reason: string, now: string): WorkingParcel {
  const r = reason.trim();
  if (p.status === "archived" || !reasonGiven(r)) return p;
  return { ...p, status: "archived", archived: { reason: r, at: now, from: p.status } };
}

/** Back to the household's favorites (step 8, plan §2): Archived is a favorite's state. */
export const withRestore = (p: WorkingParcel): WorkingParcel =>
  p.status === "archived" ? { ...p, status: "saved", archived: null } : p;

/** A milestone's date ("2026-10-20"), or null to clear it. */
export const withMilestone = (p: WorkingParcel, which: Milestone, date: string | null): WorkingParcel =>
  p.milestones[which] === date ? p : { ...p, milestones: { ...p.milestones, [which]: date } };
