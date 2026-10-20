/**
 * Screens kept in the browser for Phase 0 (step 14 plan Q2): IndexedDB, one record per screen, keyed by the
 * same ids as each parcel's `screenIds` (lib/client/parcelStore.ts). A record is added once and never
 * changed: a re-run, or a re-assessed house, is a new record with a new id, as Phase 1's `screens` rows are.
 * localStorage would be too small: a result with its soil-unit geometry runs to hundreds of KB.
 *
 * Storage can be missing or refused (private windows); then nothing is kept and reads find nothing.
 */
import { z } from "zod";
import { ENGINE_VERSION, UNSTAMPED_ENGINE } from "../screen/engine";
import { ScreenResultSchema, type ScreenResult } from "../screen/types";
import { openDb, SCREENS } from "./db";
import { SPACE_ID } from "./profileKv";
import type { RunKeys } from "./screenKeys";
import { syncHooks } from "./syncHooks";

export interface ScreenRecord {
  id: string;
  /** What the screen was run on (lib/client/screenKeys.ts). */
  keys: RunKeys;
  result: ScreenResult;
  /** The rules it was screened with (lib/screen/engine.ts). Missing on screens kept before the stamp: 1. */
  engine?: number;
  /** The profile it belongs to (step 1, PR 4); stamped when kept. Missing on a screen kept before profiles, until the migration stamps it. */
  profile?: string;
}

export const ScreenRecordSchema = z.object({
  id: z.string(),
  keys: z.object({
    boundary: z.string(),
    house: z.string(),
    settings: z.string(),
    // Follow-up 34 (v5): a key kept before it has no lines.
    lines: z.string().default(""),
  }),
  result: ScreenResultSchema,
  engine: z.number().int().positive().optional(),
  profile: z.string().optional(),
});

/** The rules a kept screen was screened with; an unstamped one is Phase 0's. */
export const engineOf = (r: Pick<ScreenRecord, "engine">): number => r.engine ?? UNSTAMPED_ENGINE;

/** Whether a kept screen came from earlier rules than this build's, so a re-run may give other numbers. */
export const fromEarlierRules = (
  r: Pick<ScreenRecord, "engine">,
  current: number = ENGINE_VERSION,
): boolean => engineOf(r) < current;

/**
 * What a result re-screened on open says (owner, #101, 2026-10-11: an approved replacement of "Screened with earlier
 * rules — run again for current results", phase-0.md §9.27).
 */
export const RESCREENED = "Re-screened with the current rules";
/** A History entry whose last screen is gone or from earlier rules (it replaces the "earlier rules" note there). */
export const RESCREENS_ON_OPEN = "Re-screens with the current rules when opened";
/** A parcel whose re-screen waits for the network (owner, #101). */
export const RESCREEN_OFFLINE = "Will re-screen when you're back online";

/** The record stamped as the household's (step 6: screens belong to the shared list, not a profile). */
const stamped = (r: ScreenRecord): ScreenRecord => ({ ...r, profile: SPACE_ID });

/** Adds a screen. Resolves false when it couldn't be kept. */
export async function addScreen(record: ScreenRecord): Promise<boolean> {
  const d = await openDb();
  if (!d) return false;
  const kept = stamped(record);
  return new Promise((resolve) => {
    try {
      const tx = d.transaction(SCREENS, "readwrite");
      tx.objectStore(SCREENS).add(kept);
      tx.oncomplete = () => {
        syncHooks()?.screensKept([kept]);
        resolve(true);
      };
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/** A screen by id; null when it's missing, unreadable, or from an older result schema. */
export async function getScreen(id: string): Promise<ScreenRecord | null> {
  const r = await readScreen(id);
  return r.kind === "ok" ? r.record : null;
}

/**
 * A kept screen as read back: readable; gone (missing, or not the current result schema: v3's clean break, B2a);
 * or this browser keeps nothing (no IndexedDB), when nothing can be said about it.
 */
export type ReadScreen = { kind: "ok"; record: ScreenRecord } | { kind: "gone" } | { kind: "unavailable" };

export async function readScreen(id: string): Promise<ReadScreen> {
  const d = await openDb();
  if (!d) return { kind: "unavailable" };
  const raw = await new Promise<unknown>((resolve) => {
    try {
      const req = d.transaction(SCREENS, "readonly").objectStore(SCREENS).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  // Not on this device, and it's joined: the synced space may have it (step 5: screens come as they're opened).
  const fetched = raw == null ? await syncHooks()?.fetchScreen(id) : null;
  const r = ScreenRecordSchema.safeParse(fetched ?? raw);
  return r.success ? { kind: "ok", record: r.data as ScreenRecord } : { kind: "gone" };
}

/**
 * Whether a parcel's last kept screen calls for a re-screen when the parcel is opened (owner, #101, 2026-10-11): it
 * is gone, or from earlier rules. Only the parcel being opened, never a batch over History.
 */
export const needsRescreen = (r: ReadScreen): boolean =>
  r.kind === "gone" || (r.kind === "ok" && fromEarlierRules(r.record));

/**
 * Deletes every kept screen that doesn't read as the current result schema (v3's clean break, B2a; phase-0.md
 * §9.26): no migration. Resolves to their ids, for the one-time message; [] when there were none or nothing is kept.
 */
export async function clearUnreadableScreens(): Promise<string[]> {
  const d = await openDb();
  if (!d) return [];
  return new Promise((resolve) => {
    const ids: string[] = [];
    try {
      const tx = d.transaction(SCREENS, "readwrite");
      const req = tx.objectStore(SCREENS).openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return;
        if (!ScreenRecordSchema.safeParse(c.value).success) {
          ids.push(String(c.key));
          c.delete();
        }
        c.continue();
      };
      tx.oncomplete = () => resolve(ids);
      tx.onerror = () => resolve([]);
      tx.onabort = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

/** The screens with these ids that are kept and readable, in the same order (export, 16b). */
export async function getScreens(ids: readonly string[]): Promise<ScreenRecord[]> {
  const all = await Promise.all(ids.map(getScreen));
  return all.filter((r): r is ScreenRecord => r !== null);
}

/**
 * Keeps imported screens, all in one transaction: either every one is kept or none is (16b's all or nothing).
 * `put`, not `add`: an id names one immutable screen, so one already here is the same record.
 */
export async function putScreens(records: readonly ScreenRecord[]): Promise<boolean> {
  if (records.length === 0) return true;
  const d = await openDb();
  if (!d) return false;
  return new Promise((resolve) => {
    try {
      const tx = d.transaction(SCREENS, "readwrite");
      const store = tx.objectStore(SCREENS);
      const kept = records.map(stamped);
      for (const r of kept) store.put(r);
      tx.oncomplete = () => {
        syncHooks()?.screensKept(kept);
        resolve(true);
      };
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}
