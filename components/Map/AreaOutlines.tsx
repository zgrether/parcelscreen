"use client";
/**
 * The catalog's areas on the map (step 13, docs/plans/step-13-area-catalog.md §5a): every outline while Map layers'
 * Area outlines is on, and a starred area's whatever it says; starred ones solid, the rest dashed. Owner, 10/23: each
 * filled by the person's fit (its colour) and Must share (its strength), and labelled with its fit letter and name;
 * where labels would collide, names go before letters. Tapping one opens its card. Also where focusArea fits the map.
 */
import { useEffect, useMemo, useRef } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { Marker, Popup, type GeoJSONSource, type MapLayerMouseEvent } from "maplibre-gl";
import { bbox, centerOfMass } from "@turf/turf";
import { AreaCardView, TOP } from "@/components/Areas/AreaBox";
import type { AreaFile } from "@/lib/areas/types";
import { areaCard, rankAreas, rankOf, type AreaCard } from "@/lib/areas/score";
import { AREA_WORDS as W } from "@/lib/areas/words";
import { LINES_MIN_ZOOM } from "@/lib/geo/parcelTiles";
import type { Letter } from "@/lib/rubric/types";
import { focusArea, registerAreaFocus, useAreas, useAreaStars, type Box } from "@/lib/client/areas";
import { useRubricView } from "@/lib/client/useRubricView";
import { mapGone, useMap } from "./MapView";
import { LAYER } from "./style";
import { useMapLayerPrefs } from "./useMapLayerPrefs";
import { openSample } from "@/lib/client/samples";

const SOURCE = "areas";
export const AREA_LAYERS = {
  fill: "areas-fill",
  casing: "areas-casing",
  dashed: "areas-line",
  starred: "areas-line-starred",
} as const;
export const AREA_COLOR = "#2f6f8f";
/** Below this zoom an area's label is its letter alone; from it, its name too, room allowing. */
const NAME_MIN_ZOOM = 8;

/** The fit's colour on the map: the card's grade colours (globals.css .bd-key), B and D paler. */
export const FIT_COLOR: Record<Letter | "none", string> = {
  A: "#2f7a46",
  B: "#6da27e",
  C: "#9a6a12",
  D: "#c1756b",
  F: "#a63a2c",
  none: "#7a7a7a",
};

/** The fill's strength by Must share: from 0.08 (none of the land passes) to 0.38 (all of it does). */
export const fillStrength = (share: number) => Math.round((0.08 + 0.3 * share) * 1000) / 1000;

/** The popup's card, in its own root: it reads the stars itself, so its star turns as it's tapped. */
function PopupCard(p: { card: AreaCard; file: AreaFile; rank: number; total: number; show(): void }) {
  const { stars, toggle } = useAreaStars();
  return (
    <AreaCardView
      as="div"
      {...p}
      starred={stars.includes(p.file.id)}
      star={() => toggle(p.file.id)}
      failed={false}
    />
  );
}

const featureOf = (f: AreaFile, starred: boolean, card: AreaCard | undefined) => ({
  type: "Feature" as const,
  properties: {
    id: f.id,
    name: f.name,
    starred,
    color: FIT_COLOR[card?.grade ?? "none"],
    strength: fillStrength(card?.mustShare ?? 0),
  },
  geometry: f.outline,
});

/** Two labels' boxes overlap, with a few pixels to spare. */
const overlaps = (a: DOMRect, b: DOMRect) =>
  a.left < b.right + 4 && b.left < a.right + 4 && a.top < b.bottom + 2 && b.top < a.bottom + 2;

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
  // Every area's card and place for the person on show: the fill, the labels, and the card a tap opens.
  const ranked = useMemo(
    () =>
      rankAreas(
        areas.files.map((f) => areaCard(f, rubric)),
        new Map(areas.files.map((f) => [f.id, f.name])),
      ),
    [areas.files, rubric],
  );
  const cards = useMemo(() => new Map(ranked.map((c) => [c.id, c])), [ranked]);
  const ranks = useMemo(() => rankOf(ranked), [ranked]);
  // Polish 2 (M11): the suggestion box's five keep their names at every zoom; the others go to a letter far out.
  const top = useMemo(
    () =>
      new Set(
        ranked
          .filter((c) => c.suggestable)
          .slice(0, TOP)
          .map((c) => c.id),
      ),
    [ranked],
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
        // At once, not eased: opening a sample also docks the parcel panel, whose padding jump would cut an ease short.
        { padding: { top: 40, right: 40, bottom: 90, left: dock + 40 }, animate: false },
      );
    });
  }, [map]);

  // The source and its layers, under the saved parcels' outlines.
  useEffect(() => {
    if (!map || mapGone(map)) return;
    const data = {
      type: "FeatureCollection" as const,
      features: shown.map((f) => featureOf(f, stars.includes(f.id), cards.get(f.id))),
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
          paint: { "fill-color": ["get", "color"], "fill-opacity": ["get", "strength"] },
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
  }, [map, shown, stars, cards]);

  // Each shown area's label: its fit letter and name (DOM, as the saved parcels' are). Placed best-ranked first: a label
  // that would collide loses its name; one that still would is left out.
  useEffect(() => {
    if (!map || mapGone(map)) return;
    const order = [...shown].sort((a, b) => (ranks.get(a.id) ?? 99) - (ranks.get(b.id) ?? 99));
    const labels = order.map((f) => {
      const card = cards.get(f.id);
      const el = document.createElement("div");
      el.className = `area-label${stars.includes(f.id) ? " starred" : ""}`;
      const fit = document.createElement("span");
      fit.className = `al-fit g-${card?.grade ?? "none"}`;
      fit.textContent = card?.fit ?? "–";
      const name = document.createElement("span");
      name.className = "al-name";
      name.textContent = f.name;
      el.append(fit, name);
      el.setAttribute("aria-label", `${f.name}, ${W.fit(card?.fit ?? "–")}`);
      const [lon, lat] = centerOfMass(f.outline).geometry.coordinates as [number, number];
      return { id: f.id, el, marker: new Marker({ element: el }).setLngLat([lon, lat]).addTo(map) };
    });
    const place = () => {
      const near = map.getZoom() >= NAME_MIN_ZOOM;
      const placed: DOMRect[] = [];
      for (const { id, el } of labels) {
        el.classList.remove("al-hidden");
        el.classList.toggle("al-letter", !near && !top.has(id));
        let box = el.getBoundingClientRect();
        if (!el.classList.contains("al-letter") && placed.some((p) => overlaps(p, box))) {
          el.classList.add("al-letter");
          box = el.getBoundingClientRect();
        }
        if (placed.some((p) => overlaps(p, box))) el.classList.add("al-hidden");
        else placed.push(box);
      }
    };
    place();
    map.on("moveend", place);
    return () => {
      labels.forEach((l) => l.marker.remove());
      if (!mapGone(map)) map.off("moveend", place);
    };
  }, [map, shown, stars, cards, ranks, top]);

  // A tap on an outline: its card, as the suggestion box shows it.
  const popRoot = useRef<Root | null>(null);
  useEffect(() => {
    if (!map || mapGone(map)) return;
    // A tap where parcels can be picked, or while a map tool is drawing, is the parcel's or the tool's (walkthroughs,
    // 10/23: the card covered the map mid-line).
    const tapsAreTheMaps = () =>
      document.documentElement.classList.contains("map-tool") || map.getZoom() >= LINES_MIN_ZOOM;
    const onClick = (e: MapLayerMouseEvent) => {
      if (tapsAreTheMaps()) return;
      const id = e.features?.[0]?.properties?.id as string | undefined;
      const file = shown.find((f) => f.id === id);
      const card = id ? cards.get(id) : undefined;
      if (!file || !card) return;
      const el = document.createElement("div");
      el.className = "area-pop";
      const pop = new Popup({ maxWidth: "320px", className: "area-popup" })
        .setLngLat(e.lngLat)
        .setDOMContent(el);
      const root = createRoot(el);
      popRoot.current = root;
      // Esc closes the card, and only the card (the UX audit's B-4: it closed the parcel behind it and left this up).
      const onKey = (k: KeyboardEvent) => {
        if (k.key !== "Escape" || k.defaultPrevented) return;
        k.preventDefault();
        pop.remove();
      };
      document.addEventListener("keydown", onKey, true);
      pop.on("close", () => {
        document.removeEventListener("keydown", onKey, true);
        if (popRoot.current === root) popRoot.current = null;
        queueMicrotask(() => root.unmount());
      });
      // Rendered before the popup is added, so it picks its side from the card's real size; then the map moves by
      // whatever still sticks out (a phone's card is taller than the room above or below most taps).
      flushSync(() =>
        root.render(
          <PopupCard
            card={card}
            file={file}
            rank={ranks.get(file.id)!}
            total={ranked.length}
            show={() => {
              pop.remove();
              openSample(file.id, 1).catch(() => focusArea(bbox(file.outline) as Box));
            }}
          />,
        ),
      );
      pop.addTo(map);
      // MapLibre places the popup on its next frame: measured after that.
      requestAnimationFrame(() => requestAnimationFrame(() => fitPopup(pop)));
    };
    const fitPopup = (pop: Popup) => {
      if (!pop.isOpen() || mapGone(map)) return;
      const box = pop.getElement()?.getBoundingClientRect();
      const frame = map.getContainer().getBoundingClientRect();
      if (box) {
        // Clear of the search and map buttons over the top edge, and of the hint, the toolbar and (on a phone) the tab
        // bar over the bottom one.
        const pad = 8,
          top = 64,
          bottom = 150;
        const dy =
          box.top < frame.top + top
            ? box.top - frame.top - top
            : box.bottom > frame.bottom - bottom
              ? Math.min(box.bottom - frame.bottom + bottom, box.top - frame.top - top)
              : 0;
        const dx =
          box.left < frame.left + pad
            ? box.left - frame.left - pad
            : box.right > frame.right - pad
              ? box.right - frame.right + pad
              : 0;
        if (dx || dy) map.panBy([dx, dy], { duration: 250 });
      }
    };
    const pointer = () => {
      if (!tapsAreTheMaps()) map.getCanvas().style.cursor = "pointer";
    };
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
  }, [map, shown, cards, ranks, ranked.length]);

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
