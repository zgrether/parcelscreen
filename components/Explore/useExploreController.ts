"use client";
/**
 * The explorer's tools, shared by the panel and the map: state from exploreReducer, plus the hints, lookups
 * and timers each action brings, and the parcel derived from its recipe. Exposed through ExploreContext.
 * The open parcel and History are saved to `ps.parcels` as they change (13e); 13d's `ps.current` is read once
 * and converted.
 */
import type { Feature, Polygon } from "geojson";
import type { Map as MlMap } from "maplibre-gl";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { browserHttp } from "@/lib/client/http";
import { loadParcelStore, recipeOf, type WorkingParcel } from "@/lib/client/parcelStore";
import { getPref, setPref } from "@/lib/client/prefs";
import { CancelledError } from "@/lib/http";
import { unreachableMessage } from "@/lib/client/pwa";
import { isServiceDown, serviceDownMessage } from "@/lib/geo/serviceStatus";
import { combineParcels, type CombineResult } from "@/lib/geo/combine";
import { parcelFromLine, pickParcelAt, type ParcelLine, type ParcelRecord } from "@/lib/geo/parcels";
import { fullRecord } from "@/lib/geo/parcelTiles";
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
import { SHEET_QUERY } from "./useBottomSheet";
import { layerTree, parcelShapes, type LayerId, type LayerNode, type ParcelShapes } from "./layers";

export type SetHint = (text: string | ((prev: string) => string)) => void;

/** A saved (built) parcel drawn on the map, with its "saved · N ac" label. */
export interface SavedShape {
  key: string;
  geo: Feature<Polygon>;
  acres: number;
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
  /** The open parcel's strip and split pieces, for the Layers tree and the map. */
  shapes: ParcelShapes | null;
  /** The Info panel's Layers tree for the open parcel. */
  layers: LayerNode | null;
  /** Pixels the Info panel covers on the map's right edge while it's docked there (desktop); 0 otherwise. */
  panelInset: number;
  /** Desktop (and phones on their side): panels float over the map rather than the bottom sheet. */
  docked: boolean;
  /** Bumped each time a tap is refused because a built parcel is open; the toolbar shows a brief note. */
  nudge: number;
  map: MlMap | null;
  setMap(map: MlMap | null): void;
  setMode(mode: Mode): void;
  /**
   * A tap on the map with no tool waiting: select, swap, unselect, or a nudge (decideTap). Selecting first
   * fetches the outline's full record (the drawn outlines are simplified).
   */
  tap(hit: TapHit): Promise<void>;
  close(): void;
  /** Opens a county parcel found by search, from its full record (the outline's fields name it). */
  openOutline(outline: { source: string; props: Record<string, unknown> }): Promise<void>;
  openSaved(key: string): void;
  removeSaved(key: string): void;
  /** Adds imported parcels to History (16b). */
  importParcels(added: WorkingParcel[]): void;
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
  setInfo(open: boolean): void;
  selectLayer(id: LayerId | null): void;
  /** The layer's ×: take a part out, remove the cut, remove the house. Returns why it can't, if it can't. */
  deleteLayer(id: LayerId): string | null;
  toggleHidden(id: LayerId): void;
  /** Keep the other piece of the saved split. */
  keepSide(side: Side): void;
  /** The Notes tab's text, for the parcel open when it was typed (state.serial then). */
  saveNotes(text: string, serial: number): void;
  /** A screen finished (kept under `id`) for the parcel open when it started (state.serial then). */
  screened(id: string, serial: number): void;
}

/** Shows a hint for a while, unless something else replaced it meanwhile. */
function flash(hint: SetHint, text: string, ms: number): void {
  hint(text);
  setTimeout(() => hint((h) => (h === text ? "" : h)), ms);
}

const LIMITS = SCREEN_CONSTANTS.combine;
const LOADING = "Loading parcel…";
/** The docked Info panel's footprint: globals.css `.info-panel` is 320 px wide, 10 px from the edge. */
const DOCKED_PANEL_INSET = 330;

/** Whether the Info panel docks beside the map (desktop, landscape) rather than over it (phone portrait). */
function useDocked(): boolean {
  return useSyncExternalStore(
    (changed) => {
      const q = window.matchMedia(SHEET_QUERY);
      q.addEventListener("change", changed);
      return () => q.removeEventListener("change", changed);
    },
    () => !window.matchMedia(SHEET_QUERY).matches,
    () => true,
  );
}
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
  const docked = useDocked();
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
          return d.ok ? [{ key: b.key!, geo: d.record.geo, acres: d.acres }] : [];
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

  const shapes = useMemo(() => (open ? parcelShapes(open, LIMITS) : null), [open]);
  const layers = useMemo(
    () => (open && derived && shapes ? layerTree(open, derived, shapes) : null),
    [open, derived, shapes],
  );

  /**
   * The full county record behind a drawn (simplified) outline, fetched by object id; null if a newer tap
   * superseded it or it couldn't be had (then nothing is selected: simplified geometry is never screened).
   */
  const full = async (outline: {
    source: string;
    props: Record<string, unknown>;
  }): Promise<ParcelRecord | null> => {
    lookup.current?.abort();
    const ctl = new AbortController();
    lookup.current = ctl;
    // Only a slow lookup says so: most take a fraction of a second.
    const slow = setTimeout(() => hint(LOADING), 250);
    try {
      const record = await fullRecord(browserHttp, outline, ctl.signal);
      hint((h) => (h === LOADING ? "" : h));
      return record;
    } catch (e) {
      hint((h) => (h === LOADING ? "" : h));
      if (e instanceof CancelledError) return null;
      // The service not answering (a timeout, a refused request, an HTTP error) says which one (owner, after 16b).
      if (isServiceDown(e))
        flash(hint, unreachableMessage(serviceDownMessage(outline.source), navigator.onLine), 6000);
      else flash(hint, "Couldn't load that parcel's record. Try again.", 2500);
      return null;
    } finally {
      clearTimeout(slow);
    }
  };

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
    shapes,
    layers,
    panelInset: docked && state.info && open ? DOCKED_PANEL_INSET : 0,
    docked,
    nudge,
    map,
    setMap,
    setMode,
    async tap(hit) {
      const o = decideTap(latest.current, hit);
      if (o.kind === "clearLayer") return dispatch({ type: "layer", id: null });
      if (o.kind === "close") {
        lookup.current?.abort();
        dispatch({ type: "close" });
      } else if (o.kind === "select") {
        const record = await full(o.record);
        if (!record) return;
        dispatch({ type: "select", record, stamp: stamp(), keepPanel: docked });
      } else if (o.kind === "openSaved") dispatch({ type: "openSaved", key: o.key, keepPanel: docked });
      // A built parcel stays open until it's closed: the toolbar says so, briefly.
      else if (o.kind === "nudge") return setNudge((n) => n + 1);
      if (o.kind !== "none") hint("");
      // An empty map because the parcel service isn't answering: say so, not nothing (owner, after 16b).
      else if (hit.serviceDown) hint(hit.serviceDown);
    },
    close() {
      lookup.current?.abort();
      dispatch({ type: "close" });
      hint("");
    },
    async openOutline(outline) {
      const record = await full(outline);
      if (record) dispatch({ type: "select", record, stamp: stamp(), keepPanel: docked });
    },
    openSaved(key) {
      dispatch({ type: "openSaved", key, keepPanel: docked });
    },
    removeSaved(key) {
      dispatch({ type: "removeSaved", key });
    },
    importParcels(added) {
      dispatch({ type: "imported", added });
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
      if (line) {
        const parcel = await full(parcelFromLine(line));
        if (parcel) dispatch({ type: "combineToggle", parcel });
        return;
      }
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
    setInfo(open) {
      dispatch({ type: "info", open });
    },
    selectLayer(id) {
      dispatch({ type: "layer", id });
    },
    deleteLayer(id) {
      const open = latest.current.store.open;
      if (!open) return null;
      if (id.startsWith("part:")) {
        const index = Number(id.slice("part:".length));
        const rest = open.pieces.filter((_, i) => i !== index);
        if (!rest.length) return null;
        // Taking a part out mustn't leave pieces that don't make one boundary.
        const d = deriveParcel({ parts: rest }, LIMITS);
        if (!d.ok)
          return d.reason === "too far apart"
            ? `The rest would be ${Math.round(d.gapM)} m apart, more than the ${LIMITS.maxGapM} m a road would explain.`
            : "The rest wouldn't make one boundary.";
        dispatch({ type: "removePart", index, stamp: stamp() });
      } else if (id === "split") dispatch({ type: "removeSplit", stamp: stamp() });
      else if (id === "house") dispatch({ type: "house", ll: null, stamp: stamp() });
      return null;
    },
    toggleHidden(id) {
      dispatch({ type: "toggleHidden", id, stamp: stamp() });
    },
    keepSide(side) {
      dispatch({ type: "keepSide", side, stamp: stamp() });
    },
    saveNotes(text, serial) {
      dispatch({ type: "notes", text, serial, stamp: stamp() });
    },
    screened(id, serial) {
      dispatch({ type: "screened", id, serial, stamp: stamp() });
    },
  };
}

export const ExploreContext = createContext<ExploreController | null>(null);

export function useExplore(): ExploreController {
  const c = useContext(ExploreContext);
  if (!c) throw new Error("useExplore outside ExploreContext");
  return c;
}
