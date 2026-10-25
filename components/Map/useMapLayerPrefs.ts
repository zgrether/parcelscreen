"use client";
/**
 * The basemap and the map's layer toggles (dim, parcel lines, roads & labels, light pollution, lidar terrain), shared by the
 * map panel (17e; Map layers since step 8b) and the map itself, like useTerrainPrefs. UI prefs per device, never part of
 * UserConfig or a run's settings. The light-pollution overlay starts off each visit, as before.
 */
import { useSyncExternalStore } from "react";
import { getPref, setPref, type LidarPref } from "@/lib/client/prefs";
import { ROAD_BASEMAPS } from "./roadsStyle";
import { isBasemapId, type BasemapId } from "./style";

export interface MapLayerPrefs {
  base: BasemapId;
  /** The user's choice; the roads only show over the aerials (roadsShown). */
  roads: boolean;
  dim: boolean;
  lines: boolean;
  /** Your lines and marks (step 8b): the open parcel's lines, marks and house site. */
  marks: boolean;
  /** Not saved: off at each visit (13f). */
  lightPollution: boolean;
  /** Step 13: every area's outline (starred areas' show whatever this says). */
  areas: boolean;
  /** Step 14: the power lines near the graded parcel (off). */
  power: boolean;
  /** Step 14c: lidar terrain, its style and opacity (off, Shaded relief, 60%). */
  lidar: LidarPref;
}

/** Topo and Streets already draw roads and names: the overlay is for the aerials (owner, 17d §7). */
export const roadsAvailable = (base: BasemapId): boolean =>
  (ROAD_BASEMAPS as readonly string[]).includes(base);
export const roadsShown = (p: MapLayerPrefs): boolean => p.roads && roadsAvailable(p.base);

function read(): MapLayerPrefs {
  const b = getPref("ps.base");
  return {
    base: isBasemapId(b) ? b : "state",
    roads: getPref("ps.roads"),
    dim: getPref("ps.dim"),
    lines: getPref("ps.lines"),
    marks: getPref("ps.marks"),
    lightPollution: false,
    areas: getPref("ps.areas"),
    power: getPref("ps.power"),
    lidar: getPref("ps.lidar"),
  };
}

let current: MapLayerPrefs | null = null;
const listeners = new Set<() => void>();
const snapshot = () => (current ??= read());

export function setMapLayerPrefs(patch: Partial<MapLayerPrefs>): void {
  current = { ...snapshot(), ...patch };
  if (patch.base !== undefined) setPref("ps.base", patch.base);
  if (patch.roads !== undefined) setPref("ps.roads", patch.roads);
  if (patch.dim !== undefined) setPref("ps.dim", patch.dim);
  if (patch.lines !== undefined) setPref("ps.lines", patch.lines);
  if (patch.marks !== undefined) setPref("ps.marks", patch.marks);
  if (patch.areas !== undefined) setPref("ps.areas", patch.areas);
  if (patch.power !== undefined) setPref("ps.power", patch.power);
  if (patch.lidar !== undefined) setPref("ps.lidar", patch.lidar);
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
