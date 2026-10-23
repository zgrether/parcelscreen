"use client";
/**
 * The catalog's areas on the map (step 13, docs/plans/step-13-area-catalog.md §5a): every outline while Map layers'
 * Area outlines is on, and a starred area's whatever it says; starred ones solid, the rest dashed, each named. Tapping
 * one shows its fit for the person and "Show me a parcel here". Also where focusArea fits the map to an area.
 */
import { useEffect, useMemo } from "react";
import { Marker, Popup, type GeoJSONSource, type MapLayerMouseEvent } from "maplibre-gl";
import { bbox, centerOfMass } from "@turf/turf";
import type { AreaFile } from "@/lib/areas/types";
import { areaCard } from "@/lib/areas/score";
import { AREA_WORDS as W, mustShareLine } from "@/lib/areas/words";
import { focusArea, registerAreaFocus, useAreas, useAreaStars, type Box } from "@/lib/client/areas";
import { useRubricView } from "@/lib/client/useRubricView";
import { mapGone, useMap } from "./MapView";
import { LAYER } from "./style";
import { useMapLayerPrefs } from "./useMapLayerPrefs";

const SOURCE = "areas";
export const AREA_LAYERS = {
  fill: "areas-fill",
  casing: "areas-casing",
  dashed: "areas-line",
  starred: "areas-line-starred",
} as const;
export const AREA_COLOR = "#2f6f8f";
const LABEL_MIN_ZOOM = 9;

const featureOf = (f: AreaFile, starred: boolean) => ({
  type: "Feature" as const,
  properties: { id: f.id, name: f.name, starred },
  geometry: f.outline,
});

export function AreaOutlines() {
  const map = useMap();
  const prefs = useMapLayerPrefs();
  const { stars } = useAreaStars();
  const wanted = prefs.areas || stars.length > 0;
  const areas = useAreas(wanted);
  const { rubric } = useRubricView();
  const shown = useMemo(
    () => areas.files.filter((f) => prefs.areas || stars.includes(f.id)),
    [areas.files, prefs.areas, stars],
  );

  // Where focusArea fits the map, while it's mounted.
  useEffect(() => {
    if (!map) return;
    return registerAreaFocus(([w, s, e, n]) => {
      // With nothing open, the desktop's docked panel lies over the map's left side without insetting it.
      const dock =
        document.querySelector(".explore-panel.dock.search-only")?.getBoundingClientRect().right ?? 0;
      map.fitBounds(
        [
          [w, s],
          [e, n],
        ],
        { padding: { top: 40, right: 40, bottom: 90, left: dock + 40 }, duration: 800 },
      );
    });
  }, [map]);

  // The source and its layers, under the saved parcels' outlines.
  useEffect(() => {
    if (!map || mapGone(map)) return;
    const data = {
      type: "FeatureCollection" as const,
      features: shown.map((f) => featureOf(f, stars.includes(f.id))),
    };
    const src = map.getSource<GeoJSONSource>(SOURCE);
    if (src) src.setData(data);
    else {
      map.addSource(SOURCE, { type: "geojson", data });
      const before = map.getLayer(LAYER.savedFill) ? LAYER.savedFill : undefined;
      map.addLayer(
        {
          id: AREA_LAYERS.fill,
          type: "fill",
          source: SOURCE,
          paint: { "fill-color": AREA_COLOR, "fill-opacity": 0.06 },
        },
        before,
      );
      map.addLayer(
        {
          id: AREA_LAYERS.casing,
          type: "line",
          source: SOURCE,
          paint: { "line-color": "#ffffff", "line-width": 4, "line-opacity": 0.6 },
        },
        before,
      );
      map.addLayer(
        {
          id: AREA_LAYERS.dashed,
          type: "line",
          source: SOURCE,
          filter: ["!", ["get", "starred"]],
          paint: { "line-color": AREA_COLOR, "line-width": 2, "line-dasharray": [3, 2] },
        },
        before,
      );
      map.addLayer(
        {
          id: AREA_LAYERS.starred,
          type: "line",
          source: SOURCE,
          filter: ["get", "starred"],
          paint: { "line-color": AREA_COLOR, "line-width": 2.5 },
        },
        before,
      );
    }
  }, [map, shown, stars]);

  // Each shown area's name, as a label on the map (DOM, as the saved parcels' are).
  useEffect(() => {
    if (!map || mapGone(map)) return;
    const markers = shown.map((f) => {
      const el = document.createElement("div");
      el.className = `area-label${stars.includes(f.id) ? " starred" : ""}`;
      el.textContent = f.name;
      const [lon, lat] = centerOfMass(f.outline).geometry.coordinates as [number, number];
      return new Marker({ element: el }).setLngLat([lon, lat]).addTo(map);
    });
    // Far out, the names of the unstarred areas crowd each other: only the starred ones' show below zoom 9.
    const far = () => map.getContainer().classList.toggle("areas-far", map.getZoom() < LABEL_MIN_ZOOM);
    far();
    map.on("zoomend", far);
    return () => {
      markers.forEach((m) => m.remove());
      if (!mapGone(map)) map.off("zoomend", far);
    };
  }, [map, shown, stars]);

  // A tap on an outline: its fit for the person on show, and the way to a parcel there.
  useEffect(() => {
    if (!map || mapGone(map)) return;
    const onClick = (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id as string | undefined;
      const file = shown.find((f) => f.id === id);
      if (!file) return;
      const card = areaCard(file, rubric);
      const el = document.createElement("div");
      el.className = "area-pop";
      const head = document.createElement("p");
      head.className = "area-pop-head";
      const chip = document.createElement("span");
      chip.className = `card-grade small g-${card.grade ?? "none"}`;
      chip.textContent = card.grade ?? "–";
      chip.setAttribute("aria-label", W.fit(card.grade ?? "–"));
      head.append(chip, ` ${file.name}`);
      const share = document.createElement("p");
      share.className = "tiny";
      share.textContent = mustShareLine(card, file);
      const go = document.createElement("button");
      go.type = "button";
      go.className = "btn small secondary";
      go.textContent = W.showParcel;
      const pop = new Popup({ maxWidth: "260px" }).setLngLat(e.lngLat).setDOMContent(el).addTo(map);
      go.onclick = () => {
        pop.remove();
        focusArea(bbox(file.outline) as Box);
      };
      el.append(head, share, go);
    };
    const pointer = () => (map.getCanvas().style.cursor = "pointer");
    const plain = () => (map.getCanvas().style.cursor = "");
    map.on("click", AREA_LAYERS.fill, onClick);
    map.on("mouseenter", AREA_LAYERS.fill, pointer);
    map.on("mouseleave", AREA_LAYERS.fill, plain);
    return () => {
      if (mapGone(map)) return;
      map.off("click", AREA_LAYERS.fill, onClick);
      map.off("mouseenter", AREA_LAYERS.fill, pointer);
      map.off("mouseleave", AREA_LAYERS.fill, plain);
    };
  }, [map, shown, rubric]);

  // Gone with the map: removed on unmount.
  useEffect(
    () => () => {
      if (!map || mapGone(map)) return;
      for (const id of Object.values(AREA_LAYERS)) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    },
    [map],
  );
  return null;
}
