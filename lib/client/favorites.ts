/**
 * Favorites and History (step 8, docs/plans/step-8-favorites.md §1–§3, §6). One shared store holds every built parcel,
 * as since step 6; what each person sees of it is a view:
 *   - Favorites, the household's: the parcels starred (status `saved`) and the archived ones;
 *   - History, a person's own: the parcels they added that aren't favorites, and the favorites they graded.
 * A parcel that isn't a favorite and that someone else added is in none of my views. The stored statuses are as they
 * were (no converter): `saved` reads as a favorite, `inProgress` as "in History only".
 *
 * A person's History log (`ps.history`, a profile document that syncs with the profile) says when they last graded each
 * parcel (History's order, and which favorites they graded) and, since UX part 2, when they last opened it: Recent keeps
 * a parcel for 60 days from the later of the two (docs/plans/ux-part-2.md §9 Q4). Pure: callers pass the store, the person and the clock.
 */
import { z } from "zod";
import { isCountyRecord } from "@/lib/geo/recipe";
import { fieldsFor, serviceOfRecord } from "@/lib/geo/parcelFields";
import { parcelFacts } from "@/lib/geo/parcels";
import { matchesId, matchesName, MIN_ID_CHARS, normalizeId } from "@/lib/search/query";
import { countyShort } from "./library";
import { readListingUrl } from "./listingUrl";
import { editBuilt, removeBuilt, type ParcelStore, type WorkingParcel } from "./parcelStore";

/** When the person last graded each parcel, and last opened it (UX part 2; absent in a log kept before), by key (ISO). */
export interface HistoryLog {
  v: 1;
  graded: Record<string, string>;
  opened?: Record<string, string>;
}
export const EMPTY_LOG: HistoryLog = { v: 1, graded: {} };

const LogSchema = z.object({
  v: z.literal(1),
  graded: z.record(z.string(), z.string()),
  opened: z.record(z.string(), z.string()).optional(),
});
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

/**
 * When the parcel was last graded or opened by this person, whichever is later, else when it last changed: History's
 * order, and what Recent's days count from (UX part 2, §9 Q4).
 */
export function historyAt(p: WorkingParcel, log: HistoryLog): string {
  if (p.key === null) return p.updatedAt;
  const g = log.graded[p.key],
    o = log.opened?.[p.key];
  return (g && o ? (g > o ? g : o) : (g ?? o)) || p.updatedAt;
}

/** This person's History, newest first. */
export function historyOf(built: readonly WorkingParcel[], me: string, log: HistoryLog): WorkingParcel[] {
  return built
    .filter((p) => inHistoryOf(p, me, log))
    .sort((a, b) => historyAt(b, log).localeCompare(historyAt(a, log)));
}

/** Recent keeps this many parcels (Zach's Z-8, UX part 2; 20 since 8c)… */
export const RECENT_MAX = 50;
/** …for this long after they were last graded or opened (Z-8; 30 since 8c). */
export const RECENT_DAYS = 60;
const DAY_MS = 86_400_000;

/**
 * Recent (8c; Z-8): this person's graded parcels that aren't on the list, newest first, the 50 newest within 60 days.
 * Closing one (×) never takes it out (J-2); its ✕ in Recent does.
 */
export function recentOf(
  built: readonly WorkingParcel[],
  me: string,
  log: HistoryLog,
  now: string,
): WorkingParcel[] {
  const since = new Date(Date.parse(now) - RECENT_DAYS * DAY_MS).toISOString();
  return historyOf(built, me, log)
    .filter((p) => !isFavorite(p) && historyAt(p, log) >= since)
    .slice(0, RECENT_MAX);
}

/**
 * What falls out of Recent (8c): this person's unstarred parcels beyond the 50 newest or older than 60 days, for
 * clearHistory to drop. The open parcel stays, whatever its age.
 */
export const pastRecent = (
  built: readonly WorkingParcel[],
  me: string,
  log: HistoryLog,
  now: string,
  open: string | null,
): string[] => {
  const kept = new Set(recentOf(built, me, log, now).map((p) => p.key));
  return clearable(built, me, log)
    .filter((p) => !kept.has(p.key) && p.key !== open)
    .map((p) => p.key!);
};

/** What this person may see anywhere (the map's outlines, Search, opening by key): Favorites and their History. */
export const visibleTo = (p: WorkingParcel, me: string, log: HistoryLog): boolean =>
  isFavorite(p) || inHistoryOf(p, me, log);

/** The log after a grading: this parcel graded now. */
export const withGraded = (log: HistoryLog, key: string, at: string): HistoryLog => ({
  ...log,
  graded: { ...log.graded, [key]: at },
});

/** The log after an opening: this parcel opened now. */
export const withOpened = (log: HistoryLog, key: string, at: string): HistoryLog => ({
  ...log,
  opened: { ...log.opened, [key]: at },
});

/** The log without these parcels (cleared from History). */
export function withoutKeys(log: HistoryLog, keys: readonly string[]): HistoryLog {
  const graded = { ...log.graded };
  const opened = { ...log.opened };
  for (const k of keys) {
    delete graded[k];
    delete opened[k];
  }
  return { ...log, graded, ...(log.opened ? { opened } : {}) };
}

/** Starred (plan §2): a favorite, with the name given. Its adder stays (the person starring: only their History shows it). */
export const starred = (p: WorkingParcel, name: string): WorkingParcel =>
  p.status === "saved" && p.name === name.trim()
    ? p
    : { ...p, status: "saved", archived: null, name: name.trim() };

/**
 * Unstarred (plan §2): back to its adder's History, archived or not. The caller drops its asks and takes, as Remove
 * does. Walked and Offered stay on the parcel.
 */
export const unstarred = (p: WorkingParcel): WorkingParcel =>
  isFavorite(p) ? { ...p, status: "inProgress", archived: null } : p;

/** A built parcel starred, in the store. */
export const star = (s: ParcelStore, key: string, name: string, now: string): ParcelStore =>
  editBuilt(s, key, (p) => starred(p, name), now);

/** A built parcel unstarred, in the store. */
export const unstar = (s: ParcelStore, key: string, now: string): ParcelStore =>
  editBuilt(s, key, unstarred, now);

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

/** The parcel's county as the name sheet says it ("Grayson"), from its county records. */
export function countyOf(p: Pick<WorkingParcel, "pieces">): string | null {
  const c = p.pieces.map((x) => parcelFacts(x.geo, x.props).county).find((x) => !!x);
  return c ? countyShort(c).replace(/ Co\.$/, "") : null;
}

/**
 * The header's place line (P-2, UX part 2): "Grayson Co., VA · tax map 63-A-62", the tax map number the listings use
 * where the county has one (Virginia's PTM_ID), else the record's own. An imported parcel's record is known by its
 * fields. Null for a drawn parcel.
 */
export function placeLine(p: Pick<WorkingParcel, "pieces">): string | null {
  const rec = p.pieces.find((r) => serviceOfRecord(r));
  if (!rec) return null;
  const service = serviceOfRecord(rec)!;
  const county = countyOf(p);
  const state = service.state;
  const alt = service.fields.altId;
  const altValue = alt ? String(rec.props[alt] ?? "").trim() : "";
  const id = altValue || parcelFacts(rec.geo, rec.props).parcelId;
  const where = county ? `${county} Co.${state ? `, ${state}` : ""}` : null;
  return [where, id ? `tax map ${id}` : null].filter(Boolean).join(" · ") || null;
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
