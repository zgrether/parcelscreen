"use client";
/**
 * The surface image on the map (step 15a): house suitability, garden suitability or slope from the live run's
 * session, as a MapLibre image source placed by the grid's four corners. It drapes on the 13g terrain like
 * any raster. Under the contours and the parcel lines (plan §3); opacity 0.9 as in the prototype (L1230).
 * Only a live session has the surfaces: after a reload, or on another parcel, there's nothing to draw.
 */
import { useEffect, useMemo, useRef } from "react";
import type { ImageSource, Map as MlMap } from "maplibre-gl";
import { surfaceImage, type Corners, type SurfaceMode } from "@/lib/render/surface";
import type { SessionView } from "@/lib/screen/worker-protocol";
import { useScreenItContext } from "@/components/Results/ScreenItContext";
import { useMap } from "../MapView";
import { ROADS_LAYER } from "../roadsStyle";
import { LAYER } from "../style";
import { TERRAIN_LAYER } from "../terrainStyle";
import { useSurfaceMode } from "./useSurfaceMode";

export const SURFACE_SOURCE = "result-surface";
export const SURFACE_LAYER = "result-surface";

/** A PNG blob URL for an RGBA image (the image source wants a URL). */
async function toUrl(width: number, height: number, rgba: Uint8ClampedArray): Promise<string> {
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  return URL.createObjectURL(await canvas.convertToBlob({ type: "image/png" }));
}

/** Under the soil fills, then the contours, then the parcel lines (plan §3: terrain image < soil fills < contours). */
const beforeId = (map: MlMap) =>
  // Under the road lines (17d), which sit under the soil fills.
  [ROADS_LAYER.casing, LAYER.soilFill, TERRAIN_LAYER.contourLines, LAYER.parcelLinesFill].find((id) =>
    map.getLayer(id),
  )!;

export function SurfaceLayer() {
  const map = useMap();
  const view = useScreenItContext()?.view ?? null;
  const mode = useSurfaceMode();

  // Each mode's image is built once per session view, when first shown.
  const cache = useMemo(() => ({ view, urls: new Map<SurfaceMode, Promise<Built | null>>() }), [view]);
  useEffect(
    () => () => {
      for (const u of cache.urls.values()) void u.then((b) => b && URL.revokeObjectURL(b.url));
    },
    [cache],
  );

  const shown = useRef(0);
  useEffect(() => {
    if (!map) return;
    const ticket = ++shown.current;
    const clear = () => {
      if (map.getLayer(SURFACE_LAYER)) map.removeLayer(SURFACE_LAYER);
      if (map.getSource(SURFACE_SOURCE)) map.removeSource(SURFACE_SOURCE);
    };
    if (!view || mode === "off") {
      clear();
      return;
    }
    if (!cache.urls.has(mode)) cache.urls.set(mode, build(view, mode));
    void cache.urls.get(mode)!.then((built) => {
      if (ticket !== shown.current) return; // a newer view or mode took over
      if (!built) return clear();
      const { url, corners: coordinates } = built;
      const source = map.getSource<ImageSource>(SURFACE_SOURCE);
      if (source) source.updateImage({ url, coordinates });
      else {
        map.addSource(SURFACE_SOURCE, { type: "image", url, coordinates });
        map.addLayer(
          {
            id: SURFACE_LAYER,
            type: "raster",
            source: SURFACE_SOURCE,
            paint: { "raster-opacity": 0.9, "raster-fade-duration": 0 },
          },
          beforeId(map),
        );
      }
    });
  }, [map, view, mode, cache]);

  // Gone with the map's parcel: remove on unmount.
  useEffect(
    () => () => {
      if (!map) return;
      if (map.getLayer(SURFACE_LAYER)) map.removeLayer(SURFACE_LAYER);
      if (map.getSource(SURFACE_SOURCE)) map.removeSource(SURFACE_SOURCE);
    },
    [map],
  );
  return null;
}

interface Built {
  url: string;
  corners: Corners;
}

async function build(view: SessionView, mode: SurfaceMode): Promise<Built | null> {
  const img = surfaceImage(view, mode);
  return img ? { url: await toUrl(img.width, img.height, img.rgba), corners: img.corners } : null;
}
