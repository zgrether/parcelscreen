"use client";
/**
 * The parcel-finding tools on the map (proto L561–707): taps per tool mode, tapping an outline, the draw
 * keys, and the overlays: the loaded parcel, the draft, the split pieces, and the house and split-end
 * markers (DOM markers, as CLAUDE.md asks, not canvas sprites).
 */
import { bbox } from "@turf/turf";
import {
  Marker,
  Popup,
  type GeoJSONSource,
  type Map as MlMap,
  type MapLayerMouseEvent,
  type MapMouseEvent,
} from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { LatLon } from "@/lib/geo/types";
import { useExplore, type ExploreController } from "@/components/Explore/useExploreController";
import { useMap } from "./MapView";
import { combineData, draftData, splitData } from "./overlays";
import { LAYER, SOURCE } from "./style";
import { outlineAt } from "./useParcelLines";

const EMPTY = { type: "FeatureCollection" as const, features: [] };
const toLL = (e: MapMouseEvent): LatLon => [e.lngLat.lat, e.lngLat.lng];
/** A tap this close (px) to the first corner closes the drawn boundary (proto L651). */
const CLOSE_PX = 14;

export function ParcelTools() {
  const map = useMap();
  const ctl = useExplore();
  useMapTaps(map, ctl);
  useOverlays(map, ctl);
  useHouseMarker(map, ctl);
  useSplitMarkers(map, ctl);
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
      // With no tool waiting for taps (or the tap lookup), tapping an outline loads it (proto L545).
      if (mode !== "draw" && mode !== "house" && mode !== "split") {
        const line = outlineAt(map, e.point);
        if (line) return c.selectOutline(line);
      }
      if (mode === "pick") void c.pickAt(toLL(e));
      else if (mode === "house") c.setHouse(toLL(e));
      else if (mode === "split") c.splitTap(toLL(e));
      else if (mode === "draw") {
        if (draft.length >= 3) {
          const p0 = map.project([draft[0]![1], draft[0]![0]]);
          if (Math.hypot(p0.x - e.point.x, p0.y - e.point.y) < CLOSE_PX) return c.finishDraw();
        }
        c.addCorner(toLL(e));
      }
    };
    const onDblClick = (e: MapMouseEvent) => {
      if (ref.current.current().mode !== "draw") return;
      e.preventDefault();
      ref.current.finishDraw();
    };
    const onKey = (e: KeyboardEvent) => {
      if (ref.current.current().mode !== "draw") return;
      if ((e.target as HTMLElement | null)?.closest("input,select,textarea")) return;
      if (e.key === "Enter") ref.current.finishDraw();
      if (e.key === "Escape") ref.current.cancelDraw();
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
  useEffect(() => {
    if (map) map.getCanvas().style.cursor = mode ? "crosshair" : "";
  }, [map, mode]);
}

function useOverlays(map: MlMap | null, ctl: ExploreController) {
  const { parcel, draft, split, combine } = ctl.state;
  const { pieces, combined } = ctl;
  // A parcel restored after a refresh keeps the saved map view instead of fitting to it.
  const [restored] = useState(parcel);

  useEffect(() => {
    if (!map) return;
    map.getSource<GeoJSONSource>(SOURCE.parcel)?.setData(parcel ? parcel.geo : EMPTY);
    if (!parcel || parcel === restored) return;
    // Leaflet's bounds.pad(0.4): 40% of the parcel's size added on every side.
    const [w, s, e, n] = bbox(parcel.geo);
    const dx = (e - w) * 0.4,
      dy = (n - s) * 0.4;
    map.fitBounds(
      [
        [w - dx, s - dy],
        [e + dx, n + dy],
      ],
      { padding: 0 },
    );
  }, [map, parcel, restored]);

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

  // Each piece's acreage on hover (the prototype's tooltips).
  useEffect(() => {
    if (!map) return;
    const tip = new Popup({ closeButton: false, closeOnClick: false });
    const onMove = (e: MapLayerMouseEvent) => {
      const label = e.features?.[0]?.properties?.label;
      if (typeof label === "string") tip.setLngLat(e.lngLat).setText(label).addTo(map);
    };
    const onLeave = () => tip.remove();
    map.on("mousemove", LAYER.splitFill, onMove);
    map.on("mouseleave", LAYER.splitFill, onLeave);
    return () => {
      map.off("mousemove", LAYER.splitFill, onMove);
      map.off("mouseleave", LAYER.splitFill, onLeave);
      tip.remove();
    };
  }, [map]);
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
  useEffect(() => {
    ref.current = ctl;
  });
  const marker = useRef<Marker | null>(null);
  const house = ctl.state.house;

  useEffect(() => {
    if (!map) return;
    if (!house) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      const m = domMarker("bullseye", "Existing house — drag to adjust");
      m.on("dragend", () => {
        const p = m.getLngLat();
        ref.current.setHouse([p.lat, p.lng]);
      });
      marker.current = m.setLngLat([house[1], house[0]]).addTo(map);
    } else marker.current.setLngLat([house[1], house[0]]);
  }, [map, house]);

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
