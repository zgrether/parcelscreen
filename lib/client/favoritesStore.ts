/**
 * Favorites and History on the device (step 8; the rules are lib/client/favorites.ts): star, unstar and clear through
 * the shared store and this profile's History log, as the list and the panel use them. The explorer hears the store's
 * writes (prefs onParcelsWritten), so a change made here shows on the map at once.
 */
import { useEffect, useState } from "react";
import {
  clearHistory,
  pastRecent,
  sortedIntoHistory,
  star,
  unstar,
  visibleTo,
  withGraded,
  withoutKeys,
  type HistoryLog,
} from "./favorites";
import { dropParcel } from "./householdDoc";
import { EMPTY_STORE, type WorkingParcel } from "./parcelStore";
import { getPref, setPref } from "./prefs";
import { deleteScreens } from "./screenStore";
import { currentProfileId } from "./profiles";

/** The shared store, empty before anything is kept. */
const parcels = () => getPref("ps.parcels") ?? EMPTY_STORE;

/** The window event after this profile's History log is written here. */
export const HISTORY_WRITTEN = "ps:history";

function saveLog(log: HistoryLog): void {
  setPref("ps.history", log);
  if (typeof window !== "undefined") queueMicrotask(() => window.dispatchEvent(new Event(HISTORY_WRITTEN)));
}

/** This profile's History log, kept current on its writes. */
export function useHistoryLog(): HistoryLog {
  const [log, setLog] = useState(() => getPref("ps.history"));
  useEffect(() => {
    const on = () => setLog(getPref("ps.history"));
    window.addEventListener(HISTORY_WRITTEN, on);
    return () => window.removeEventListener(HISTORY_WRITTEN, on);
  }, []);
  return log;
}

/** A finished run kept on this parcel: it's graded now, by this profile. */
export function logGraded(key: string, now = new Date().toISOString()): void {
  saveLog(withGraded(getPref("ps.history"), key, now));
  pruneRecent(now);
}

/** A dismissed parcel's log entry (8c's ×) taken out, and returned for its Undo; null when it had none. */
export function forgetGraded(key: string): string | null {
  const log = getPref("ps.history");
  const at = log.graded[key] ?? null;
  if (at) saveLog(withoutKeys(log, [key]));
  return at;
}

/** A dismiss undone: its log entry back. */
export function relogGraded(key: string, at: string | null): void {
  if (at) saveLog(withGraded(getPref("ps.history"), key, at));
}

/**
 * Recent's limits (8c): this profile's unstarred parcels beyond the 20 newest or older than 30 days go, as a ✕ takes
 * them; the open one stays. At boot and after each grading: History became Recent this way, with no converter.
 */
export function pruneRecent(now = new Date().toISOString()): void {
  const me = currentProfileId();
  if (!me) return;
  const s = parcels();
  const keys = pastRecent(s.built, me, getPref("ps.history"), now, s.open?.key ?? null);
  if (keys.length) clearMyHistory(keys);
}

/** Star a built parcel with its name: it's a favorite for the household. */
export function starParcel(key: string, name: string, now = new Date().toISOString()): void {
  setPref("ps.parcels", star(parcels(), key, name, now));
}

/** Unstar: back to its adder's History, and its asks and takes go, as Remove's do. */
export function unstarParcel(key: string, now = new Date().toISOString()): void {
  dropParcel(key);
  setPref("ps.parcels", unstar(parcels(), key, now));
}

/**
 * Clear this profile's unstarred History (all of it, or the keys given: a row's ✕). Returns the parcels removed, for
 * an Undo. Their asks and takes go, as Remove's do.
 */
export function clearMyHistory(keys?: readonly string[]) {
  const me = currentProfileId();
  if (!me) return [];
  const out = clearHistory(parcels(), me, getPref("ps.history"), keys);
  for (const p of out.removed) dropParcel(p.key!);
  setPref("ps.parcels", out.store);
  saveLog(out.log);
  return out.removed;
}

/** Undo a ✕: the parcels put back as they were, and the log's entries too. */
export function restoreToHistory(removed: readonly WorkingParcel[], log: HistoryLog): void {
  const s = parcels();
  const back = removed.filter((p) => p.key !== null && !s.built.some((b) => b.key === p.key));
  setPref("ps.parcels", { ...s, built: [...s.built, ...back] });
  saveLog({ ...getPref("ps.history"), graded: { ...getPref("ps.history").graded, ...log.graded } });
}

/**
 * A removal's Undo gone (8c): the removed parcels' screens are deleted from this device, but not one another parcel
 * in the store still lists.
 */
export function dropScreensOf(removed: readonly WorkingParcel[]): void {
  const used = new Set(parcels().built.flatMap((p) => p.screenIds));
  void deleteScreens(removed.flatMap((p) => p.screenIds).filter((id) => !used.has(id)));
}

/** The one-time sort (plan §6), at boot: In progress parcels with no adder go to this profile's History. */
export function sortIntoHistory(): void {
  const me = currentProfileId();
  if (!me) return;
  const next = sortedIntoHistory(parcels(), me);
  if (next) setPref("ps.parcels", next);
  pruneRecent();
}

/** The built parcels this profile may see (Favorites and its History): the Help page's and the preview's pickers. */
export function visibleParcels(): WorkingParcel[] {
  const me = currentProfileId();
  const log = getPref("ps.history");
  return parcels().built.filter((p) => me === null || visibleTo(p, me, log));
}
