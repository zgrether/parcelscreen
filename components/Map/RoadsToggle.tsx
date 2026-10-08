"use client";
/**
 * "Roads & labels" (step 17d): in the Map ▾ menu (light, beside Dim map and Parcel lines) and in Info › Layers
 * (dark, with the terrain controls); both edit the same pref. Over Topo and Streets, which draw their own
 * roads, it shows as unavailable.
 */
import { roadsAvailable, setMapLayerPrefs, useMapLayerPrefs } from "./useMapLayerPrefs";

export const ROADS_LABEL = "Roads & labels";

export function RoadsToggle({ variant, className }: { variant: "info" | "menu"; className?: string }) {
  const p = useMapLayerPrefs();
  const available = roadsAvailable(p.base);
  const on = p.roads && available;
  const button = (
    <button
      className={
        variant === "info" ? "tc-toggle" : `${className ?? ""} disabled:cursor-default disabled:opacity-55`
      }
      aria-pressed={on}
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
