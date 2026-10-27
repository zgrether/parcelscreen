"use client";
/**
 * Map layers › Places on the map (roadmap step 14d, docs/plans/step-14d-places.md §5): one clustered source per kind.
 * Trailheads, groceries and paddle launches come from the baked cells in view, loaded as the map moves at zoom 8 and up;
 * ERs (CMS's list), Settings' airports and the long trails' access points from their lists. A tap opens a small card;
 * a cluster's tap zooms into it. Below zoom 8 the hint says to zoom in; a cell that fails is tried again on the next
 * move, and says so once a visit.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Popup,
  type GeoJSONSource,
  type Map as MlMap,
  type MapMouseEvent,
  type PointLike,
} from "maplibre-gl";
import {
  PLACE_KINDS,
  PLACES_WORDS as W,
  airportFeatures,
  bakedFeatures,
  cardLines,
  cellsInBox,
  collection,
  erFeatures,
  longTrailFeatures,
  timedMinutes,
  type PlaceFeature,
  type PlaceKind,
  type PlaceProps,
} from "@/lib/places/layer";
import { LONG_TRAILS } from "@/lib/screen/data/longTrails";
import { loadErLists, erPlaces } from "@/lib/screen/hospitals";
import {
  PLACES_PATH,
  PLACE_FOLDERS,
  PlaceCellSchema,
  PlacesIndexSchema,
  type Place,
} from "@/lib/screen/placeData";
import type { UserConfig } from "@/lib/screen/types";
import { useScreenItContext } from "@/components/Results/ScreenItContext";
import { mapGone, useMap } from "./MapView";
import { PLACE_COLOR, addPlaceIcons, iconId } from "./placeIcons";
import { GLYPHS, LABEL_FONT } from "./terrainStyle";
import { useMapLayerPrefs } from "./useMapLayerPrefs";
import { ZOOM_HINT } from "./useParcelLines";

type Hint = (text: string | ((prev: string) => string)) => void;

/** Places show, and the baked cells load, from this zoom. */
export const PLACES_MIN_ZOOM = 8;
/** Clustered below zoom 12. */
const CLUSTER_MAX_ZOOM = 11;
const TAP_PX = 12;

const sourceId = (k: PlaceKind) => `places-${k}`;
export const placeLayers = (k: PlaceKind) => ({
  cluster: `places-${k}-cluster`,
  count: `places-${k}-count`,
  point: `places-${k}-point`,
});
const ALL_LAYERS = PLACE_KINDS.flatMap((k) => Object.values(placeLayers(k)));
const BAKED: readonly PlaceKind[] = ["trailhead", "grocery", "launch"];

/** A place or a cluster under a tap, if any: the map's own tap (select a parcel) skips it. */
export function placeAt(map: MlMap, point: { x: number; y: number }) {
  const layers = ALL_LAYERS.filter(
    (id) => map.getLayer(id) && map.getLayoutProperty(id, "visibility") !== "none",
  );
  if (!layers.length) return null;
  const box: [PointLike, PointLike] = [
    [point.x - TAP_PX, point.y - TAP_PX],
    [point.x + TAP_PX, point.y + TAP_PX],
  ];
  return map.queryRenderedFeatures(box, { layers }).find((f) => !f.layer.id.endsWith("-count")) ?? null;
}

/** The first flatwater card of a visit says what flatwater is (plan §8). */
let flatExplained = false;

export function PlacesLayer({ hint, anchors }: { hint: Hint; anchors: UserConfig["anchors"] }) {
  const map = useMap();
  const { places } = useMapLayerPrefs();
  const s = useScreenItContext();
  const result = s && !s.stale ? s.display : null;
  const resultRef = useRef(result);
  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  // The baked cells loaded so far ("osm/36_-82"), and the bake's date.
  const cells = useRef(new Map<string, Place[]>());
  const [baked, setBaked] = useState<{ features: Partial<Record<PlaceKind, PlaceFeature[]>> }>({
    features: {},
  });
  const bakeDate = useRef("");
  const [ers, setErs] = useState<PlaceFeature[]>([]);
  const lists = useMemo(
    () => ({ airport: airportFeatures(anchors), longTrail: longTrailFeatures(LONG_TRAILS) }),
    [anchors],
  );

  // The sources and their layers, once the layer is first turned on.
  useEffect(() => {
    if (!map || mapGone(map) || !places.on || map.getSource(sourceId("er"))) return;
    // Cluster counts are text; a style built without roads or contours has no glyphs.
    if (!map.getStyle().glyphs) map.setGlyphs(GLYPHS);
    addPlaceIcons(map);
    for (const k of PLACE_KINDS) {
      const ring = PLACE_COLOR[k === "launch" ? "launchFlat" : k];
      map.addSource(sourceId(k), {
        type: "geojson",
        data: collection([]),
        cluster: true,
        clusterMaxZoom: CLUSTER_MAX_ZOOM,
        clusterRadius: 40,
        attribution: W.attribution,
      });
      const L = placeLayers(k);
      map.addLayer({
        id: L.cluster,
        type: "circle",
        source: sourceId(k),
        minzoom: PLACES_MIN_ZOOM,
        filter: ["has", "point_count"],
        // 44 px across: a tap target on a phone. Dark counts on a light disc (plan §8).
        paint: {
          "circle-radius": 22,
          "circle-color": "#ffffff",
          "circle-opacity": 0.92,
          "circle-stroke-width": 3,
          "circle-stroke-color": ring,
        },
      });
      map.addLayer({
        id: L.count,
        type: "symbol",
        source: sourceId(k),
        minzoom: PLACES_MIN_ZOOM,
        filter: ["has", "point_count"],
        // Polish 2 (M9): the kind's icon over the count, so a disc says what it groups, not only how many.
        layout: {
          "icon-image": iconId(k === "launch" ? "launchFlat" : k),
          "icon-size": 0.67,
          "icon-anchor": "bottom",
          "icon-offset": [0, 3],
          "icon-allow-overlap": true,
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": [LABEL_FONT],
          "text-size": 12,
          "text-anchor": "top",
          "text-offset": [0, 0.1],
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#1b1f1c" },
      });
      map.addLayer({
        id: L.point,
        type: "symbol",
        source: sourceId(k),
        minzoom: PLACES_MIN_ZOOM,
        filter: ["!", ["has", "point_count"]],
        layout: {
          "icon-image":
            k === "launch"
              ? ["match", ["get", "water"], "flat", iconId("launchFlat"), iconId("launchRiver")]
              : iconId(k),
          "icon-allow-overlap": true,
        },
      });
    }
  }, [map, places.on]);

  // Shown while on, by kind.
  useEffect(() => {
    if (!map || mapGone(map) || !map.getSource(sourceId("er"))) return;
    for (const k of PLACE_KINDS)
      for (const id of Object.values(placeLayers(k)))
        map.setLayoutProperty(id, "visibility", places.on && places.kinds[k] ? "visible" : "none");
  }, [map, places]);

  // The lists' kinds: ERs loaded once, the first time they're shown.
  useEffect(() => {
    if (!places.on || !places.kinds.er || ers.length) return;
    let live = true;
    loadErLists()
      .then(([list, overrides]) => live && setErs(erFeatures(erPlaces(list, overrides), list.checked)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [places.on, places.kinds.er, ers.length]);

  // The baked cells in view, as the map moves; a cell that fails isn't kept, so the next move asks again.
  const wantBaked = places.on && BAKED.some((k) => places.kinds[k]);
  useEffect(() => {
    if (!map || mapGone(map) || !wantBaked) return;
    let live = true;
    let told = false;
    const failed = () => {
      if (told) return;
      told = true;
      hint(W.failed);
      setTimeout(() => hint((h) => (h === W.failed ? "" : h)), 4000);
    };
    const asking = new Set<string>();
    const load = async () => {
      if (map.getZoom() < PLACES_MIN_ZOOM) return;
      if (!bakeDate.current)
        bakeDate.current = await fetch(`${PLACES_PATH}/index.json`)
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => (j ? PlacesIndexSchema.parse(j).baked : ""))
          .catch(() => "");
      const b = map.getBounds();
      const keys = cellsInBox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]).flatMap((c) =>
        PLACE_FOLDERS.map((f) => `${f}/${c}`),
      );
      const missing = keys.filter((k) => !cells.current.has(k) && !asking.has(k));
      if (!missing.length) return;
      missing.forEach((k) => asking.add(k));
      await Promise.all(
        missing.map(async (k) => {
          try {
            const r = await fetch(`${PLACES_PATH}/${k}.json`);
            if (r.status === 404) cells.current.set(k, []);
            else if (!r.ok) failed();
            else cells.current.set(k, PlaceCellSchema.parse(await r.json()).places);
          } catch {
            failed();
          } finally {
            asking.delete(k);
          }
        }),
      );
      if (live) setBaked({ features: bakedFeatures([...cells.current.values()].flat(), bakeDate.current) });
    };
    void load();
    map.on("moveend", load);
    return () => {
      live = false;
      map.off("moveend", load);
    };
  }, [map, wantBaked, hint]);

  // Each source's data.
  useEffect(() => {
    if (!map || mapGone(map) || !places.on) return;
    const data: Record<PlaceKind, PlaceFeature[]> = {
      er: ers,
      airport: lists.airport,
      longTrail: lists.longTrail,
      trailhead: baked.features.trailhead ?? [],
      grocery: baked.features.grocery ?? [],
      launch: baked.features.launch ?? [],
    };
    for (const k of PLACE_KINDS) map.getSource<GeoJSONSource>(sourceId(k))?.setData(collection(data[k]));
  }, [map, places.on, ers, lists, baked]);

  // Below zoom 8: "Zoom in to see places", over parcel lines' own zoom hint, never over another hint.
  useEffect(() => {
    if (!map) return;
    const ours = (h: string) => !h || h === W.zoomIn || h === ZOOM_HINT;
    const update = () => {
      if (places.on && map.getZoom() < PLACES_MIN_ZOOM) hint((h) => (ours(h) ? W.zoomIn : h));
      else hint((h) => (h === W.zoomIn ? "" : h));
    };
    update();
    map.on("moveend", update);
    return () => {
      map.off("moveend", update);
      hint((h) => (h === W.zoomIn ? "" : h));
    };
  }, [map, places.on, hint]);

  // A tap: a cluster zooms in; a place opens its card. Nothing is fetched for it.
  useEffect(() => {
    if (!map || mapGone(map)) return;
    let pop: Popup | null = null;
    const onClick = (e: MapMouseEvent) => {
      if (document.documentElement.classList.contains("map-tool")) return;
      const f = placeAt(map, e.point);
      if (!f || f.geometry.type !== "Point") return;
      const at = f.geometry.coordinates as [number, number];
      if (f.properties?.cluster) {
        const src = map.getSource<GeoJSONSource>(f.source);
        void src
          ?.getClusterExpansionZoom(f.properties.cluster_id as number)
          .then((z) => map.easeTo({ center: at, zoom: Math.max(z, CLUSTER_MAX_ZOOM + 1) }));
        return;
      }
      const p = f.properties as PlaceProps;
      const firstFlat = p.kind === "launch" && p.water === "flat" && !flatExplained;
      if (firstFlat) flatExplained = true;
      const lines = cardLines(
        p,
        timedMinutes(resultRef.current, p, [at[1], at[0]]),
        firstFlat,
        !!resultRef.current,
      );
      const el = document.createElement("div");
      el.className = "place-card";
      lines.forEach((line, i) => {
        const row = document.createElement(i === 0 ? "strong" : "div");
        row.textContent = line;
        el.appendChild(row);
      });
      pop?.remove();
      pop = new Popup({
        closeButton: false,
        className: "result-tip place-tip",
        offset: 14,
        maxWidth: "280px",
      })
        .setLngLat(at)
        .setDOMContent(el)
        .addTo(map);
    };
    map.on("click", onClick);
    return () => {
      pop?.remove();
      if (!mapGone(map)) map.off("click", onClick);
    };
  }, [map]);

  // Gone with the map: removed on unmount.
  useEffect(
    () => () => {
      if (!map || mapGone(map)) return;
      for (const id of ALL_LAYERS) if (map.getLayer(id)) map.removeLayer(id);
      for (const k of PLACE_KINDS) if (map.getSource(sourceId(k))) map.removeSource(sourceId(k));
    },
    [map],
  );
  return null;
}
