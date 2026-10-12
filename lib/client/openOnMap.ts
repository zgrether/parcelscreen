/**
 * Opens a History parcel on the map from another page (Compare, the rulebook): it becomes the store's open parcel, with
 * the view on it. The caller's link then goes to the explorer, which reads both when it mounts.
 */
import { bbox } from "@turf/turf";
import { deriveParcel } from "@/lib/geo/recipe";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import { openBuilt, recipeOf, type WorkingParcel } from "./parcelStore";
import { getPref, setPref } from "./prefs";

export function openOnMap(p: WorkingParcel): void {
  const store = getPref("ps.parcels");
  if (!store || !p.key) return;
  setPref("ps.parcels", openBuilt(store, p.key));
  const d = deriveParcel(recipeOf(p), SCREEN_CONSTANTS.combine);
  if (d.ok) {
    const [w, s, e, n] = bbox(d.record.geo);
    setPref("ps.view", { lat: (s + n) / 2, lon: (w + e) / 2, z: 15 });
  }
}
