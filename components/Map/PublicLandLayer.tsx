"use client";
/**
 * Map layers › Public land (roadmap step 16, docs/plans/step-16-public-lands.md): PAD-US 4.1's fee land and easements,
 * coloured by manager, solid where open, hatched where restricted or not recorded, outlined where closed; easements a
 * dashed magenta line. From zoom 9: zoom-9 tiles simplified to about 250 m up to zoom 11, zoom-11 tiles at about 5 m
 * from there. Each tile is asked once a session; the service returns whole units, kept once each by OBJECTID, so there
 * are no seams. A tap opens a card from the units' own attributes (no request, so it works offline).
 */
import { useEffect, useRef } from "react";
import {
  Popup,
  type GeoJSONSource,
  type Map as MlMap,
  type MapMouseEvent,
  type PointLike,
} from "maplibre-gl";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { browserHttp } from "@/lib/client/http";
import { tilesInBox, tileUrl } from "@/lib/offline/tiles";
import {
  CATEGORIES,
  CATEGORY_COLOR,
  accessOf,
  accessStyle,
  categoryOf,
  type Category,
} from "@/lib/publicLand/classify";
import { publicLandCard, unitLines, PUBLIC_LAND_WORDS as W } from "@/lib/publicLand/card";
import {
  LEVELS,
  PUBLIC_LAND_MIN_ZOOM,
  levelAt,
  parseTile,
  publicLandTemplate,
  type DetailLevel,
  type UnitFeature,
} from "@/lib/publicLand/source";
import { useExplore } from "@/components/Explore/useExploreController";
import { fitPopup } from "./fitPopup";
import { mapGone, useMap } from "./MapView";
import { MVUM_LAYERS, routeAt } from "./MvumLayer";
import { placeAt } from "./PlacesLayer";
import { tipAt } from "./results/tooltip";
import { LAYER } from "./style";
import { useMapLayerPrefs } from "./useMapLayerPrefs";
import { ZOOM_HINT } from "./useParcelLines";

type Hint = (text: string | ((prev: string) => string)) => void;

const LEVEL_IDS: readonly DetailLevel[] = ["coarse", "fine"];
const sourceId = (l: DetailLevel) => `public-land-${l}`;
const layerIds = (l: DetailLevel) => ({
  solid: `public-land-${l}-solid`,
  hatched: `public-land-${l}-hatched`,
  outline: `public-land-${l}-outline`,
  closed: `public-land-${l}-closed`,
  easement: `public-land-${l}-easement`,
});
const ALL_LAYERS = LEVEL_IDS.flatMap((l) => Object.values(layerIds(l)));
const hatchId = (c: Category) => `public-land-hatch-${c}`;
/** The map redraws at most this often while tiles arrive. */
const REDRAW_MS = 250;

/** This session's units, by level and OBJECTID, and the tiles asked so far (a failed one is asked again). */
const units: Record<DetailLevel, Map<number, UnitFeature>> = { coarse: new Map(), fine: new Map() };
const asked = new Set<string>();

/** A unit as the map draws it: its category and access style beside PAD-US's own fields. */
function drawn(f: UnitFeature): Feature<Polygon | MultiPolygon> {
  const cat = categoryOf(f.properties);
  return { ...f, properties: { ...f.properties, _cat: cat, _style: accessStyle(accessOf(f.properties)) } };
}

const collection = (l: DetailLevel) => ({
  type: "FeatureCollection" as const,
  features: [...units[l].values()].map(drawn),
});

/** A diagonal hatch in a colour, 8 px, for the restricted and unrecorded land's fill. */
function hatch(hex: string): { width: number; height: number; data: Uint8Array } {
  const n = 8;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const on = (x + y) % n < 2;
      data.set(on ? [r, g, b, 200] : [r, g, b, 30], (y * n + x) * 4);
    }
  return { width: n, height: n, data };
}

const colorBy = (): unknown => [
  "match",
  ["get", "_cat"],
  ...CATEGORIES.flatMap((c) => [c, CATEGORY_COLOR[c]]),
  CATEGORY_COLOR.other,
];

function addLayers(map: MlMap) {
  for (const c of CATEGORIES)
    if (!map.hasImage(hatchId(c))) map.addImage(hatchId(c), hatch(CATEGORY_COLOR[c]));
  // Under the routes (whichever was turned on first), the county's parcel lines and everything the app draws.
  const before = map.getLayer(MVUM_LAYERS.casing)
    ? MVUM_LAYERS.casing
    : map.getLayer(LAYER.parcelLinesFill)
      ? LAYER.parcelLinesFill
      : undefined;
  for (const l of LEVEL_IDS) {
    map.addSource(sourceId(l), { type: "geojson", data: collection(l), attribution: W.attribution });
    const ids = layerIds(l);
    const zooms =
      l === "coarse"
        ? { minzoom: LEVELS.coarse.minZoom, maxzoom: LEVELS.fine.minZoom }
        : { minzoom: LEVELS.fine.minZoom };
    const land = ["!=", ["get", "_cat"], "easement"];
    const add = (spec: Record<string, unknown>) =>
      map.addLayer({ source: sourceId(l), ...zooms, ...spec } as Parameters<MlMap["addLayer"]>[0], before);
    add({
      id: ids.solid,
      type: "fill",
      filter: ["all", land, ["==", ["get", "_style"], "solid"]],
      paint: { "fill-color": colorBy(), "fill-opacity": 0.35 },
    });
    add({
      id: ids.hatched,
      type: "fill",
      filter: ["all", land, ["==", ["get", "_style"], "hatched"]],
      paint: { "fill-pattern": ["concat", "public-land-hatch-", ["get", "_cat"]] },
    });
    add({
      id: ids.outline,
      type: "line",
      filter: ["all", land, ["!=", ["get", "_style"], "outline"]],
      paint: { "line-color": colorBy(), "line-width": 1.5 },
    });
    add({
      id: ids.closed,
      type: "line",
      filter: ["all", land, ["==", ["get", "_style"], "outline"]],
      paint: { "line-color": colorBy(), "line-width": 1.5, "line-dasharray": [3, 2] },
    });
    add({
      id: ids.easement,
      type: "line",
      filter: ["==", ["get", "_cat"], "easement"],
      paint: { "line-color": CATEGORY_COLOR.easement, "line-width": 2, "line-dasharray": [4, 2] },
    });
  }
}

/** The units under a point, whole, and whether any is fee land (not an easement): that tap is the layer's. */
export function publicLandAt(map: MlMap, point: { x: number; y: number }) {
  const layers = ALL_LAYERS.filter(
    (id) => map.getLayer(id) && map.getLayoutProperty(id, "visibility") !== "none",
  );
  if (!layers.length) return null;
  const box: [PointLike, PointLike] = [
    [point.x - 2, point.y - 2],
    [point.x + 2, point.y + 2],
  ];
  const ids = new Set(
    map.queryRenderedFeatures(box, { layers }).map((f) => f.properties?.OBJECTID as number),
  );
  const found = [...ids]
    .map((id) => units.fine.get(id) ?? units.coarse.get(id))
    .filter((f): f is UnitFeature => !!f);
  if (!found.length) return null;
  return { features: found, fee: found.some((f) => categoryOf(f.properties) !== "easement") };
}

export function PublicLandLayer({ hint }: { hint: Hint }) {
  const map = useMap();
  const { publicLand: on } = useMapLayerPrefs();
  const ctl = useExplore();
  const parcelRef = useRef(ctl.parcel?.geo ?? null);
  useEffect(() => {
    parcelRef.current = ctl.parcel?.geo ?? null;
  });

  // The sources and layers, once the layer is first turned on.
  useEffect(() => {
    if (!map || mapGone(map) || !on || map.getSource(sourceId("coarse"))) return;
    addLayers(map);
  }, [map, on]);

  useEffect(() => {
    if (!map || mapGone(map) || !map.getSource(sourceId("coarse"))) return;
    for (const id of ALL_LAYERS) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  }, [map, on]);

  // The tiles in view, as the map moves: the level's zoom, each tile once a session.
  useEffect(() => {
    if (!map || mapGone(map) || !on) return;
    let live = true;
    let told = false;
    let timer: number | null = null;
    const redraw = (l: DetailLevel) => {
      if (timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        if (live && !mapGone(map)) map.getSource<GeoJSONSource>(sourceId(l))?.setData(collection(l));
      }, REDRAW_MS);
    };
    const failed = () => {
      if (told) return;
      told = true;
      hint(W.failed);
      setTimeout(() => hint((h) => (h === W.failed ? "" : h)), 4000);
    };
    const load = () => {
      const zoom = map.getZoom();
      if (zoom < PUBLIC_LAND_MIN_ZOOM) return;
      const l = levelAt(zoom);
      const b = map.getBounds();
      const box = { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
      for (const t of tilesInBox(box, LEVELS[l].tileZoom)) {
        const url = tileUrl(publicLandTemplate(l), t);
        if (asked.has(url)) continue;
        asked.add(url);
        void browserHttp
          .fetch(url)
          .then(async (r) => {
            const features = r.ok ? parseTile(await r.json()) : null;
            if (!features) throw new Error("not an answer");
            for (const f of features)
              if (!units[l].has(f.properties.OBJECTID)) units[l].set(f.properties.OBJECTID, f);
            if (live) redraw(l);
          })
          .catch(() => {
            asked.delete(url);
            // Offline, a tile outside a saved parcel's box is simply not there (plan §5).
            if (live && navigator.onLine) failed();
          });
      }
    };
    // What earlier visits loaded, at once.
    for (const l of LEVEL_IDS) map.getSource<GeoJSONSource>(sourceId(l))?.setData(collection(l));
    load();
    map.on("moveend", load);
    return () => {
      live = false;
      if (timer !== null) window.clearTimeout(timer);
      map.off("moveend", load);
    };
  }, [map, on, hint]);

  // Below zoom 9: "Zoom in to see public land", over parcel lines' own zoom hint, never over another hint.
  useEffect(() => {
    if (!map) return;
    const ours = (h: string) => !h || h === W.zoomIn || h === ZOOM_HINT;
    const update = () => {
      if (on && map.getZoom() < PUBLIC_LAND_MIN_ZOOM) hint((h) => (ours(h) ? W.zoomIn : h));
      else hint((h) => (h === W.zoomIn ? "" : h));
    };
    update();
    map.on("moveend", update);
    return () => {
      map.off("moveend", update);
      hint((h) => (h === W.zoomIn ? "" : h));
    };
  }, [map, on, hint]);

  // A tap (plan §4): on fee land the card opens and no parcel is selected (ParcelTools skips it); an easement's card
  // opens only where the tap selects nothing (no county outline under it, or inside the open parcel).
  useEffect(() => {
    if (!map || mapGone(map)) return;
    let pop: Popup | null = null;
    const onClick = (e: MapMouseEvent) => {
      if (document.documentElement.classList.contains("map-tool")) return;
      if (placeAt(map, e.point) || tipAt(map, e.point) || routeAt(map, e.point)) return;
      const hit = publicLandAt(map, e.point);
      if (!hit) return;
      if (!hit.fee && !tapSelectsNothing(map, e.point)) return;
      pop?.remove();
      pop = new Popup({ closeButton: false, className: "result-tip place-tip", offset: 8, maxWidth: "280px" })
        .setLngLat(e.lngLat)
        .setDOMContent(cardElement(hit.features, parcelRef.current))
        .addTo(map);
      fitPopup(map, pop);
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
      for (const l of LEVEL_IDS) if (map.getSource(sourceId(l))) map.removeSource(sourceId(l));
    },
    [map],
  );
  return null;
}

/** Whether a tap here selects no parcel: no county outline is drawn under it. */
function tapSelectsNothing(map: MlMap, p: { x: number; y: number }): boolean {
  const layers = [LAYER.parcelLinesFill, LAYER.savedFill].filter((id) => map.getLayer(id));
  return !layers.length || !map.queryRenderedFeatures([p.x, p.y], { layers }).length || insideOpen(map, p);
}

/** Inside the open parcel (its fill is drawn there). */
function insideOpen(map: MlMap, p: { x: number; y: number }): boolean {
  return (
    !!map.getLayer(LAYER.parcelFill) &&
    map.queryRenderedFeatures([p.x, p.y], { layers: [LAYER.parcelFill] }).length > 0
  );
}

function cardElement(
  features: readonly UnitFeature[],
  parcel: Feature<Polygon | MultiPolygon> | null,
): HTMLElement {
  const card = publicLandCard(features, parcel);
  const el = document.createElement("div");
  el.className = "place-card public-land-card";
  for (const u of card.units) {
    const block = document.createElement("div");
    block.className = "pl-unit";
    unitLines(u).forEach((line, i) => {
      const row = document.createElement(i === 0 ? "strong" : "div");
      row.textContent = line;
      if (line === W.adjoins) row.className = "pl-adjoins";
      block.appendChild(row);
    });
    el.appendChild(block);
  }
  if (card.more) {
    const more = document.createElement("div");
    more.className = "muted";
    more.textContent = W.more(card.more);
    el.appendChild(more);
  }
  const caveat = document.createElement("div");
  caveat.className = "tiny muted pl-caveat";
  caveat.textContent = W.caveat;
  el.appendChild(caveat);
  return el;
}
