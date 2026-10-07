"use client";
/**
 * Which result overlays show (step 15 plan §3): the eye toggles of the Analysis rows in Info › Layers. Saved
 * per device as UI prefs (`ps.overlays`), never part of a screen.
 */
import { useSyncExternalStore } from "react";
import { getPref, setPref, type OverlayPrefs } from "@/lib/client/prefs";

let current: OverlayPrefs | null = null;
const listeners = new Set<() => void>();
const snapshot = () => (current ??= getPref("ps.overlays"));

export function setOverlay(key: keyof OverlayPrefs, on: boolean): void {
  current = { ...snapshot(), [key]: on };
  setPref("ps.overlays", current);
  listeners.forEach((l) => l());
}

export function useOverlayPrefs(): OverlayPrefs {
  return useSyncExternalStore(
    (changed) => {
      listeners.add(changed);
      return () => listeners.delete(changed);
    },
    snapshot,
    snapshot,
  );
}
