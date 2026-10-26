/**
 * Notes and lines made offline (step 14e, docs/plans/step-14e-offline.md §6): step 5 has no offline queue, and this adds
 * one for a parcel's notes and its lines and marks only. A save that fails while offline is held, not failed, when
 * each unsaved parcel differs from what the space last held only in those fields; it goes by itself when the device is
 * back online. If the space's copy changed meanwhile, the two are merged three ways, against the copy this device
 * started from. Pure.
 */
import { canonical } from "./records";

type Json = Record<string, unknown>;

/** The fields a held change may touch: the notes, their date, the lines and marks, and the record's own date. */
const HELD_FIELDS: ReadonlySet<string> = new Set(["notes", "notesAt", "markup", "updatedAt"]);

/** Whether `record` differs from `base` (a canonical string) only in the notes and the lines and marks. */
export function onlyNotesAndLines(base: string | undefined, record: Json | null): boolean {
  if (!base || !record) return false;
  const was = JSON.parse(base) as Json;
  const keys = new Set([...Object.keys(was), ...Object.keys(record)]);
  let touched = false;
  for (const k of keys) {
    if (canonical(was[k]) === canonical(record[k])) continue;
    if (!HELD_FIELDS.has(k)) return false;
    if (k !== "updatedAt") touched = true;
  }
  return touched;
}

/**
 * Whether a profile's record differs from `base` only in its Recent (`ps.history`): opening a parcel offline writes it.
 * It's held with the notes and lines and sent whole on return, as step 5 sends any record; Recent isn't merged.
 */
export function onlyRecent(base: string | undefined, value: string): boolean {
  if (!base || base === value) return false;
  const was = JSON.parse(base) as Json;
  const now = JSON.parse(value) as Json;
  const docs = (r: Json) => ({ ...((r.docs as Json | undefined) ?? {}), "ps.history": undefined });
  return canonical({ ...was, docs: docs(was) }) === canonical({ ...now, docs: docs(now) });
}

/** A held profile's key in `ps.sync`'s `held`, beside the parcels' (whose keys are their own ids). */
export const heldProfileKey = (id: string): string => `profile:${id}`;

interface Mark {
  id: string;
  [field: string]: unknown;
}

const marks = (r: Json): Mark[] => (Array.isArray(r.markup) ? (r.markup as Mark[]) : []);

/**
 * The lines and marks, three ways by id:
 * - added here, or changed here: ours;
 * - deleted here: gone, unless it changed there (theirs is kept);
 * - deleted there but changed here: ours is kept (nothing is lost);
 * - anything else: theirs.
 * Theirs keep their order, with ours added here after them.
 */
export function mergeMarks(base: readonly Mark[], mine: readonly Mark[], theirs: readonly Mark[]): Mark[] {
  const b = new Map(base.map((m) => [m.id, canonical(m)]));
  const m = new Map(mine.map((x) => [x.id, x]));
  const out: Mark[] = [];
  for (const t of theirs) {
    const ours = m.get(t.id);
    const changedThere = b.get(t.id) !== canonical(t);
    if (!ours) {
      // Deleted here (it was in the base), unless it changed there; or new there.
      if (!b.has(t.id) || changedThere) out.push(t);
      continue;
    }
    out.push(b.get(t.id) !== canonical(ours) ? ours : t);
  }
  const there = new Set(theirs.map((t) => t.id));
  for (const ours of mine) {
    if (there.has(ours.id)) continue;
    // Added here; or deleted there and changed here.
    if (!b.has(ours.id) || b.get(ours.id) !== canonical(ours)) out.push(ours);
  }
  return out;
}

/** The notes: ours if theirs didn't change, theirs if ours didn't, else both, theirs first, a blank line between. */
export function mergeNotes(base: string, mine: string, theirs: string): string {
  if (theirs === base || theirs === mine) return mine;
  if (mine === base) return theirs;
  return [theirs.trimEnd(), mine.trim()].filter(Boolean).join("\n\n");
}

/** A held parcel laid over the space's newer copy: their record, with the notes and the lines and marks merged. */
export function mergeHeld(base: Json, mine: Json, theirs: Json): Json {
  const notes = mergeNotes(String(base.notes ?? ""), String(mine.notes ?? ""), String(theirs.notes ?? ""));
  return {
    ...theirs,
    notes,
    notesAt: notes === theirs.notes ? theirs.notesAt : mine.notesAt,
    markup: mergeMarks(marks(base), marks(mine), marks(theirs)),
    updatedAt: mine.updatedAt,
  };
}
