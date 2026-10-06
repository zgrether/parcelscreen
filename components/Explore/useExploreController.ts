"use client";
/**
 * The explorer's tools, shared by the panel and the map: state from exploreReducer, plus the hints, lookups
 * and timers each action brings, and the parcel derived from its recipe. Exposed through ExploreContext.
 * The open parcel and History are saved to `ps.parcels` as they change (13e); 13d's `ps.current` is read once
 * and converted.
 */
import type { Feature, Polygon } from "geojson";
import type { Map as MlMap } from "maplibre-gl";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { browserHttp } from "@/lib/client/http";
import { loadParcelStore, recipeOf, type WorkingParcel } from "@/lib/client/parcelStore";
import { getPref, setPref } from "@/lib/client/prefs";
import { CancelledError } from "@/lib/http";
import { combineParcels, type CombineResult } from "@/lib/geo/combine";
import { parseLatLon } from "@/lib/geo/coords";
import { parcelFromLine, pickParcelAt, type ParcelLine, type ParcelRecord } from "@/lib/geo/parcels";
import { deriveParcel, ownLand, splitPreview, type DerivedParcel } from "@/lib/geo/recipe";
import { pieceAt, type Side, type SplitPieces } from "@/lib/geo/split";
import type { LatLon } from "@/lib/geo/types";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import {
  decideTap,
  exploreReducer,
  INITIAL,
  type ExploreAction,
  type ExploreState,
  type Mode,
  type Stamp,
  type TapHit,
} from "./exploreState";

export type SetHint = (text: string | ((prev: string) => string)) => void;

/** A saved (built) parcel drawn on the map. */
export interface SavedShape {
  key: string;
  geo: Feature<Polygon>;
}

export interface ExploreController {
  state: ExploreState;
  /** The state as of the last action, for event handlers that run before React re-renders. */
  current(): ExploreState;
  /** The open parcel's boundary and facts, derived from its recipe (null when nothing is open). */
  derived: DerivedParcel | null;
  /** The open parcel as one record (the boundary to screen), when it makes one. */
  parcel: ParcelRecord | null;
  /** Saved parcels other than the open one, for the map. */
  saved: SavedShape[];
  /** Both pieces of the split being placed, once the line has two ends, each with the acres keeping it gives. */
  pieces: SplitPieces | null;
  /** The combination of the picked parcels, once there are two. */
  combined: CombineResult | null;
  /** Bumped each time a tap is refused because a built parcel is open; the toolbar shows a brief note. */
  nudge: number;
  map: MlMap | null;
  setMap(map: MlMap | null): void;
  setMode(mode: Mode): void;
  goTo(text: string): void;
  /** A tap on the map with no tool waiting: select, swap, unselect, or a nudge (decideTap). */
  tap(hit: TapHit): void;
  close(): void;
  openSaved(key: string): void;
  removeSaved(key: string): void;
  setHouse(ll: LatLon | null): void;
  startDraw(): void;
  addCorner(ll: LatLon): void;
  undoCorner(): void;
  /** Esc or Cancel: whatever tool is in progress stops, nothing changes. */
  cancelTool(): void;
  finishDraw(): void;
  startSplit(): void;
  /** A tap while splitting: the line's two ends, then the piece to keep. */
  splitTap(ll: LatLon): void;
  moveSplit(a: LatLon, b: LatLon | null): void;
  choosePiece(side: Side): void;
  startCombine(): void;
  /** A tap while combining: the outline under it, else the parcel the services find there. */
  combineAt(ll: LatLon, line: ParcelLine | null): Promise<void>;
  applyCombination(): void;
}

/** Shows a hint for a while, unless something else replaced it meanwhile. */
function flash(hint: SetHint, text: string, ms: number): void {
  hint(text);
  setTimeout(() => hint((h) => (h === text ? "" : h)), ms);
}

const LIMITS = SCREEN_CONSTANTS.combine;
const stamp = (): Stamp => ({ now: new Date().toISOString(), key: crypto.randomUUID() });
const derive = (p: WorkingParcel) => deriveParcel(recipeOf(p), LIMITS);

export function useExploreController(parcelServices: readonly string[], hint: SetHint): ExploreController {
  // The open parcel and History from before a refresh. The explorer renders client-side only.
  const [restored] = useState<ExploreState>(() => {
    const s = stamp();
    return {
      ...INITIAL,
      store: loadParcelStore(getPref("ps.parcels"), getPref("ps.current"), s.now, () => s.key),
    };
  });
  const [state, setState] = useState<ExploreState>(restored);
  // The latest state, updated as each action is dispatched: a double-click delivers both clicks and the
  // dblclick before React re-renders, and each must see the one before it.
  const latest = useRef<ExploreState>(restored);
  const dispatch = useCallback((a: ExploreAction) => {
    latest.current = exploreReducer(latest.current, a);
    setState(latest.current);
  }, []);
  const [map, setMap] = useState<MlMap | null>(null);
  const [nudge, setNudge] = useState(0);
  const lookup = useRef<AbortController | null>(null);

  const { store } = state;
  useEffect(() => setPref("ps.parcels", store), [store]);

  const open = store.open;
  const derived = useMemo(() => (open ? derive(open) : null), [open]);
  const parcel = derived?.ok ? derived.record : null;

  const saved = useMemo(
    () =>
      store.built
        .filter((b) => b.key !== open?.key)
        .flatMap((b) => {
          const d = derive(b);
          return d.ok ? [{ key: b.key!, geo: d.record.geo }] : [];
        }),
    [store.built, open?.key],
  );

  // The split tool cuts the whole combined boundary, before any split. The boundary and the parts' own land
  // are worked out once per parcel, so dragging the line only cuts.
  const parts = open?.pieces,
    placing = state.split !== null;
  const unsplit = useMemo(() => {
    if (!parts || !placing) return null;
    const base = deriveParcel({ parts }, LIMITS);
    return base.ok ? { boundary: base.record.geo, own: ownLand(parts) } : null;
  }, [parts, placing]);
  const pieces = useMemo(() => {
    const line = state.split;
    if (!unsplit || !line?.b) return null;
    return splitPreview(unsplit.boundary, unsplit.own, line.a, line.b);
  }, [unsplit, state.split]);

  const combined = useMemo(
    () =>
      state.combine && state.combine.length >= 2
        ? combineParcels(
            state.combine.map((m) => m.geo),
            LIMITS,
          )
        : null,
    [state.combine],
  );

  const setMode = useCallback(
    (mode: Mode) => {
      dispatch({ type: "mode", mode });
      hint("");
    },
    [dispatch, hint],
  );

  return {
    state,
    current: () => latest.current,
    derived,
    parcel,
    saved,
    pieces,
    combined,
    nudge,
    map,
    setMap,
    setMode,
    goTo(text) {
      const ll = parseLatLon(text);
      if (!ll) return hint("Need two numbers: lat, lon");
      map?.jumpTo({ center: [ll[1], ll[0]], zoom: 16 });
      hint("");
    },
    tap(hit) {
      const o = decideTap(latest.current, hit);
      if (o.kind === "close") dispatch({ type: "close" });
      else if (o.kind === "select") dispatch({ type: "select", record: o.record, stamp: stamp() });
      else if (o.kind === "openSaved") dispatch({ type: "openSaved", key: o.key });
      // A built parcel stays open until it's closed: the toolbar says so, briefly.
      else if (o.kind === "nudge") return setNudge((n) => n + 1);
      if (o.kind !== "none") hint("");
    },
    close() {
      lookup.current?.abort();
      dispatch({ type: "close" });
      hint("");
    },
    openSaved(key) {
      dispatch({ type: "openSaved", key });
    },
    removeSaved(key) {
      dispatch({ type: "removeSaved", key });
    },
    setHouse(ll) {
      if (latest.current.mode === "house") hint("");
      dispatch({ type: "house", ll, stamp: stamp() });
    },
    startDraw() {
      dispatch({ type: "startDraw" });
      hint("");
    },
    addCorner(ll) {
      dispatch({ type: "draftAdd", ll });
    },
    undoCorner() {
      dispatch({ type: "draftUndo" });
    },
    cancelTool() {
      const m = latest.current.mode;
      if (m === "draw") dispatch({ type: "draftCancel" });
      else if (m === "split" || (!m && latest.current.split)) dispatch({ type: "splitCancel" });
      else if (m === "combine") dispatch({ type: "combineCancel" });
      else if (m) dispatch({ type: "mode", mode: null });
      hint("");
    },
    finishDraw() {
      if (latest.current.draft.length < 3) return hint("Need at least three corners");
      dispatch({ type: "finishDraw", stamp: stamp() });
      hint("");
    },
    startSplit() {
      dispatch({ type: "startSplit" });
      hint("");
    },
    splitTap(ll) {
      if (!latest.current.split?.b) return dispatch({ type: "splitTap", ll });
      const side = pieces && pieceAt(pieces, ll);
      if (side) dispatch({ type: "keepPiece", side, stamp: stamp() });
    },
    moveSplit(a, b) {
      dispatch({ type: "splitMove", a, b });
    },
    choosePiece(side) {
      dispatch({ type: "keepPiece", side, stamp: stamp() });
      hint("");
    },
    startCombine() {
      dispatch({ type: "startCombine" });
      hint("");
    },
    async combineAt(ll, line) {
      if (line) return dispatch({ type: "combineToggle", parcel: parcelFromLine(line) });
      lookup.current?.abort();
      const ctl = new AbortController();
      lookup.current = ctl;
      hint("Looking up parcel…");
      try {
        const { parcel } = await pickParcelAt(browserHttp, parcelServices, ll, ctl.signal);
        if (parcel) {
          dispatch({ type: "combineToggle", parcel });
          hint("");
        } else flash(hint, "No parcel record here.", 2000);
      } catch (e) {
        if (!(e instanceof CancelledError)) throw e;
      }
    },
    applyCombination() {
      const members = latest.current.combine;
      if (!members || members.length < 2) return;
      const r = combineParcels(
        members.map((m) => m.geo),
        LIMITS,
      );
      if (!r.ok) return;
      dispatch({ type: "applyCombine", stamp: stamp() });
      hint("");
    },
  };
}

export const ExploreContext = createContext<ExploreController | null>(null);

export function useExplore(): ExploreController {
  const c = useContext(ExploreContext);
  if (!c) throw new Error("useExplore outside ExploreContext");
  return c;
}
