/**
 * A parcel's standing in words (WF2, docs/plans/parcel-workflow.md §4): its status, why it was archived and when,
 * and its milestones. Pure; the Info panel, History and the list show these.
 */
import type { Milestone, ParcelStatus, WorkingParcel } from "./parcelStore";

export const STATUS_WORD: Record<ParcelStatus, string> = {
  inProgress: "In progress",
  saved: "Saved",
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

/** "In progress", "Saved", or "Archived Oct 14: Sold". */
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
