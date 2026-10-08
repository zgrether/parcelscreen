"use client";
/**
 * "Roads & labels" (step 17d): a row in the map panel's map layers (17e) and its own group in Info › Layers;
 * both edit the same pref. Over Topo and Streets, which draw their own roads, it shows as unavailable.
 */
import { roadsAvailable, setMapLayerPrefs, useMapLayerPrefs } from "./useMapLayerPrefs";

export const ROADS_LABEL = "Roads & labels";

export function RoadsToggle({ variant }: { variant: "info" | "row" }) {
  const p = useMapLayerPrefs();
  const available = roadsAvailable(p.base);
  const button = (
    <button
      className="tc-toggle"
      aria-pressed={p.roads && available}
      disabled={!available}
      title={available ? undefined : "This basemap draws its own roads"}
      onClick={() => setMapLayerPrefs({ roads: !p.roads })}
    >
      {available ? ROADS_LABEL : `${ROADS_LABEL} (in the basemap)`}
    </button>
  );
  return variant === "info" ? (
    <div className="terrain-controls info" role="group" aria-label={ROADS_LABEL}>
      {button}
    </div>
  ) : (
    button
  );
}
