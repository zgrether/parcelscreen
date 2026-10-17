/**
 * A History parcel's screen input, as the explorer would run it (components/Results/panel/ScreenIt.tsx `run`): its
 * boundary from its recipe, its own land when the boundary bridges a gap, its house and its drawn lines, under the
 * Settings given. For the Library's "Re-screen all saved parcels" (step 1, PR 5b; approval A), which screens parcels
 * that aren't open on the map.
 */
import { deriveParcel } from "@/lib/geo/recipe";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import type { ScreenInput, UserConfig } from "@/lib/screen/types";
import { drawnInput, recipeOf, type WorkingParcel } from "./parcelStore";
import { runKeys, type RunKeys } from "./screenKeys";

/** The run's input and the keys its record carries; null when the boundary no longer builds (it can't be screened). */
export function rescreenInput(
  p: WorkingParcel,
  config: UserConfig,
): { input: ScreenInput; keys: RunKeys } | null {
  const d = deriveParcel(recipeOf(p), SCREEN_CONSTANTS.combine);
  if (!d.ok) return null;
  const polygon = d.record.geo.geometry;
  const lines = drawnInput(p.markup);
  // A boundary that bridges a strip between parts screens only the parts' own land (follow-up 29).
  const ownLand = d.bridgeAcres > 0 ? d.own.geometry : null;
  return {
    input: {
      polygon,
      config,
      ...(ownLand ? { ownLand } : {}),
      ...(p.house ? { house: p.house } : {}),
      ...(lines.length ? { lines } : {}),
    },
    keys: runKeys(polygon, p.house, config, lines),
  };
}
