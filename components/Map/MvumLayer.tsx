"use client";
/**
 * Map layers › Motor-vehicle routes (roadmap step 16, docs/plans/step-16-public-lands.md §1.2): the Forest Service's
 * MVUM roads and trails from zoom 11, each a line in the colour of what it allows over a dark casing, dashed where
 * seasonal. Asked by zoom-11 tiles, once a session each, kept once by layer and object id. A tap within 10 px of a route
 * opens its card (name and number, what's allowed, its season, its forest, when the data was read); nothing is fetched.
 */
import { useEffect } from "react";
import {
  Popup,
  type GeoJSONSource,
  type Map as MlMap,
  type MapMouseEvent,
  type PointLike,
} from "maplibre-gl";
import type { Feature, LineString, MultiLineString } from "geojson";
import { browserHttp } from "@/lib/client/http";
import { tilesInBox, tileUrl } from "@/lib/offline/tiles";
import {
  ROUTE_CASING,
  ROUTE_CLASSES,
  ROUTE_COLOR,
  isSeasonal,
  routeClass,
  routeLines,
  MVUM_WORDS as W,
} from "@/lib/mvum/card";
import {
  MVUM_MIN_ZOOM,
  MVUM_TILE_ZOOM,
  ROUTE_LAYERS,
  mvumTemplate,
  parseRoutes,
  type RouteFeature,
  type RouteLayer,
} from "@/lib/mvum/source";
import { mapGone, useMap } from "./MapView";
import { placeAt } from "./PlacesLayer";
import { tipAt } from "./results/tooltip";
import { LAYER } from "./style";
import { useMapLayerPrefs } from "./useMapLayerPrefs";
import { ZOOM_HINT } from "./useParcelLines";

type Hint = (text: string | ((prev: string) => string)) => void;

const SOURCE = "mvum-routes";
export const MVUM_LAYERS = { casing: "mvum-casing", line: "mvum-line", seasonal: "mvum-seasonal" } as const;
const ALL_LAYERS = Object.values(MVUM_LAYERS);
const TAP_PX = 10;
const REDRAW_MS = 250;

/** This session's routes, by layer and object id (with the day each was read), and the tiles asked so far. */
const routes = new Map<string, { layer: RouteLayer; feature: RouteFeature; read: string }>();
const asked = new Set<string>();

const collection = () => ({
  type: "FeatureCollection" as const,
  features: [...routes.entries()].map(([key, r]): Feature<LineString | MultiLineString> => ({
    ...r.feature,
    properties: {
      ...r.feature.properties,
      _key: key,
      _class: routeClass(r.layer, r.feature.properties.symbol),
      _seasonal: isSeasonal(r.feature.properties),
    },
  })),
});

const colorBy = (): unknown => [
  "match",
  ["get", "_class"],
  ...ROUTE_CLASSES.flatMap((c) => [c, ROUTE_COLOR[c]]),
  ROUTE_COLOR.special,
];
const width = (at11: number, at14: number): unknown => [
  "interpolate",
  ["linear"],
  ["zoom"],
  11,
  at11,
  14,
  at14,
];

function addLayers(map: MlMap) {
  // Over public land, under the county's parcel lines and everything the app draws over the parcel.
  const before = map.getLayer(LAYER.parcelLinesFill) ? LAYER.parcelLinesFill : undefined;
  map.addSource(SOURCE, { type: "geojson", data: collection(), attribution: W.attribution });
  const line = { "line-cap": "round", "line-join": "round" } as const;
  map.addLayer(
    {
      id: MVUM_LAYERS.casing,
      type: "line",
      source: SOURCE,
      minzoom: MVUM_MIN_ZOOM,
      layout: line,
      paint: { "line-color": ROUTE_CASING, "line-opacity": 0.6, "line-width": width(4, 5.5) as number },
    },
    before,
  );
  map.addLayer(
    {
      id: MVUM_LAYERS.line,
      type: "line",
      source: SOURCE,
      minzoom: MVUM_MIN_ZOOM,
      filter: ["!", ["get", "_seasonal"]],
      layout: line,
      paint: { "line-color": colorBy() as string, "line-width": width(2, 3) as number },
    },
    before,
  );
  map.addLayer(
    {
      id: MVUM_LAYERS.seasonal,
      type: "line",
      source: SOURCE,
      minzoom: MVUM_MIN_ZOOM,
      filter: ["get", "_seasonal"],
      layout: { "line-join": "round" },
      paint: {
        "line-color": colorBy() as string,
        "line-width": width(2, 3) as number,
        "line-dasharray": [2, 1.5],
      },
    },
    before,
  );
}

/** The route under a tap (within 10 px), if any: the map's own tap skips it. */
export function routeAt(map: MlMap, point: { x: number; y: number }) {
  const layers = [MVUM_LAYERS.line, MVUM_LAYERS.seasonal].filter(
    (id) => map.getLayer(id) && map.getLayoutProperty(id, "visibility") !== "none",
  );
  if (!layers.length) return null;
  const box: [PointLike, PointLike] = [
    [point.x - TAP_PX, point.y - TAP_PX],
    [point.x + TAP_PX, point.y + TAP_PX],
  ];
  const key = map.queryRenderedFeatures(box, { layers })[0]?.properties?._key;
  return typeof key === "string" ? (routes.get(key) ?? null) : null;
}

/** The day a response says it was served, as YYYY-MM-DD (today when it doesn't say). */
const servedOn = (r: Response): string => {
  const d = new Date(r.headers.get("date") ?? Date.now());
  return (Number.isNaN(d.getTime()) ? new Date() : d).toISOString().slice(0, 10);
};

export function MvumLayer({ hint }: { hint: Hint }) {
  const map = useMap();
  const { mvum: on } = useMapLayerPrefs();

  useEffect(() => {
    if (!map || mapGone(map) || !on || map.getSource(SOURCE)) return;
    addLayers(map);
  }, [map, on]);

  useEffect(() => {
    if (!map || mapGone(map) || !map.getSource(SOURCE)) return;
    for (const id of ALL_LAYERS) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  }, [map, on]);

  // The tiles in view, as the map moves, each once a session.
  useEffect(() => {
    if (!map || mapGone(map) || !on) return;
    let live = true;
    let told = false;
    let timer: number | null = null;
    const redraw = () => {
      if (timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        if (live && !mapGone(map)) map.getSource<GeoJSONSource>(SOURCE)?.setData(collection());
      }, REDRAW_MS);
    };
    const failed = () => {
      if (told) return;
      told = true;
      hint(W.failed);
      setTimeout(() => hint((h) => (h === W.failed ? "" : h)), 4000);
    };
    const load = () => {
      if (map.getZoom() < MVUM_MIN_ZOOM) return;
      const b = map.getBounds();
      const box = { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
      for (const t of tilesInBox(box, MVUM_TILE_ZOOM))
        for (const layer of ROUTE_LAYERS) {
          const url = tileUrl(mvumTemplate(layer), t);
          if (asked.has(url)) continue;
          asked.add(url);
          void browserHttp
            .fetch(url)
            .then(async (r) => {
              const found = r.ok ? parseRoutes(await r.json()) : null;
              if (!found) throw new Error("not an answer");
              const read = servedOn(r);
              for (const feature of found) {
                const key = `${layer}:${feature.properties.objectid}`;
                if (!routes.has(key)) routes.set(key, { layer, feature, read });
              }
              if (live) redraw();
            })
            .catch(() => {
              asked.delete(url);
              // Offline, a tile outside a saved parcel's box is simply not there (plan §5).
              if (live && navigator.onLine) failed();
            });
        }
    };
    map.getSource<GeoJSONSource>(SOURCE)?.setData(collection());
    load();
    map.on("moveend", load);
    return () => {
      live = false;
      if (timer !== null) window.clearTimeout(timer);
      map.off("moveend", load);
    };
  }, [map, on, hint]);

  // Below zoom 11: "Zoom in to see motor-vehicle routes", never over another layer's hint.
  useEffect(() => {
    if (!map) return;
    const ours = (h: string) => !h || h === W.zoomIn || h === ZOOM_HINT;
    const update = () => {
      if (on && map.getZoom() < MVUM_MIN_ZOOM) hint((h) => (ours(h) ? W.zoomIn : h));
      else hint((h) => (h === W.zoomIn ? "" : h));
    };
    update();
    map.on("moveend", update);
    return () => {
      map.off("moveend", update);
      hint((h) => (h === W.zoomIn ? "" : h));
    };
  }, [map, on, hint]);

  // A tap on a route: its card. A place or a result's tip under the tap comes first.
  useEffect(() => {
    if (!map || mapGone(map)) return;
    let pop: Popup | null = null;
    const onClick = (e: MapMouseEvent) => {
      if (document.documentElement.classList.contains("map-tool")) return;
      if (placeAt(map, e.point) || tipAt(map, e.point)) return;
      const r = routeAt(map, e.point);
      if (!r) return;
      const el = document.createElement("div");
      el.className = "place-card route-card";
      routeLines(r.layer, r.feature.properties, r.read).forEach((line, i, all) => {
        const row = document.createElement(i === 0 ? "strong" : "div");
        row.textContent = line;
        if (i === all.length - 1) row.className = "tiny route-read";
        el.appendChild(row);
      });
      pop?.remove();
      pop = new Popup({ closeButton: false, className: "result-tip place-tip", offset: 8, maxWidth: "280px" })
        .setLngLat(e.lngLat)
        .setDOMContent(el)
        .addTo(map);
    };
    map.on("click", onClick);
    return () => {
      pop?.remove();
      if (!mapGone(map)) map.off("click", onClick);
    };
  }, [map]);

  useEffect(
    () => () => {
      if (!map || mapGone(map)) return;
      for (const id of ALL_LAYERS) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    },
    [map],
  );
  return null;
}
