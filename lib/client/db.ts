/**
 * The browser's IndexedDB `parcelscreen` (step 14 plan Q2; profiles since roadmap step 1, PR 4): `screens`, one record
 * per kept screen, keyed by id and indexed by the profile it belongs to; `profiles`, one row per local profile; and
 * `docs`, a profile's documents (its parcels, settings, rubric and views), keyed by [profile, key]. Opened once per
 * page. Storage can be missing or refused (private windows): then the opener resolves null, nothing is kept, and reads
 * find nothing (the app says so in the menu).
 */
export const DB_NAME = "parcelscreen";
/** 1: screens (step 14). 2: profiles and docs, and the screens' profile index (step 1, PR 4). */
export const DB_VERSION = 2;
export const SCREENS = "screens";
export const PROFILES = "profiles";
export const DOCS = "docs";
/** The screens index on their `profile`. */
export const BY_PROFILE = "by-profile";

let db: Promise<IDBDatabase | null> | null = null;

export function openDb(): Promise<IDBDatabase | null> {
  db ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        const screens = d.objectStoreNames.contains(SCREENS)
          ? req.transaction!.objectStore(SCREENS)
          : d.createObjectStore(SCREENS, { keyPath: "id" });
        if (!d.objectStoreNames.contains(PROFILES)) d.createObjectStore(PROFILES, { keyPath: "id" });
        if (!d.objectStoreNames.contains(DOCS)) d.createObjectStore(DOCS, { keyPath: ["profile", "key"] });
        if (!screens.indexNames.contains(BY_PROFILE)) screens.createIndex(BY_PROFILE, "profile");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return db;
}

/** A transaction's completion as a promise. */
export const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });

/** A request's result as a promise. */
export const result = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
