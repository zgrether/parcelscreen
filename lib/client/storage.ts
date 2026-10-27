/**
 * Persistent storage and the device's usage (step 14e, docs/plans/step-14e-offline.md §3.4). The browser may clear a
 * site's storage when space runs low unless it's persisted; Chrome grants that without asking an installed app, and
 * Firefox asks, so it's requested only after a deliberate act: the app installed, or the first Save offline, or Settings'
 * Keep offline data.
 */

export interface StorageInfo {
  /** Bytes this site uses (the app, its data and the map cache), and about how many it may use. */
  usage: number;
  quota: number;
  persisted: boolean;
}

const storage = (): StorageManager | null =>
  typeof navigator !== "undefined" && navigator.storage ? navigator.storage : null;

export async function storageInfo(): Promise<StorageInfo | null> {
  const s = storage();
  if (!s?.estimate) return null;
  try {
    const e = await s.estimate();
    return { usage: e.usage ?? 0, quota: e.quota ?? 0, persisted: (await s.persisted?.()) ?? false };
  } catch {
    return null;
  }
}

/** Asks for persistent storage; true when it's granted (now or before). */
export async function requestPersist(): Promise<boolean> {
  const s = storage();
  if (!s?.persist) return false;
  try {
    return (await s.persisted?.()) || (await s.persist());
  } catch {
    return false;
  }
}

/** The app opened from the home screen or as an installed window. */
export const isInstalled = (): boolean =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true);

/** iOS Safari, which clears a site's data after a week without use unless the app is on the Home Screen. */
export const isIosBrowser = (): boolean =>
  typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent) && !isInstalled();
