/**
 * Opens a saved parcel on the map from another page (Your list, Recent, Compare, the rulebook). The caller's link then
 * goes to the map. When the explorer is mounted (it stays mounted behind the tabs, step 4b), it opens the parcel itself,
 * which fits the view to it; otherwise the parcel becomes the stored open one, with the view on it, read when the map
 * mounts. UX part 2 (Z-2): this is the one way a saved parcel opens, with the one panel; a "‹ Your list" chip on the map
 * goes back to where the tap came from (§9 Q1).
 */
import { bbox } from "@turf/turf";
import { deriveParcel } from "@/lib/geo/recipe";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import { openBuilt, recipeOf, type WorkingParcel } from "./parcelStore";
import { openLive } from "./liveParcels";
import { getPref, setPref } from "./prefs";

/** Where the map's back chip goes: its words, the page, the parcel it's for, and the page's scroll to restore. */
export interface BackTo {
  label: string;
  href: string;
  key: string;
  scroll: number;
}

const BACK_KEY = "ps.backTo";

/** The back chip's target for this tab; null when there's none (or storage isn't there). */
export function backTo(): BackTo | null {
  try {
    const raw = sessionStorage.getItem(BACK_KEY);
    return raw ? (JSON.parse(raw) as BackTo) : null;
  } catch {
    return null;
  }
}

export function clearBackTo(): void {
  try {
    sessionStorage.removeItem(BACK_KEY);
  } catch {
    // Without session storage there's no chip to clear.
  }
}

/** The scroll a page left at, once: Your list restores it when the back chip brings the person back. */
export function takeBackScroll(href: string): number | null {
  const b = backTo();
  if (!b || b.href !== href) return null;
  clearBackTo();
  return b.scroll;
}

export function openOnMap(p: WorkingParcel, from?: Omit<BackTo, "key">): void {
  if (from && p.key) {
    try {
      sessionStorage.setItem(BACK_KEY, JSON.stringify({ ...from, key: p.key } satisfies BackTo));
    } catch {
      // No chip without session storage; the tabs still go back.
    }
  }
  if (p.key && openLive(p.key)) return;
  const store = getPref("ps.parcels");
  if (!store || !p.key) return;
  setPref("ps.parcels", openBuilt(store, p.key));
  const d = deriveParcel(recipeOf(p), SCREEN_CONSTANTS.combine);
  if (d.ok) {
    const [w, s, e, n] = bbox(d.record.geo);
    setPref("ps.view", { lat: (s + n) / 2, lon: (w + e) / 2, z: 15 });
  }
}
