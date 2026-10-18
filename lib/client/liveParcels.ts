/**
 * The parcels an export reads and an import adds to (step 4b): Settings' Your data works from any page. On the map,
 * the explorer holds the parcels in memory and saves them as they change, so it registers itself here and an import
 * goes through it; on any other page, the stored parcels are read and written directly.
 */
import { EMPTY_STORE, type ParcelStore, type WorkingParcel } from "./parcelStore";
import { getPref, setPref } from "./prefs";

export interface LiveParcels {
  /** The parcels as the explorer has them now. */
  store(): ParcelStore;
  /** Adds an import's parcels; the open parcel isn't changed. */
  importParcels(added: WorkingParcel[]): void;
}

let live: LiveParcels | null = null;

/** The explorer, while it's mounted. Returns the unregister. */
export function registerLiveParcels(l: LiveParcels): () => void {
  live = l;
  return () => {
    if (live === l) live = null;
  };
}

export const currentParcels = (): ParcelStore => live?.store() ?? getPref("ps.parcels") ?? EMPTY_STORE;

export function addImportedParcels(added: WorkingParcel[]): void {
  if (!added.length) return;
  if (live) return live.importParcels(added);
  const s = currentParcels();
  setPref("ps.parcels", { ...s, built: [...s.built, ...added] });
}
