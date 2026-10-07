"use client";
/**
 * Draw, Combine and Split work on a flat map (step 13g plan §4): corners, the 14 px snapping and the split
 * handles are placed in screen space, and a tilted view squeezes their spacing. On entry the camera eases to
 * pitch 0 (keeping the bearing) and the pitch is locked; on exit it eases back to the pitch it had, unless
 * the compass reset the view meanwhile.
 */
import { useEffect, useRef } from "react";
import type { Map as MlMap } from "maplibre-gl";
import { MAX_PITCH } from "./terrainStyle";

const EASE_MS = 300;

/** How many times the compass has reset each map's view (MapControls calls noteViewReset). */
const resets = new WeakMap<MlMap, number>();
export const noteViewReset = (map: MlMap): void => void resets.set(map, (resets.get(map) ?? 0) + 1);

export function useFlatForTools(map: MlMap | null, active: boolean): void {
  const before = useRef<number | null>(null);
  const resetsAtEntry = useRef(0);

  useEffect(() => {
    if (!map) return;
    if (active && before.current === null) {
      before.current = map.getPitch();
      resetsAtEntry.current = resets.get(map) ?? 0;
      // Lock once flat: setting the limit while still tilted would jump rather than ease.
      const lock = () => {
        if (before.current !== null) map.setMaxPitch(0);
      };
      if (before.current > 0) {
        map.easeTo({ pitch: 0, duration: EASE_MS });
        map.once("moveend", lock);
      } else lock();
    } else if (!active && before.current !== null) {
      const pitch = before.current;
      before.current = null;
      map.setMaxPitch(MAX_PITCH);
      const wasReset = (resets.get(map) ?? 0) !== resetsAtEntry.current;
      if (!wasReset && pitch > 0) map.easeTo({ pitch, duration: EASE_MS });
    }
  }, [map, active]);
}
