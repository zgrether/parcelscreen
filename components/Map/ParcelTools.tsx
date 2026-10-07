"use client";
/**
 * The parcel tools on the map (proto L561–707, 13e): taps per tool mode, selecting and unselecting parcels,
 * the draw keys, snapping drawn corners to the open parcel, and the overlays: the selected parcel, saved
 * parcels and their labels, the layer selected in the Info panel, the draft, the split pieces and their
 * labels, and the house and split-end markers (DOM markers, as CLAUDE.md asks, not canvas sprites).
 */
import { bbox, booleanPointInPolygon, point } from "@turf/turf";
import { Marker, type GeoJSONSource, type Map as MlMap, type MapMouseEvent } from "maplibre-gl";
import { useEffect, useMemo, useRef } from "react";
import { snapCorner, type SnapRing } from "@/lib/geo/snap";
import type { Side } from "@/lib/geo/split";
import type { LatLon } from "@/lib/geo/types";
import { parcelFromLine } from "@/lib/geo/parcels";
import { useExplore, type ExploreController } from "@/components/Explore/useExploreController";
import { useScreenItContext } from "@/components/Results/ScreenItContext";
import { tipAt } from "./results/tooltip";
import { useMap } from "./MapView";
import { combineData, draftData, labelPoint, pieceLabels, selectionData, splitData } from "./overlays";
import { LAYER, SOURCE } from "./style";
import { outlineAt } from "./useParcelLines";

/** The saved parcel under a screen point, by its History key. */
function savedAt(map: MlMap, p: { x: number; y: number }): string | null {
  if (!map.getLayer(LAYER.savedFill)) return null;
  const key = map.queryRenderedFeatures([p.x, p.y], { layers: [LAYER.savedFill] })[0]?.properties?.key;
  return typeof key === "string" ? key : null;
}

const EMPTY = { type: "FeatureCollection" as const, features: [] };
const toLL = (e: MapMouseEvent): LatLon => [e.lngLat.lat, e.lngLat.lng];
/** A tap this close (px) to the first corner closes the drawn boundary (proto L651). */
const CLOSE_PX = 14;
/** A corner drawn onto a parcel snaps to its corners and edges within this many px (plan 13e §4). */
const SNAP_PX = 14;

/** The open parcel's rings on screen, for snapping: each part, and the parcel itself (a split's cut edge). */
function snapRings(map: MlMap, c: ExploreController): SnapRing[] {
  const open = c.current().store.open;
  if (!open) return [];
  const shapes = [...open.pieces.map((p) => p.geo), ...(c.parcel ? [c.parcel.geo] : [])];
  return shapes.flatMap((f) =>
    f.geometry.coordinates.map((ring) => ({
      ll: ring.map(([lon, lat]): LatLon => [lat!, lon!]),
      xy: ring.map(([lon, lat]) => {
        const p = map.project([lon!, lat!]);
        return [p.x, p.y] as const;
      }),
    })),
  );
}

/** Where a drawn corner lands: on the open parcel's corner or edge when one is within reach, else the tap. */
const cornerAt = (map: MlMap, c: ExploreController, e: MapMouseEvent): LatLon =>
  snapCorner([e.point.x, e.point.y], snapRings(map, c), SNAP_PX)?.ll ?? toLL(e);

export function ParcelTools() {
  const map = useMap();
  const ctl = useExplore();
  useMapTaps(map, ctl);
  useOverlays(map, ctl);
  useHouseMarker(map, ctl);
  useSplitMarkers(map, ctl);
  usePieceLabels(map, ctl);
  useSnapIndicator(map, ctl);
  useSavedLabels(map, ctl);
  return null;
}

function useMapTaps(map: MlMap | null, ctl: ExploreController) {
  const ref = useRef(ctl);
  useEffect(() => {
    ref.current = ctl;
  });

  useEffect(() => {
    if (!map) return;
    // As in the prototype: a double-click finishes a drawn boundary instead of zooming.
    map.doubleClickZoom.disable();
    const onClick = (e: MapMouseEvent) => {
      const c = ref.current;
      const { mode, draft } = c.current();
      // Combining: each tap adds or removes the parcel under it (step 13b).
      if (mode === "combine") return void c.combineAt(toLL(e), outlineAt(map, e.point));
      // No tool waiting: select, swap or unselect (13e rules, exploreState.decideTap). A tap on a result
      // overlay (a fan ray) only shows its text (step 15b).
      if (!mode) {
        if (tipAt(map, e.point)) return;
        const geo = c.parcel?.geo;
        const line = outlineAt(map, e.point);
        return c.tap({
          insideOpen: !!geo && booleanPointInPolygon(point([e.lngLat.lng, e.lngLat.lat]), geo),
          outline: line ? parcelFromLine(line) : null,
          savedKey: savedAt(map, e.point),
        });
      }
      if (mode === "house") c.setHouse(toLL(e));
      else if (mode === "split") c.splitTap(toLL(e));
      else if (mode === "draw") {
        if (draft.length >= 3) {
          const p0 = map.project([draft[0]![1], draft[0]![0]]);
          if (Math.hypot(p0.x - e.point.x, p0.y - e.point.y) < CLOSE_PX) return c.finishDraw();
        }
        c.addCorner(cornerAt(map, c, e));
      }
    };
    const onDblClick = (e: MapMouseEvent) => {
      if (ref.current.current().mode !== "draw") return;
      e.preventDefault();
      ref.current.finishDraw();
    };
    const onKey = (e: KeyboardEvent) => {
      const c = ref.current,
        { mode, split } = c.current();
      if (!mode && !split) return;
      if ((e.target as HTMLElement | null)?.closest("input,select,textarea")) return;
      // Handled keys are marked, so the Info panel doesn't act on the same press (Esc closes it otherwise).
      if (e.key === "Escape") {
        e.preventDefault();
        c.cancelTool();
      }
      if (e.key === "Enter" && mode === "draw") c.finishDraw();
      if (e.key === "Enter" && mode === "combine" && c.combined?.ok) c.applyCombination();
    };
    map.on("click", onClick);
    map.on("dblclick", onDblClick);
    document.addEventListener("keydown", onKey);
    return () => {
      map.off("click", onClick);
      map.off("dblclick", onDblClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [map]);

  const mode = ctl.state.mode;
  // Once the cut is placed, a tap picks a piece.
  const picking = mode === "split" && !!ctl.state.split?.b;
  useEffect(() => {
    if (map) map.getCanvas().style.cursor = picking ? "pointer" : mode ? "crosshair" : "";
  }, [map, mode, picking]);
}

function useOverlays(map: MlMap | null, ctl: ExploreController) {
  const { draft, split, combine, layer } = ctl.state;
  const { parcel, pieces, combined, saved, shapes } = ctl;
  const open = ctl.state.store.open;
  const parcelHidden = !!open?.hidden.includes("parcel");
  // The map fits to the parcel when its boundary changes, not on every edit that re-derives it (a house, a
  // hidden layer). A parcel restored after a refresh keeps the saved map view instead.
  const boundary = useMemo(() => (parcel ? JSON.stringify(parcel.geo.geometry) : null), [parcel]);
  const restored = useRef(boundary);

  useEffect(() => {
    if (!map) return;
    map.getSource<GeoJSONSource>(SOURCE.parcel)?.setData(parcel && !parcelHidden ? parcel.geo : EMPTY);
  }, [map, parcel, parcelHidden]);

  useEffect(() => {
    if (!map) return;
    // The restored parcel is skipped once, on the first run with the map; reopened later, it fits.
    const skip = boundary !== null && boundary === restored.current;
    restored.current = null;
    if (!boundary || skip) return;
    // Leaflet's bounds.pad(0.4): 40% of the parcel's size added on every side.
    const [w, s, e, n] = bbox(JSON.parse(boundary));
    const dx = (e - w) * 0.4,
      dy = (n - s) * 0.4;
    map.fitBounds(
      [
        [w - dx, s - dy],
        [e + dx, n + dy],
      ],
      { padding: 0 },
    );
  }, [map, boundary]);

  useEffect(() => {
    map?.getSource<GeoJSONSource>(SOURCE.saved)?.setData({
      type: "FeatureCollection",
      features: saved.map((b) => ({ ...b.geo, properties: { key: b.key } })),
    });
  }, [map, saved]);

  useEffect(() => {
    map
      ?.getSource<GeoJSONSource>(SOURCE.sel)
      ?.setData(open ? selectionData(layer, open.pieces, shapes, open.split?.keep ?? null) : EMPTY);
  }, [map, layer, open, shapes]);

  useEffect(() => {
    map?.getSource<GeoJSONSource>(SOURCE.draft)?.setData(draftData(draft));
  }, [map, draft]);

  useEffect(() => {
    map
      ?.getSource<GeoJSONSource>(SOURCE.split)
      ?.setData(pieces && split?.b ? splitData(pieces, split.a, split.b) : EMPTY);
  }, [map, pieces, split]);

  useEffect(() => {
    map?.getSource<GeoJSONSource>(SOURCE.combine)?.setData(
      combine
        ? combineData(
            combine.map((m) => m.geo),
            combined,
          )
        : EMPTY,
    );
  }, [map, combine, combined]);
}

/** A draggable DOM marker; taps on it don't reach the map. */
function domMarker(className: string, title: string, color?: string): Marker {
  const el = document.createElement("div");
  el.className = className;
  el.title = title;
  if (color) el.style.background = color;
  el.addEventListener("click", (e) => e.stopPropagation());
  return new Marker({ element: el, draggable: true });
}

function useHouseMarker(map: MlMap | null, ctl: ExploreController) {
  const ref = useRef(ctl);
  const screen = useScreenItContext();
  const screenRef = useRef(screen);
  useEffect(() => {
    ref.current = ctl;
    screenRef.current = screen;
  });
  const marker = useRef<Marker | null>(null);
  const open = ctl.state.store.open;
  const house = open && !open.hidden.includes("house") ? open.house : null;
  const selected = ctl.state.layer === "house";

  useEffect(() => {
    if (!map) return;
    if (!house) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      const m = domMarker("bullseye", "Existing house — tap for its layer, drag to adjust");
      // A tap selects its layer (and opens the Info panel); the click that ends a drag doesn't.
      let dragged = false;
      m.on("dragstart", () => (dragged = true));
      m.on("dragend", () => {
        const p = m.getLngLat();
        ref.current.setHouse([p.lat, p.lng]);
      });
      m.getElement().addEventListener("click", () => {
        if (!dragged) {
          ref.current.selectLayer("house");
          // With an unsaved evaluation at a pin showing, the house takes the evaluation back to itself, as
          // the prototype's bulls-eye tap did (L641; owner, 15b).
          const s = screenRef.current;
          const at = ref.current.state.store.open?.house;
          if (s?.evaluated && at) s.evaluateAt(at, "the existing house");
        }
        dragged = false;
      });
      marker.current = m.setLngLat([house[1], house[0]]).addTo(map);
    } else marker.current.setLngLat([house[1], house[0]]);
  }, [map, house]);

  useEffect(() => {
    marker.current?.getElement().classList.toggle("selected", selected);
  }, [house, selected]);

  useEffect(
    () => () => {
      marker.current?.remove();
      marker.current = null;
    },
    [map],
  );
}

function useSplitMarkers(map: MlMap | null, ctl: ExploreController) {
  const ref = useRef(ctl);
  useEffect(() => {
    ref.current = ctl;
  });
  const markers = useRef<{ a: Marker | null; b: Marker | null }>({ a: null, b: null });
  const split = ctl.state.split;

  useEffect(() => {
    if (!map) return;
    const m = markers.current;
    const drop = (k: "a" | "b") => {
      m[k]?.remove();
      m[k] = null;
    };
    const place = (k: "a" | "b", ll: LatLon) => {
      if (!m[k]) {
        const mk = domMarker("pin", "Drag to move the dividing line", "#e0c43c");
        // Dragging an end re-splits live (proto L634).
        mk.on("drag", () => {
          const s = ref.current.current().split;
          if (!s) return;
          const p = mk.getLngLat();
          const ll: LatLon = [p.lat, p.lng];
          ref.current.moveSplit(k === "a" ? ll : s.a, k === "b" ? ll : s.b);
        });
        m[k] = mk.setLngLat([ll[1], ll[0]]).addTo(map);
      } else m[k].setLngLat([ll[1], ll[0]]);
    };
    if (!split) return void (drop("a"), drop("b"));
    place("a", split.a);
    if (split.b) place("b", split.b);
    else drop("b");
  }, [map, split]);

  useEffect(
    () => () => {
      markers.current.a?.remove();
      markers.current.b?.remove();
      markers.current = { a: null, b: null };
    },
    [map],
  );
}

/**
 * A label on each piece while a split is placed: its side and the acres keeping it gives. Tapping a label
 * (or anywhere in its piece) keeps that piece. When the parcel already has a split, ● marks the piece kept.
 */
function usePieceLabels(map: MlMap | null, ctl: ExploreController) {
  const ref = useRef(ctl);
  useEffect(() => {
    ref.current = ctl;
  });
  const markers = useRef(new Map<Side, Marker>());
  const { split } = ctl.state;
  const { pieces } = ctl;
  const kept = ctl.state.store.open?.split?.keep ?? null;

  useEffect(() => {
    if (!map) return;
    const labels = pieces && split?.b ? pieceLabels(pieces, split.a, split.b) : [];
    const m = markers.current;
    for (const [side, mk] of m)
      if (!labels.some((l) => l.side === side)) {
        mk.remove();
        m.delete(side);
      }
    for (const l of labels) {
      let mk = m.get(l.side);
      if (!mk) {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "piece-label";
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          ref.current.choosePiece(l.side);
        });
        mk = new Marker({ element: el });
        m.set(l.side, mk.setLngLat([l.at[1], l.at[0]]).addTo(map));
      } else mk.setLngLat([l.at[1], l.at[0]]);
      const el = mk.getElement();
      el.textContent = (l.side === kept ? "● " : "") + l.text;
      el.title = `Keep the ${l.text.split(" ·")[0]} piece`;
    }
  }, [map, pieces, split, kept]);

  useEffect(
    () => () => {
      for (const mk of markers.current.values()) mk.remove();
      markers.current.clear();
    },
    [map],
  );
}

/** While drawing onto a parcel, a ring where the next corner would snap (mouse only; a tap snaps the same). */
function useSnapIndicator(map: MlMap | null, ctl: ExploreController) {
  const ref = useRef(ctl);
  useEffect(() => {
    ref.current = ctl;
  });
  const drawing = ctl.state.mode === "draw" && !!ctl.state.store.open;

  useEffect(() => {
    if (!map || !drawing) return;
    const el = document.createElement("div");
    el.className = "snap-ring";
    const marker = new Marker({ element: el });
    let shown = false;
    const onMove = (e: MapMouseEvent) => {
      const s = snapCorner([e.point.x, e.point.y], snapRings(map, ref.current), SNAP_PX);
      if (s) {
        marker.setLngLat([s.ll[1], s.ll[0]]);
        if (!shown) marker.addTo(map);
        shown = true;
      } else if (shown) {
        marker.remove();
        shown = false;
      }
    };
    map.on("mousemove", onMove);
    return () => {
      map.off("mousemove", onMove);
      marker.remove();
    };
  }, [map, drawing]);
}

/** Zoomed out past this, saved parcels' labels hide so they don't crowd the map. */
const SAVED_LABEL_MIN_ZOOM = 13;

/** A "saved · N ac" label on each saved parcel (plan 13e §4); tapping one is a tap on that parcel. */
function useSavedLabels(map: MlMap | null, ctl: ExploreController) {
  const ref = useRef(ctl);
  useEffect(() => {
    ref.current = ctl;
  });
  const markers = useRef(new Map<string, Marker>());
  const { saved } = ctl;

  useEffect(() => {
    if (!map) return;
    const m = markers.current;
    for (const [key, mk] of m)
      if (!saved.some((b) => b.key === key)) {
        mk.remove();
        m.delete(key);
      }
    for (const b of saved) {
      const at = labelPoint(b.geo);
      let mk = m.get(b.key);
      if (!mk) {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "saved-label";
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          ref.current.tap({ insideOpen: false, outline: null, savedKey: b.key });
        });
        mk = new Marker({ element: el });
        m.set(b.key, mk.setLngLat([at[1], at[0]]).addTo(map));
      } else mk.setLngLat([at[1], at[0]]);
      mk.getElement().textContent = `saved · ${b.acres.toFixed(2)} ac`;
    }
  }, [map, saved]);

  useEffect(() => {
    if (!map) return;
    const onZoom = () =>
      map.getContainer().classList.toggle("saved-labels-off", map.getZoom() < SAVED_LABEL_MIN_ZOOM);
    onZoom();
    map.on("zoomend", onZoom);
    return () => {
      map.off("zoomend", onZoom);
    };
  }, [map]);

  useEffect(
    () => () => {
      for (const mk of markers.current.values()) mk.remove();
      markers.current.clear();
    },
    [map],
  );
}
