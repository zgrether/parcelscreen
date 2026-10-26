"use client";
/**
 * Map layers › Places (roadmap step 14d, docs/plans/step-14d-places.md §5): the toggle, then (while it's on) a toggle
 * row for each kind, every one on at first, each with its map icon: the key to the map. Remembered per device
 * (ps.places).
 */
import { PLACE_KINDS, PLACES_WORDS as W, type PlaceKind } from "@/lib/places/layer";
import { PlaceIconSvg, type PlaceIcon } from "./placeIcons";
import { setMapLayerPrefs, useMapLayerPrefs } from "./useMapLayerPrefs";

/** The icons beside each kind's toggle: a launch shows both, lake then river. */
const KEY: Record<PlaceKind, readonly PlaceIcon[]> = {
  er: ["er"],
  airport: ["airport"],
  trailhead: ["trailhead"],
  grocery: ["grocery"],
  longTrail: ["longTrail"],
  launch: ["launchFlat", "launchRiver"],
};

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
              {KEY[k].map((i) => (
                <PlaceIconSvg key={i} icon={i} />
              ))}
              {W.kinds[k]}
            </button>
          ))}
          {places.kinds.launch && <p className="tiny places-key-note">{W.launchKey}</p>}
        </div>
      )}
    </>
  );
}
