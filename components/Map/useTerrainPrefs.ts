"use client";
/**
 * The terrain preview's settings (step 13g plan §4), shared by the two places they're shown (Info › Layers and
 * the Map ▾ menu) and the map itself. Saved per device as UI prefs; never part of UserConfig or a run's
 * settings, so toggling them can't mark a screen out of date.
 */
import { useSyncExternalStore } from "react";
import { SHEET_QUERY } from "@/components/Explore/useBottomSheet";
import { getPref, setPref } from "@/lib/client/prefs";
import type { Exaggeration } from "./terrainStyle";

export interface TerrainPrefs {
  terrain: boolean;
  exaggeration: Exaggeration;
  hillshade: boolean;
  contours: boolean;
}

/** Hillshade and contours fetch z15 DEM tiles: on by default on desktop, off on phones (owner, 13g). */
const onByDefault = () => typeof window === "undefined" || !window.matchMedia(SHEET_QUERY).matches;

function read(): TerrainPrefs {
  const t = getPref("ps.terrain");
  return {
    terrain: t.on,
    exaggeration: t.exaggeration,
    hillshade: getPref("ps.hillshade") ?? onByDefault(),
    contours: getPref("ps.contours") ?? onByDefault(),
  };
}

let current: TerrainPrefs | null = null;
const listeners = new Set<() => void>();
const snapshot = () => (current ??= read());

export function setTerrainPrefs(patch: Partial<TerrainPrefs>): void {
  const next = { ...snapshot(), ...patch };
  current = next;
  if ("terrain" in patch || "exaggeration" in patch)
    setPref("ps.terrain", { on: next.terrain, exaggeration: next.exaggeration });
  if ("hillshade" in patch) setPref("ps.hillshade", next.hillshade);
  if ("contours" in patch) setPref("ps.contours", next.contours);
  listeners.forEach((l) => l());
}

export function useTerrainPrefs(): TerrainPrefs {
  return useSyncExternalStore(
    (changed) => {
      listeners.add(changed);
      return () => listeners.delete(changed);
    },
    snapshot,
    snapshot,
  );
}
