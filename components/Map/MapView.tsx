"use client";
/**
 * The MapLibre map: created once, view persisted (ps.view), shared with child controls through context.
 * Children render inside the map's container, so they can position themselves over it.
 */
import "maplibre-gl/dist/maplibre-gl.css";
import { AttributionControl, Map as MlMap, setWorkerUrl } from "maplibre-gl";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { SHEET_QUERY } from "@/components/Explore/useBottomSheet";
import { getPref, setPref } from "@/lib/client/prefs";
import { buildStyle, isBasemapId } from "./style";

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
const START = { lat: 36.62, lon: -81.35, z: 9 };

export function MapView({
  lpAtlasTiles,
  lpYear,
  bottomInset = 0,
  rightInset = 0,
  onMap,
  children,
}: {
  lpAtlasTiles: string;
  lpYear: number;
  /** Pixels of the map hidden under the bottom sheet: the view's centre stays in the visible part. */
  bottomInset?: number;
  /** Pixels of the map covered by the docked Info panel: fits and fly-tos land in the part still visible. */
  rightInset?: number;
  /** Called with the map once its style has loaded, and with null when it goes away. */
  onMap?: (map: MlMap | null) => void;
  children?: ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const padded = useRef<{ bottom: number; right: number } | null>(null);

  useEffect(() => {
    const view = getPref("ps.view") ?? START;
    const base = getPref("ps.base");
    const m = new MlMap({
      container: container.current!,
      style: buildStyle({ base: isBasemapId(base) ? base : "state", lpAtlasTiles, lpYear }),
      center: [view.lon, view.lat],
      zoom: view.z,
      maxZoom: 20,
      attributionControl: false,
    });
    // No + / − buttons: the zoom slider in the right-hand column replaces them (13f).
    // Up top, beside the Map menu, rather than hanging over the toolbar (owner, 13e-5 review).
    m.addControl(new AttributionControl({ compact: true }), "top-right");
    const attribution = m.getContainer().querySelector<HTMLElement>(".maplibregl-ctrl-attrib");
    if (attribution && window.matchMedia(SHEET_QUERY).matches) startFolded(attribution);
    m.on("moveend", () => {
      const c = m.getCenter();
      setPref("ps.view", { lat: c.lat, lon: c.lng, z: m.getZoom() });
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
  // (owner, 13e-4 review), nothing on the map moves: the camera's centre, which is drawn in the middle of
  // the padded area, jumps to the point already showing there. Later fits and fly-tos then use the padding.
  useEffect(() => {
    if (!map) return;
    const prev = padded.current;
    const padding = { top: 0, left: 0, right: rightInset, bottom: bottomInset };
    if (!prev) map.jumpTo({ padding });
    else if (prev.right !== rightInset) {
      const { width, height } = map.getContainer().getBoundingClientRect();
      map.jumpTo({ center: map.unproject([(width - rightInset) / 2, (height - bottomInset) / 2]), padding });
    } else if (prev.bottom !== bottomInset) map.easeTo({ padding, duration: 180 });
    padded.current = { bottom: bottomInset, right: rightInset };
  }, [map, bottomInset, rightInset]);

  useEffect(() => onMap?.(map), [map, onMap]);

  return (
    <div className="absolute inset-0 bg-[#cfd6cb]">
      {/* MapLibre styles its container as position: relative, so it gets its own full-size element. */}
      <div ref={container} className="h-full w-full" />
      <MapContext.Provider value={map}>{children}</MapContext.Provider>
    </div>
  );
}
