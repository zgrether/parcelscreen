"use client";
/**
 * The MapLibre map: created once, view persisted (ps.view, with bearing and pitch from 13g), shared with child
 * controls through context. Rotate and pitch are MapLibre's defaults (right-drag or Ctrl-drag; two fingers).
 * Children render inside the map's container, so they can position themselves over it.
 */
import "maplibre-gl/dist/maplibre-gl.css";
import { AttributionControl, Map as MlMap, setWorkerUrl } from "maplibre-gl";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { SHEET_QUERY } from "@/components/Explore/useBottomSheet";
import { getPref, setPref, type MapView as SavedView } from "@/lib/client/prefs";
import { buildStyle, isBasemapId } from "./style";
import { terrainTiles } from "./terrain";
import { MAX_PITCH } from "./terrainStyle";

// MapLibre's worker is served from public/ (scripts/copy-maplibre-worker.mjs copies it there).
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const MapContext = createContext<MlMap | null>(null);

/** The map, once its style has loaded (null before); tiles may still be arriving. */
export const useMap = (): MlMap | null => useContext(MapContext);

/**
 * Keeps MapLibre's compact attribution folded to its ⓘ until it's tapped. MapLibre opens it on load, and
 * again when the credits fill in as sources load; on a phone it would cover the search box.
 */
function startFolded(el: HTMLElement): void {
  const SHOW = "maplibregl-compact-show";
  const fold = () => {
    if (el.classList.contains(SHOW)) el.classList.remove(SHOW);
  };
  const watch = new MutationObserver(fold);
  watch.observe(el, { attributes: true, attributeFilter: ["class"] });
  fold();
  // The first tap is the user's: from then on it opens and closes as usual.
  el.addEventListener("click", () => watch.disconnect(), { once: true, capture: true });
}

/** The prototype's opening view: southwest Virginia, zoom 9. */
const START: SavedView = { lat: 36.62, lon: -81.35, z: 9 };

export function MapView({
  lpAtlasTiles,
  lpYear,
  bottomInset = 0,
  rightInset = 0,
  leftInset = 0,
  onMap,
  children,
}: {
  lpAtlasTiles: string;
  lpYear: number;
  /** Pixels of the map hidden under the bottom sheet: the view's centre stays in the visible part. */
  bottomInset?: number;
  /** Pixels of the map covered by the docked Info panel: fits and fly-tos land in the part still visible. */
  rightInset?: number;
  /** Pixels covered on the left by the results card or panel (desktop), likewise. */
  leftInset?: number;
  /** Called with the map once its style has loaded, and with null when it goes away. */
  onMap?: (map: MlMap | null) => void;
  children?: ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const padded = useRef<{ bottom: number; right: number; left: number } | null>(null);

  useEffect(() => {
    const view = getPref("ps.view") ?? START;
    const base = getPref("ps.base");
    const m = new MlMap({
      container: container.current!,
      style: buildStyle({
        base: isBasemapId(base) ? base : "state",
        lpAtlasTiles,
        lpYear,
        terrain: terrainTiles(),
      }),
      center: [view.lon, view.lat],
      zoom: view.z,
      bearing: view.b ?? 0,
      pitch: view.p ?? 0,
      maxZoom: 20,
      maxPitch: MAX_PITCH,
      attributionControl: false,
    });
    // No + / − buttons: the zoom slider in the right-hand column replaces them (13f).
    // Up top, beside the Map menu, rather than hanging over the toolbar (owner, 13e-5 review).
    m.addControl(new AttributionControl({ compact: true }), "top-right");
    // The headless checks (and step 18's e2e) read the map's camera and rendered features: with ps.debug set
    // in localStorage, the map is on window.__psMap. Never set in normal use.
    try {
      if (localStorage.getItem("ps.debug") === "1") (window as { __psMap?: MlMap }).__psMap = m;
    } catch {
      /* storage blocked: no debug handle */
    }
    const attribution = m.getContainer().querySelector<HTMLElement>(".maplibregl-ctrl-attrib");
    if (attribution && window.matchMedia(SHEET_QUERY).matches) startFolded(attribution);
    m.on("moveend", () => {
      const c = m.getCenter();
      setPref("ps.view", { lat: c.lat, lon: c.lng, z: m.getZoom(), b: m.getBearing(), p: m.getPitch() });
    });
    // Ready once the style's sources and layers exist. Not "load": that also waits for the first basemap
    // tiles, so one slow or dead tile host (the VA ortho, during an outage) kept every tool switched off.
    m.once("style.load", () => setMap(m));
    return () => {
      setMap(null);
      padded.current = null;
      m.remove();
    };
  }, [lpAtlasTiles, lpYear]);

  // The map's padding keeps the view's centre in the part that's visible. When the sheet settles, the centre
  // eases into the visible part with the sheet's snap; at load, at once. When the Info panel docks or leaves
  // (owner, 13e-4 review), or the results card grows into the panel or folds back (owner, after 14d), nothing
  // on the map moves: the camera's centre, which is drawn in the middle of
  // the padded area, jumps to the point already showing there. Later fits and fly-tos then use the padding.
  useEffect(() => {
    if (!map) return;
    const prev = padded.current;
    const padding = { top: 0, left: leftInset, right: rightInset, bottom: bottomInset };
    if (!prev) map.jumpTo({ padding });
    else if (prev.right !== rightInset || prev.left !== leftInset) {
      const { width, height } = map.getContainer().getBoundingClientRect();
      const x = (leftInset + width - rightInset) / 2;
      map.jumpTo({ center: map.unproject([x, (height - bottomInset) / 2]), padding });
    } else if (prev.bottom !== bottomInset) map.easeTo({ padding, duration: 180 });
    padded.current = { bottom: bottomInset, right: rightInset, left: leftInset };
  }, [map, bottomInset, rightInset, leftInset]);

  useEffect(() => onMap?.(map), [map, onMap]);

  return (
    <div className="absolute inset-0 bg-[#cfd6cb]">
      {/* MapLibre styles its container as position: relative, so it gets its own full-size element. */}
      <div ref={container} className="h-full w-full" />
      <MapContext.Provider value={map}>{children}</MapContext.Provider>
    </div>
  );
}
