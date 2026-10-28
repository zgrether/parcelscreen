"use client";
/**
 * The parcel tools on the map (proto L561–707, 13e): taps per tool mode, selecting and unselecting parcels,
 * the draw keys, snapping drawn corners to the open parcel, and the overlays: the selected parcel, saved
 * parcels and their labels, the layer selected in Details (step 8b), the draft, the split pieces and their
 * labels, and the house and split-end markers (DOM markers, as CLAUDE.md asks, not canvas sprites), and the point
 * markers (WF4), which drag like the house.
 */
import { mapShowing } from "@/lib/client/mapShowing";
import { bbox, booleanPointInPolygon, point } from "@turf/turf";
import {
  Marker,
  type GeoJSONSource,
  type Map as MlMap,
  type MapMouseEvent,
  type MapTouchEvent,
} from "maplibre-gl";
import { useEffect, useMemo, useRef } from "react";
import { snapCorner, type SnapRing } from "@/lib/geo/snap";
import type { SplitPieces } from "@/lib/geo/split";
import { piecesOf } from "@/lib/split/scenario";
import type { LatLon } from "@/lib/geo/types";
import { parcelFromLine } from "@/lib/geo/parcels";
import { LINES_MIN_ZOOM } from "@/lib/geo/parcelTiles";
import { DRAWING, panelView, toolOpen } from "@/components/Explore/exploreState";
import { layerLine, lineLayer } from "@/components/Explore/layers";
import { useExplore, type ExploreController } from "@/components/Explore/useExploreController";
import { KIND_NAME, type PointMarkup } from "@/lib/client/parcelStore";
import { markIconSvg } from "./markIcons";

/** A point marker's pin, px across: the kind's icon (owner, after #136). */
const PIN_PX = 28;
import { useScreenItContext } from "@/components/Results/ScreenItContext";
import { TIP_LAYERS, tipAt } from "./results/tooltip";
import { placeAt } from "./PlacesLayer";
import { publicLandAt } from "./PublicLandLayer";
import { routeAt } from "./MvumLayer";
import { installTiltRotate } from "./tiltRotate";
import { eventTime, isDoubleTap, type Tap } from "./doubleTap";
import { useMap } from "./MapView";
import {
  combineData,
  draftData,
  labelPoint,
  markupData,
  pieceLabels,
  selectionData,
  splitData,
} from "./overlays";
import { LAYER, SOURCE } from "./style";
import { outlineAt, parcelServiceDown } from "./useParcelLines";
import { useMapLayerPrefs } from "./useMapLayerPrefs";

// A drawn line's tooltip: what it is, its length and grades (34-2); an area marker's, its acres (WF4).
TIP_LAYERS.add(LAYER.markupEasement);
TIP_LAYERS.add(LAYER.markupTrack);
TIP_LAYERS.add(LAYER.markupAreaFill);

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
  const splits = useShownSplits(ctl);
  useOverlays(map, ctl, splits);
  useHouseMarker(map, ctl);
  usePointMarkers(map, ctl);
  useSplitMarkers(map, ctl);
  usePieceLabels(map, splits);
  useSnapIndicator(map, ctl);
  useSavedLabels(map, ctl);
  return null;
}

/** A press on the map this long opens the Mark picker on a phone, ms (as a name's long press, LongName). */
const LONG_PRESS_MS = 500;
/** How far a finger may move during it, px, before it's a pan instead. */
const PRESS_SLOP_PX = 10;
/** A click this soon after a touchend is that touch's tap, ms (a touch's click comes at once; the mouse's waits 400). */
const TOUCH_CLICK_MS = 300;

/** How near a tap must be to a drawn line to select it in Layers, in pixels. */
const LINE_TAP_PX = 8;
const MARKUP_LAYERS = [LAYER.markupTrack, LAYER.markupTrackHalo, LAYER.markupEasement, LAYER.markupAreaFill];

/** The drawn line, or area marker (WF4), under a tap, by id (owner, A), or null. */
function markupAt(map: MlMap, p: { x: number; y: number }): string | null {
  const layers = MARKUP_LAYERS.filter((id) => map.getLayer(id));
  if (!layers.length) return null;
  const box: [[number, number], [number, number]] = [
    [p.x - LINE_TAP_PX, p.y - LINE_TAP_PX],
    [p.x + LINE_TAP_PX, p.y + LINE_TAP_PX],
  ];
  const id = map.queryRenderedFeatures(box, { layers })[0]?.properties?.id;
  return typeof id === "string" ? id : null;
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
    // Z-1 (UX part 2, P-10; Zach, after #333): with no tool open, a phone's double-tap zooms in a level, taking back
    // what its first tap did (that acted at once: a touch tap isn't held back as the mouse's click is). With a tool
    // open, the second tap is a corner, as before.
    let touchEndAt = -Infinity;
    let lastTap: Tap | null = null;
    const onClick = (e: MapMouseEvent) => {
      // The tap that ended a long press opened the picker: it isn't a tap on the map too.
      if (pressed) return void (pressed = false);
      const c = ref.current;
      const { mode, draft } = c.current();
      const now = eventTime(e.originalEvent);
      if (now - touchEndAt < TOUCH_CLICK_MS && !toolOpen(c.current())) {
        const tap = { t: now, x: e.point.x, y: e.point.y };
        if (isDoubleTap(lastTap, tap)) {
          lastTap = null;
          const zoom = () => map.easeTo({ zoom: map.getZoom() + 1, around: e.lngLat, duration: 300 });
          if (!c.undoTap(now)) return zoom();
          // The parcel the first tap opened is closing: its sheet's padding settles first (MapView moves the camera
          // for it once the close renders), or it would cut the zoom short.
          return void requestAnimationFrame(() =>
            requestAnimationFrame(() => (map.isMoving() ? map.once("moveend", zoom) : zoom())),
          );
        }
        lastTap = tap;
      } else lastTap = null;
      // Combining: each tap adds or removes the parcel under it (step 13b).
      if (mode === "combine") return void c.combineAt(toLL(e), outlineAt(map, e.point));
      // No tool waiting: select, swap or unselect (13e rules, exploreState.decideTap). A tap on a result
      // overlay (a fan ray) only shows its text (step 15b).
      if (!mode) {
        // A drawn line opens its row in Details (owner, #127; step 8b); its tooltip shows on hover.
        const drawn = markupAt(map, e.point);
        if (drawn) return c.selectLayer(lineLayer(drawn));
        if (tipAt(map, e.point) || placeAt(map, e.point)) return;
        // Step 16: a route or fee public land under the tap opens its card, not the county tract beneath it.
        if (routeAt(map, e.point) || publicLandAt(map, e.point)?.fee) return;
        const geo = c.parcel?.geo;
        const line = outlineAt(map, e.point);
        return c.tap({
          insideOpen: !!geo && booleanPointInPolygon(point([e.lngLat.lng, e.lngLat.lat]), geo),
          outline: line ? parcelFromLine(line) : null,
          savedKey: savedAt(map, e.point),
          serviceDown: parcelServiceDown(map),
          linesShown: map.getZoom() >= LINES_MIN_ZOOM,
          at: now,
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
      } else if (mode === "track" || mode === "easement" || mode === "drive")
        c.addCorner(cornerAt(map, c, e)); // follow-up 34
      else if (mode === "point")
        c.placePoint(toLL(e)); // WF4
      else if (mode === "area") c.addCorner(cornerAt(map, c, e));
    };
    const onDblClick = (e: MapMouseEvent) => {
      const mode = ref.current.current().mode;
      if (mode !== "draw" && mode !== "track" && mode !== "easement" && mode !== "drive" && mode !== "area")
        return;
      e.preventDefault();
      if (mode === "draw") ref.current.finishDraw();
      else if (mode === "area") ref.current.finishArea();
      else ref.current.finishLine();
    };
    const onKey = (e: KeyboardEvent) => {
      const c = ref.current,
        { mode, split } = c.current();
      if ((!mode && !split) || !mapShowing()) return;
      if ((e.target as HTMLElement | null)?.closest("input,select,textarea")) return;
      // Handled keys are marked, so Details doesn't act on the same press (its Esc closes the open row).
      if (e.key === "Escape") {
        e.preventDefault();
        c.cancelTool();
      }
      if (e.key === "Enter" && mode === "draw") c.finishDraw();
      if (e.key === "Enter" && (mode === "track" || mode === "easement" || mode === "drive")) c.finishLine();
      if (e.key === "Enter" && mode === "area") c.finishArea();
      if (e.key === "Enter" && mode === "combine" && c.combined?.ok) c.applyCombination();
    };
    // A long press on a phone, or a right-click on a desktop, opens the Mark picker there (owner, after #136): with a
    // parcel open and no tool in use. The picker puts the mark, or a line's first point, where it was opened.
    let press: { timer: number; x: number; y: number } | null = null;
    let pressed = false;
    const endPress = () => {
      if (press) window.clearTimeout(press.timer);
      press = null;
    };
    const pickerAt = (lngLat: { lat: number; lng: number }, x: number, y: number) => {
      const c = ref.current;
      const { mode, split, store } = c.current();
      if (mode || split || !store.open) return false;
      c.openPicker([lngLat.lat, lngLat.lng], { x, y });
      return true;
    };
    const onTouchStart = (e: MapTouchEvent) => {
      endPress();
      pressed = false;
      if (e.points.length !== 1) return;
      const { lngLat, point } = e;
      const box = map.getCanvas().getBoundingClientRect();
      press = {
        x: point.x,
        y: point.y,
        timer: window.setTimeout(() => {
          press = null;
          pressed = pickerAt(lngLat, box.left + point.x, box.top + point.y);
        }, LONG_PRESS_MS),
      };
    };
    const onTouchMove = (e: MapTouchEvent) => {
      if (press && Math.hypot(e.point.x - press.x, e.point.y - press.y) > PRESS_SLOP_PX) endPress();
    };
    const onContextMenu = (e: MapMouseEvent) => {
      e.preventDefault();
      // A phone's own long-press menu event comes too: the timer already opened the picker.
      if (pressed) return;
      pickerAt(e.lngLat, e.originalEvent.clientX, e.originalEvent.clientY);
    };
    map.on("touchstart", onTouchStart);
    map.on("touchmove", onTouchMove);
    const onTouchEnd = (e: MapTouchEvent) => {
      endPress();
      touchEndAt = eventTime(e.originalEvent);
    };
    map.on("touchend", onTouchEnd);
    map.on("touchcancel", endPress);
    map.on("contextmenu", onContextMenu);
    map.on("click", onClick);
    map.on("dblclick", onDblClick);
    document.addEventListener("keydown", onKey);
    // Double-click and drag, or middle-drag, tilts and rotates; a double-click alone zooms in (Google Earth's
    // way, owner 2026-10-10). Not while a tool is open: Draw finishes a boundary with a double-click.
    const uninstall = installTiltRotate(map, () => toolOpen(ref.current.current()));
    return () => {
      endPress();
      map.off("touchstart", onTouchStart);
      map.off("touchmove", onTouchMove);
      map.off("touchend", onTouchEnd);
      map.off("touchcancel", endPress);
      map.off("contextmenu", onContextMenu);
      map.off("click", onClick);
      map.off("dblclick", onDblClick);
      document.removeEventListener("keydown", onKey);
      uninstall();
    };
  }, [map]);

  const mode = ctl.state.mode;
  // Once the cut is placed, its ends are dragged to move it (step 14: no piece is picked on the map).
  const placed = mode === "split" && !!ctl.state.split?.b;
  useEffect(() => {
    if (map) map.getCanvas().style.cursor = !placed && mode ? "crosshair" : "";
  }, [map, mode, placed]);
}

/** A split line on the map, its two pieces and their acres; `id` tells their labels apart. */
interface ShownSplit {
  id: string;
  a: LatLon;
  b: LatLon;
  pieces: SplitPieces;
}

/**
 * The splits drawn on the map: the split tool's line once placed, or else, while Uses shows the open parcel, each of
 * its scenarios (owner, after #312: a scenario's line and pieces drawn, labelled, while it's open).
 */
function useShownSplits(ctl: ExploreController): ShownSplit[] {
  const { split, mode } = ctl.state;
  const { pieces } = ctl;
  const open = ctl.state.store.open;
  const onUses = panelView(ctl.state) === "uses";
  const parts = open?.pieces,
    scenarios = open?.scenarios;
  const fromScenarios = useMemo(() => {
    if (!open || !onUses || !scenarios?.length) return [];
    return scenarios.flatMap((sc): ShownSplit[] => {
      const two = piecesOf(open, sc);
      if (!two) return [];
      const [left, right] = two;
      return [
        {
          id: sc.id,
          a: sc.a,
          b: sc.b,
          pieces: { left: left.geo, right: right.geo, leftAc: left.acres, rightAc: right.acres },
        },
      ];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the pieces follow the parts and the scenarios' lines
  }, [onUses, parts, scenarios]);
  if (pieces && split?.b) return [{ id: "tool", a: split.a, b: split.b, pieces }];
  return mode === "split" ? [] : fromScenarios;
}

function useOverlays(map: MlMap | null, ctl: ExploreController, splits: readonly ShownSplit[]) {
  const { draft, combine, layer } = ctl.state;
  const { parcel, combined, saved, shapes } = ctl;
  const open = ctl.state.store.open;
  const parcelHidden = !!open?.hidden.includes("parcel");
  // The map fits to the parcel when its boundary changes, not on every edit that re-derives it (a house, a
  // hidden layer). A parcel restored after a refresh keeps the saved map view instead.
  const boundary = useMemo(() => (parcel ? JSON.stringify(parcel.geo.geometry) : null), [parcel]);
  const restored = useRef(boundary);
  const live = useRef(ctl);
  useEffect(() => {
    live.current = ctl;
  });

  useEffect(() => {
    if (!map) return;
    map.getSource<GeoJSONSource>(SOURCE.parcel)?.setData(parcel && !parcelHidden ? parcel.geo : EMPTY);
  }, [map, parcel, parcelHidden]);

  // Follow-up 34: the open parcel's drawn tracks and easements, with their grades from its screen (34-2).
  const markup = open?.markup;
  const screen = useScreenItContext();
  const measured = screen?.shown && !screen.stale ? screen.shown.result.lines : undefined;
  const selectedLine = layerLine(layer);
  const hoverLine = ctl.hoverLine;
  // Map layers' Your lines and marks (step 8b): off hides them all; each row's eye still works within it.
  const marksShown = useMapLayerPrefs().marks;
  useEffect(() => {
    map
      ?.getSource<GeoJSONSource>(SOURCE.markup)
      ?.setData(markupData(marksShown ? (markup ?? []) : [], measured, selectedLine, hoverLine));
  }, [map, markup, marksShown, measured, selectedLine, hoverLine]);

  useEffect(() => {
    if (!map) return;
    // The restored parcel is skipped once, on the first run with the map; reopened later, it fits.
    const skip = boundary !== null && boundary === restored.current;
    restored.current = null;
    if (!boundary || skip) return;
    // Closed again before this ran: a double-tap took its tap back, and its zoom has the map (Zach, after #333).
    if (!live.current.current().store.open) return;
    // Leaflet's bounds.pad(0.4): 40% of the parcel's size added on every side.
    const [w, s, e, n] = bbox(JSON.parse(boundary));
    const dx = (e - w) * 0.4,
      dy = (n - s) * 0.4;
    // A short, straight ease (the UX audit's B-5): a long fly from the region out and back in, cut short by the sheet
    // settling, left the map zoomed out on the way. The map's own padding (the docked panel, the sheet) is added.
    map.fitBounds(
      [
        [w - dx, s - dy],
        [e + dx, n + dy],
      ],
      { padding: 0, linear: true, duration: 450 },
    );
  }, [map, boundary]);

  useEffect(() => {
    map?.getSource<GeoJSONSource>(SOURCE.saved)?.setData({
      type: "FeatureCollection",
      features: saved.map((b) => ({ ...b.geo, properties: { key: b.key, ruledOut: b.ruledOut } })),
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
    map?.getSource<GeoJSONSource>(SOURCE.split)?.setData({
      type: "FeatureCollection",
      features: splits.flatMap((x) => splitData(x.pieces, x.a, x.b).features),
    });
  }, [map, splits]);

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
  const marksShown = useMapLayerPrefs().marks;
  const house = marksShown && open && !open.hidden.includes("house") ? open.house : null;
  const selected = ctl.state.layer === "house";

  useEffect(() => {
    if (!map) return;
    if (!house) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      // The house keeps its bulls-eye: the report's prototype sentences name it so ("…or the bulls-eye on the map").
      const m = domMarker("bullseye", "Existing house — tap for its layer, drag to adjust");
      // A tap opens its row in Details (step 8b); the click that ends a drag doesn't.
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

/**
 * The open parcel's point markers (WF4), as DOM pins: a tap opens its row in Details (step 8b), a drag moves it, as the
 * house's bulls-eye does. One pin per marker, kept by id, so a pin being dragged isn't rebuilt under the finger.
 */
function usePointMarkers(map: MlMap | null, ctl: ExploreController) {
  const ref = useRef(ctl);
  useEffect(() => {
    ref.current = ctl;
  });
  const pins = useRef(new Map<string, Marker>());
  const open = ctl.state.store.open;
  const marksShown = useMapLayerPrefs().marks;
  const points = useMemo(
    () => (marksShown ? (open?.markup ?? []) : []).filter((m): m is PointMarkup => m.shape === "point"),
    [open?.markup, marksShown],
  );
  const selected = layerLine(ctl.state.layer);

  useEffect(() => {
    if (!map) return;
    const keep = new Set(points.map((m) => m.id));
    for (const [id, pin] of pins.current)
      if (!keep.has(id)) {
        pin.remove();
        pins.current.delete(id);
      }
    for (const m of points) {
      let pin = pins.current.get(m.id);
      if (!pin) {
        pin = domMarker("mark-pin", "");
        let dragged = false;
        pin.on("dragstart", () => (dragged = true));
        pin.on("dragend", () => {
          const p = pin!.getLngLat();
          ref.current.movePoint(m.id, [p.lat, p.lng], ref.current.state.serial);
        });
        pin.getElement().addEventListener("click", () => {
          if (!dragged) ref.current.selectLayer(lineLayer(m.id));
          dragged = false;
        });
        pins.current.set(m.id, pin.setLngLat([m.ll[1], m.ll[0]]).addTo(map));
      } else pin.setLngLat([m.ll[1], m.ll[0]]);
      const el = pin.getElement();
      el.innerHTML = markIconSvg(m.kind, PIN_PX);
      el.title = `${m.name} (${KIND_NAME[m.kind].toLowerCase()}): tap for its details, drag to move it`;
      el.setAttribute("aria-label", m.name);
    }
  }, [map, points]);

  useEffect(() => {
    for (const [id, pin] of pins.current) pin.getElement().classList.toggle("selected", id === selected);
  }, [points, selected]);

  useEffect(
    () => () => {
      for (const pin of pins.current.values()) pin.remove();
      pins.current.clear();
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
 * A label on each piece of each split shown: its side and its acres. Step 14: a label only, since both pieces are
 * graded (Grade both pieces), not one kept.
 */
function usePieceLabels(map: MlMap | null, splits: readonly ShownSplit[]) {
  const markers = useRef(new Map<string, Marker>());

  useEffect(() => {
    if (!map) return;
    // Keyed by its anchor too: a marker's anchor is set when it's made.
    const labels = splits.flatMap((x) =>
      pieceLabels(x.pieces, x.a, x.b).map((l) => ({ ...l, key: `${x.id}:${l.side}:${l.anchor}` })),
    );
    const m = markers.current;
    for (const [key, mk] of m)
      if (!labels.some((l) => l.key === key)) {
        mk.remove();
        m.delete(key);
      }
    for (const l of labels) {
      let mk = m.get(l.key);
      if (!mk) {
        const el = document.createElement("span");
        el.className = "piece-label static";
        mk = new Marker({ element: el, anchor: l.anchor });
        m.set(l.key, mk.setLngLat([l.at[1], l.at[0]]).addTo(map));
      } else mk.setLngLat([l.at[1], l.at[0]]);
      mk.getElement().textContent = l.text;
    }
  }, [map, splits]);

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
  const drawing = DRAWING.includes(ctl.state.mode) && !!ctl.state.store.open;

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
