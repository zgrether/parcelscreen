"use client";
/**
 * Which surface the map shows (proto `overlayMode`, `ps.omode`): house, garden, slope or off. Shared by the
 * right-hand column's cycle button and the Surface row in Info › Layers. A UI pref: never part of a screen.
 */
import { useSyncExternalStore } from "react";
import { getPref, setPref, type Prefs } from "@/lib/client/prefs";

export type SurfaceChoice = Prefs["ps.omode"];
/** The prototype's cycle order (L540). */
export const SURFACE_CYCLE: readonly SurfaceChoice[] = ["house", "garden", "slope", "off"];

let current: SurfaceChoice | null = null;
const listeners = new Set<() => void>();
const snapshot = () => (current ??= getPref("ps.omode"));

export function setSurfaceMode(mode: SurfaceChoice): void {
  current = mode;
  setPref("ps.omode", mode);
  listeners.forEach((l) => l());
}

export const nextSurface = (mode: SurfaceChoice): SurfaceChoice =>
  SURFACE_CYCLE[(SURFACE_CYCLE.indexOf(mode) + 1) % SURFACE_CYCLE.length]!;

export function useSurfaceMode(): SurfaceChoice {
  return useSyncExternalStore(
    (changed) => {
      listeners.add(changed);
      return () => listeners.delete(changed);
    },
    snapshot,
    snapshot,
  );
}
