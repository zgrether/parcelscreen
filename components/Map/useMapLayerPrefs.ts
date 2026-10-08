"use client";
/**
 * The basemap and the roads & labels toggle (step 17d), shared by the places they're shown (the Map ▾ menu
 * and Info › Layers) and the map itself, like useTerrainPrefs. UI prefs per device, never part of UserConfig
 * or a run's settings.
 */
import { useSyncExternalStore } from "react";
import { getPref, setPref } from "@/lib/client/prefs";
import { ROAD_BASEMAPS } from "./roadsStyle";
import { isBasemapId, type BasemapId } from "./style";

export interface MapLayerPrefs {
  base: BasemapId;
  /** The user's choice; the roads only show over the aerials (roadsShown). */
  roads: boolean;
}

/** Topo and Streets already draw roads and names: the overlay is for the aerials (owner, 17d §7). */
export const roadsAvailable = (base: BasemapId): boolean =>
  (ROAD_BASEMAPS as readonly string[]).includes(base);
export const roadsShown = (p: MapLayerPrefs): boolean => p.roads && roadsAvailable(p.base);

function read(): MapLayerPrefs {
  const b = getPref("ps.base");
  return { base: isBasemapId(b) ? b : "state", roads: getPref("ps.roads") };
}

let current: MapLayerPrefs | null = null;
const listeners = new Set<() => void>();
const snapshot = () => (current ??= read());

export function setMapLayerPrefs(patch: Partial<MapLayerPrefs>): void {
  current = { ...snapshot(), ...patch };
  if (patch.base !== undefined) setPref("ps.base", patch.base);
  if (patch.roads !== undefined) setPref("ps.roads", patch.roads);
  listeners.forEach((l) => l());
}

/** The current prefs, read once on the server and in the first render (getPref falls back to defaults). */
export const mapLayerPrefs = (): MapLayerPrefs => snapshot();

export function useMapLayerPrefs(): MapLayerPrefs {
  return useSyncExternalStore(
    (changed) => {
      listeners.add(changed);
      return () => listeners.delete(changed);
    },
    snapshot,
    snapshot,
  );
}
