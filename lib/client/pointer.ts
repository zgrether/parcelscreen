"use client";
/**
 * The device's word for a press (polish 2, M5): "Click" where a pointer hovers, "Tap" on a touch screen, so the map's
 * how-to lines don't say "Tap" to a mouse. Before hydration it's "Tap", the phone's.
 */
import { useSyncExternalStore } from "react";

export type TapWord = "Tap" | "Click";

const QUERY = "(hover: hover)";

function subscribe(cb: () => void): () => void {
  const m = window.matchMedia(QUERY);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

export const useTapWord = (): TapWord =>
  useSyncExternalStore(
    subscribe,
    () => (window.matchMedia(QUERY).matches ? "Click" : "Tap"),
    () => "Tap",
  );
