"use client";
/**
 * The map's layers as the map draws them (proto L250–265, L522–560): the basemap, dim, parcel lines, roads &
 * labels (17d) and light pollution, from the shared prefs (useMapLayerPrefs). They're switched in the map
 * panel (17e: MapPanel.tsx, which replaced the "Map ▾" menu) and in Info › Layers; this component only applies
 * them. Basemap, dim, parcel lines and roads persist; the light-pollution overlay starts off each visit.
 */
import { useEffect } from "react";
import { useMap } from "./MapView";
import { ROAD_LAYERS } from "./roadsStyle";
import { BASEMAPS, basemapLayerIds, LAYER } from "./style";
import { roadsShown, useMapLayerPrefs } from "./useMapLayerPrefs";
import { useParcelLines } from "./useParcelLines";

type Hint = (text: string | ((prev: string) => string)) => void;

export function MapTools({ parcelServices, hint }: { parcelServices: readonly string[]; hint: Hint }) {
  const map = useMap();
  const p = useMapLayerPrefs();
  const showRoads = roadsShown(p);

  useEffect(() => {
    if (!map) return;
    for (const b of BASEMAPS)
      for (const id of basemapLayerIds(b.id))
        map.setLayoutProperty(id, "visibility", b.id === p.base ? "visible" : "none");
  }, [map, p.base]);

  // Roads & labels (17d): over the aerials, when switched on.
  useEffect(() => {
    if (!map) return;
    for (const id of ROAD_LAYERS)
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", showRoads ? "visible" : "none");
  }, [map, showRoads]);

  useEffect(() => {
    map?.setLayoutProperty(LAYER.scrim, "visibility", p.dim ? "visible" : "none");
  }, [map, p.dim]);

  useEffect(() => {
    map?.setLayoutProperty(LAYER.lightPollution, "visibility", p.lightPollution ? "visible" : "none");
  }, [map, p.lightPollution]);

  useParcelLines(map, p.lines, parcelServices, hint);
  return null;
}

/**
 * The map's hint line. `ownRecords` marks the hint over a Tennessee county with no parcel source: it takes the width
 * the map leaves it, and the parcel toolbar below drops "Tap a parcel to select it" while it shows, leaving its one
 * "Draw a custom parcel" button (the Tennessee counties mission's fresh-eyes review).
 */
export function Hint({ text, ownRecords = false }: { text: string; ownRecords?: boolean }) {
  if (!text) return null;
  return (
    <div
      className={`map-hint absolute left-2.5 z-10 ${ownRecords ? "map-hint--own" : "max-w-[70%]"} rounded bg-[rgba(28,38,32,.86)] px-2.5 py-1.5 text-[13px] text-white`}
    >
      {text}
    </div>
  );
}
