"use client";
/**
 * The area catalog in the app (step 13, docs/plans/step-13-area-catalog.md §3.3, §5a): the profiles, fetched from
 * public/areas/v2 the first time something shows them and kept for the session; the areas a profile starred; and
 * bringing an area into view, through the map when it's mounted (it stays mounted behind the tabs) or as the view the
 * map opens on.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { AreaFileSchema, AreaIndexSchema, AREAS_PATH, type AreaFile } from "@/lib/areas/types";
import { getPref, setPref } from "./prefs";

// ---------- the profiles ----------

export interface AreasState {
  state: "idle" | "loading" | "ready";
  files: AreaFile[];
  /** The areas whose file didn't load or didn't pass its schema. */
  failed: string[];
}

let current: AreasState = { state: "idle", files: [], failed: [] };
const listeners = new Set<() => void>();
const set = (s: AreasState) => {
  current = s;
  listeners.forEach((l) => l());
};

async function fetchJson(path: string): Promise<unknown> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

/** Fetches the index and every area's file; a file that fails is left out and named. Again on Try again. */
export async function loadAreas(): Promise<void> {
  if (current.state === "loading") return;
  set({ ...current, state: "loading" });
  try {
    const index = AreaIndexSchema.parse(await fetchJson(`${AREAS_PATH}/index.json`));
    const results = await Promise.allSettled(
      index.areas.map(async (a) => AreaFileSchema.parse(await fetchJson(`${AREAS_PATH}/${a.id}.json`))),
    );
    set({
      state: "ready",
      files: results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
      failed: index.areas.filter((_, i) => results[i]!.status === "rejected").map((a) => a.name),
    });
  } catch {
    set({ state: "ready", files: [], failed: ["the catalog"] });
  }
}

/** The profiles, loading them on first use (when `enabled`: the map's outlines wait until they're wanted). */
export function useAreas(enabled = true): AreasState & { retry(): void } {
  const s = useSyncExternalStore(
    (changed) => {
      listeners.add(changed);
      return () => listeners.delete(changed);
    },
    () => current,
    () => current,
  );
  useEffect(() => {
    if (enabled && current.state === "idle") void loadAreas();
  }, [enabled]);
  const retry = useCallback(() => {
    if (current.state !== "loading") {
      set({ state: "idle", files: [], failed: [] });
      void loadAreas();
    }
  }, []);
  return { ...s, retry };
}

// ---------- stars ----------

const starListeners = new Set<() => void>();
let stars: string[] | null = null;
const readStars = () => (stars ??= getPref("ps.areaStars"));

/** The profile's starred areas, and starring or unstarring one. */
export function useAreaStars(): { stars: readonly string[]; toggle(id: string): void } {
  const s = useSyncExternalStore(
    (changed) => {
      starListeners.add(changed);
      return () => starListeners.delete(changed);
    },
    readStars,
    () => [] as string[],
  );
  const toggle = useCallback((id: string) => {
    const now = readStars();
    stars = now.includes(id) ? now.filter((x) => x !== id) : [...now, id];
    setPref("ps.areaStars", stars);
    starListeners.forEach((l) => l());
  }, []);
  return { stars: s, toggle };
}

// ---------- bringing an area into view ----------

/** [west, south, east, north]. */
export type Box = [number, number, number, number];
let fit: ((box: Box) => void) | null = null;

/** The map, while it's mounted. Returns the unregister. */
export function registerAreaFocus(f: (box: Box) => void): () => void {
  fit = f;
  return () => {
    if (fit === f) fit = null;
  };
}

/** The zoom that fits a box about `km` across: zoom 10 shows about 40 km of a phone's width. */
const zoomFor = (km: number) => Math.max(8, Math.min(13, 10 - Math.log2(Math.max(km, 1) / 40)));

/** Shows an area: the map fits it when it's mounted; otherwise the map opens on it. */
export function focusArea(box: Box): void {
  if (fit) return fit(box);
  const [w, s, e, n] = box;
  const km = Math.max((n - s) * 111.2, (e - w) * 111.32 * Math.cos((s * Math.PI) / 180));
  setPref("ps.view", { lat: (s + n) / 2, lon: (w + e) / 2, z: zoomFor(km) });
}
