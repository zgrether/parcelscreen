/**
 * Favorites and History (step 8, docs/plans/step-8-favorites.md §1–§3, §6). One shared store holds every built parcel,
 * as since step 6; what each person sees of it is a view:
 *   - Favorites, the household's: the parcels starred (status `saved`) and the archived ones;
 *   - History, a person's own: the parcels they added that aren't favorites, and the favorites they graded.
 * A parcel that isn't a favorite and that someone else added is in none of my views. The stored statuses are as they
 * were (no converter): `saved` reads as a favorite, `inProgress` as "in History only".
 *
 * A person's History log (`ps.history`, a profile document that syncs with the profile) says when they last graded each
 * parcel: History's order, and which favorites they graded. Pure: callers pass the store, the person and the clock.
 */
import { z } from "zod";
import { isCountyRecord } from "@/lib/geo/recipe";
import { fieldsFor } from "@/lib/geo/parcelFields";
import { matchesId, matchesName, MIN_ID_CHARS, normalizeId } from "@/lib/search/query";
import { readListingUrl } from "./listingUrl";
import { editBuilt, removeBuilt, type ParcelStore, type WorkingParcel } from "./parcelStore";

/** When the person last graded each parcel, by key (ISO). */
export interface HistoryLog {
  v: 1;
  graded: Record<string, string>;
}
export const EMPTY_LOG: HistoryLog = { v: 1, graded: {} };

const LogSchema = z.object({ v: z.literal(1), graded: z.record(z.string(), z.string()) });
export function readHistoryLog(raw: string): HistoryLog | null {
  const r = LogSchema.safeParse(JSON.parse(raw));
  return r.success ? r.data : null;
}

/** Starred, active or archived: the household's. */
export const isFavorite = (p: Pick<WorkingParcel, "status">): boolean => p.status !== "inProgress";

/** The household's Favorites (archived ones too; the list's filter hides those by default). */
export const favoritesOf = (built: readonly WorkingParcel[]): WorkingParcel[] => built.filter(isFavorite);

/** Whether a parcel is in this person's History: theirs and not a favorite, or a favorite they graded. */
export const inHistoryOf = (p: WorkingParcel, me: string, log: HistoryLog): boolean =>
  isFavorite(p) ? p.key !== null && p.key in log.graded : p.addedBy === me;

/** When the parcel was last graded by this person, else when it last changed: History's order. */
export const historyAt = (p: WorkingParcel, log: HistoryLog): string =>
  (p.key !== null && log.graded[p.key]) || p.updatedAt;

/** This person's History, newest first. */
export function historyOf(built: readonly WorkingParcel[], me: string, log: HistoryLog): WorkingParcel[] {
  return built
    .filter((p) => inHistoryOf(p, me, log))
    .sort((a, b) => historyAt(b, log).localeCompare(historyAt(a, log)));
}

/** What this person may see anywhere (the map's outlines, Search, opening by key): Favorites and their History. */
export const visibleTo = (p: WorkingParcel, me: string, log: HistoryLog): boolean =>
  isFavorite(p) || inHistoryOf(p, me, log);

/** The log after a grading: this parcel graded now. */
export const withGraded = (log: HistoryLog, key: string, at: string): HistoryLog => ({
  ...log,
  graded: { ...log.graded, [key]: at },
});

/** The log without these parcels (cleared from History). */
export function withoutKeys(log: HistoryLog, keys: readonly string[]): HistoryLog {
  const graded = { ...log.graded };
  for (const k of keys) delete graded[k];
  return { ...log, graded };
}

/** Starred (plan §2): a favorite, with the name given. Its adder stays (the person starring: only their History shows it). */
export function star(s: ParcelStore, key: string, name: string, now: string): ParcelStore {
  return editBuilt(
    s,
    key,
    (p) =>
      p.status === "saved" && p.name === name.trim()
        ? p
        : { ...p, status: "saved", archived: null, name: name.trim() },
    now,
  );
}

/**
 * Unstarred (plan §2): back to its adder's History, archived or not. The caller drops its asks and takes, as Remove
 * does. Walked and Offered stay on the parcel.
 */
export function unstar(s: ParcelStore, key: string, now: string): ParcelStore {
  return editBuilt(s, key, (p) => (isFavorite(p) ? { ...p, status: "inProgress", archived: null } : p), now);
}

/** The unstarred parcels in this person's History: what ✕ and Clear history can remove. */
export const clearable = (built: readonly WorkingParcel[], me: string, log: HistoryLog): WorkingParcel[] =>
  historyOf(built, me, log).filter((p) => !isFavorite(p));

/** Clear history (plan §3): every unstarred parcel in this person's History, gone for good; favorites stay. */
export function clearHistory(
  s: ParcelStore,
  me: string,
  log: HistoryLog,
  keys: readonly string[] = clearable(s.built, me, log).map((p) => p.key!),
): { store: ParcelStore; log: HistoryLog; removed: WorkingParcel[] } {
  const mine = new Set(clearable(s.built, me, log).map((p) => p.key!));
  const gone = keys.filter((k) => mine.has(k));
  const removed = s.built.filter((p) => p.key !== null && gone.includes(p.key));
  const store = gone.reduce(removeBuilt, s);
  return { store, log: withoutKeys(log, gone), removed };
}

/**
 * The one-time sort (plan §6): a parcel that isn't a favorite and has no adder goes to the current profile's History.
 * Saved parcels are favorites already and archived ones stay archived. Null when there's nothing to do (idempotent).
 */
export function sortedIntoHistory(s: ParcelStore, me: string): ParcelStore | null {
  const orphans = s.built.filter((p) => !isFavorite(p) && p.addedBy === null);
  if (!orphans.length) return null;
  const set = (p: WorkingParcel) => (!isFavorite(p) && p.addedBy === null ? { ...p, addedBy: me } : p);
  return { ...s, built: s.built.map(set), open: s.open && set(s.open) };
}

/** What the name sheet starts with (§11 Q15): the parcel's own name, the listing link's address, or a description. */
export function starName(
  p: WorkingParcel,
  facts: { acres: number | null; road: string | null; county: string | null },
): string {
  if (p.name.trim()) return p.name.trim();
  const listing = readListingUrl(p.listingUrl);
  if (listing.kind === "address") return listing.query;
  const ac = facts.acres === null ? null : `${facts.acres.toFixed(1)} ac`;
  if (ac && facts.road && facts.county) return `${ac} on ${facts.road}, ${facts.county}`;
  if (ac && facts.county) return `${ac} in ${facts.county}`;
  return ac ?? "";
}

/** Each county piece's parcel number, as its service stores it ("52-47A"): what Search matches besides the name. */
export function parcelNumbers(p: Pick<WorkingParcel, "pieces">): string[] {
  return p.pieces.flatMap((piece) => {
    if (!isCountyRecord(piece)) return [];
    const v = piece.props[fieldsFor(piece.source).id];
    return v === null || v === undefined || String(v).trim() === "" ? [] : [String(v)];
  });
}

/** A saved parcel matches a Search query by its name, or by any piece's parcel number (separators ignored). */
export const matchesSaved = (name: string, numbers: readonly string[], query: string): boolean =>
  matchesName(name, query) ||
  (normalizeId(query).length >= MIN_ID_CHARS && numbers.some((n) => matchesId(n, query)));
