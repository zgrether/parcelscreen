/**
 * Opens a saved parcel on the map from another page (Your list, Compare, the rulebook). The caller's link then goes to
 * the map. When the explorer is mounted (it stays mounted behind the tabs, step 4b), it opens the parcel itself, which
 * fits the view to it; otherwise the parcel becomes the stored open one, with the view on it, read when the map mounts.
 */
import { bbox } from "@turf/turf";
import { deriveParcel } from "@/lib/geo/recipe";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import { openBuilt, recipeOf, type WorkingParcel } from "./parcelStore";
import { openLive } from "./liveParcels";
import { getPref, setPref } from "./prefs";

export function openOnMap(p: WorkingParcel): void {
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
