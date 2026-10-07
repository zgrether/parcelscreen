/**
 * Screens kept in the browser for Phase 0 (step 14 plan Q2): IndexedDB, one record per screen, keyed by the
 * same ids as each parcel's `screenIds` (lib/client/parcelStore.ts). A record is added once and never
 * changed: a re-run, or a re-assessed house, is a new record with a new id, as Phase 1's `screens` rows are.
 * localStorage would be too small: a result with its soil-unit geometry runs to hundreds of KB.
 *
 * Storage can be missing or refused (private windows); then nothing is kept and reads find nothing.
 */
import { z } from "zod";
import { ScreenResultSchema, type ScreenResult } from "../screen/types";
import type { RunKeys } from "./screenKeys";

export interface ScreenRecord {
  id: string;
  /** What the screen was run on (lib/client/screenKeys.ts). */
  keys: RunKeys;
  result: ScreenResult;
}

export const ScreenRecordSchema = z.object({
  id: z.string(),
  keys: z.object({ boundary: z.string(), house: z.string(), settings: z.string() }),
  result: ScreenResultSchema,
});

const DB_NAME = "parcelscreen";
const STORE = "screens";
const VERSION = 1;

let db: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  db ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return db;
}

/** Adds a screen. Resolves false when it couldn't be kept. */
export async function addScreen(record: ScreenRecord): Promise<boolean> {
  const d = await open();
  if (!d) return false;
  return new Promise((resolve) => {
    try {
      const tx = d.transaction(STORE, "readwrite");
      tx.objectStore(STORE).add(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/** A screen by id; null when it's missing, unreadable, or from an older result schema. */
export async function getScreen(id: string): Promise<ScreenRecord | null> {
  const d = await open();
  if (!d) return null;
  const raw = await new Promise<unknown>((resolve) => {
    try {
      const req = d.transaction(STORE, "readonly").objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  const r = ScreenRecordSchema.safeParse(raw);
  return r.success ? (r.data as ScreenRecord) : null;
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
  const d = await open();
  if (!d) return false;
  return new Promise((resolve) => {
    try {
      const tx = d.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const r of records) store.put(r);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}
