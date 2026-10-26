"use client";
/**
 * Map layers › Places (roadmap step 14d, docs/plans/step-14d-places.md §5): the toggle, then (while it's on) a toggle
 * row for each kind, every one on at first. Remembered per device (ps.places).
 */
import { PLACE_KINDS, PLACES_WORDS as W } from "@/lib/places/layer";
import { setMapLayerPrefs, useMapLayerPrefs } from "./useMapLayerPrefs";

export function PlacesControls() {
  const { places } = useMapLayerPrefs();
  return (
    <>
      <button
        className="tc-toggle"
        aria-pressed={places.on}
        onClick={() => setMapLayerPrefs({ places: { ...places, on: !places.on } })}
      >
        {W.toggle}
      </button>
      {places.on && (
        <div className="lidar-controls places-controls" role="group" aria-label="Places shown">
          {PLACE_KINDS.map((k) => (
            <button
              key={k}
              className="tc-toggle"
              aria-pressed={places.kinds[k]}
              onClick={() =>
                setMapLayerPrefs({ places: { ...places, kinds: { ...places.kinds, [k]: !places.kinds[k] } } })
              }
            >
              {W.kinds[k]}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
