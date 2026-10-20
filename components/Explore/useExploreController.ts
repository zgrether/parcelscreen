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
import { parcelName } from "@/lib/client/historyRows";
import { clearUnreadableScreens } from "@/lib/client/screenStore";
import {
  loadParcelStore,
  recipeOf,
  type LineCondition,
  type ListingField,
  type Milestone,
  type Markup,
  type LineKind,
  type MarkupKind,
  type ParcelStore,
  type WorkingParcel,
} from "@/lib/client/parcelStore";
import { getPref, onParcelsWritten, parcelsWritten, setPref } from "@/lib/client/prefs";
import { registerLiveParcels } from "@/lib/client/liveParcels";
import { currentProfileId } from "@/lib/client/profiles";
import { dropParcel } from "@/lib/client/householdDoc";
import { logGraded, useHistoryLog } from "@/lib/client/favoritesStore";
import { visibleTo } from "@/lib/client/favorites";
import { ATTACH_MS, attachPatch, type SearchedListing } from "@/lib/client/attachListing";
import { CancelledError } from "@/lib/http";
import { unreachableMessage } from "@/lib/client/pwa";
import { isServiceDown, serviceDownMessage } from "@/lib/geo/serviceStatus";
import { combineParcels, type CombineResult } from "@/lib/geo/combine";
import { parcelFromLine, pickParcelAt, type ParcelLine, type ParcelRecord } from "@/lib/geo/parcels";
import { fieldsFor, fullRecord } from "@/lib/geo/parcelTiles";
import { deriveParcel, ownLand, splitPreview, type DerivedParcel } from "@/lib/geo/recipe";
import { pieceAt, type Side, type SplitPieces } from "@/lib/geo/split";
import type { LatLon } from "@/lib/geo/types";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import type { MarkKind, SepticClass } from "@/lib/report/marks";
import { TOOL, withRecent, type MarkChoice } from "@/lib/client/markChoices";
import {
  BUSY_TEXT,
  decideTap,
  exploreReducer,
  INITIAL,
  DRAWING,
  NO_PARCEL_HERE,
  type ExploreAction,
  type ExploreState,
  type Mode,
  type Stamp,
  type TapHit,
} from "./exploreState";
import { SHEET_QUERY } from "./useBottomSheet";
import {
  layerLine,
  layerTree,
  parcelShapes,
  type LayerId,
  type LayerNode,
  type ParcelShapes,
} from "./layers";

export type SetHint = (text: string | ((prev: string) => string)) => void;

/** A saved (built) parcel drawn on the map, with its "saved · N ac" label. */
export interface SavedShape {
  key: string;
  geo: Feature<Polygon>;
  acres: number;
}

/** What the start-up sweep cleared (v3's clean break, B2a): the map says so once (ClearedNote). */
export interface ClearedNotice {
  /** Kept results that weren't the current schema. */
  results: number;
  /** The parcels dropped because they couldn't be re-screened (their boundary no longer builds). */
  dropped: string[];
}

export interface ExploreController {
  state: ExploreState;
  /** Set when the start-up sweep cleared kept results; null once dismissed, or when there were none. */
  cleared: ClearedNotice | null;
  dismissCleared(): void;
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
  /** "{parcel} kept on Your list — Back" after leaving a parcel with a screen (17e), until it times out. */
  toast: SwitchToast | null;
  /** Reopen the parcel the toast names. */
  back(): void;
  dismissToast(): void;
  /** A screen is running (the screen hook says so): switching parcels waits (17e). */
  setBusy(busy: boolean): void;
  /** Open or close the map panel (17e); one panel at a time with Info. */
  setMapPanel(open: boolean): void;
  map: MlMap | null;
  setMap(map: MlMap | null): void;
  setMode(mode: Mode): void;
  /**
   * A tap on the map with no tool waiting: select or switch (decideTap); while a screen runs, a hint instead.
   * Selecting first fetches the outline's full record (the drawn outlines are simplified).
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
  /** Follow-up 34: draw a track or an easement with the open parcel; Finish (Enter, double-click) keeps it. */
  startLine(kind: LineKind): void;
  finishLine(): void;
  saveMarkupNote(id: string, note: string, serial: number): void;
  /** Owner, #127: a line's name (a blank one is ignored). */
  renameMarkup(id: string, name: string, serial: number): void;
  /** The line whose Layers row is under the pointer, highlighted on the map (owner, #127); null when none. */
  hoverLine: string | null;
  setHoverLine(id: string | null): void;
  saveMarkupWidth(id: string, widthFt: number, serial: number): void;
  /** Deletes the line; `lineUndo` offers it back for a few seconds (owner, A). */
  deleteMarkup(id: string, serial: number): void;
  /** Owner, A: a line's kind and condition, and its path redrawn with the line tool. */
  setMarkupKind(id: string, kind: MarkupKind, serial: number): void;
  setMarkupCondition(id: string, condition: LineCondition, serial: number): void;
  /** A line's path, or an area's (WF4), redrawn with its tool; a point moved by the next tap. */
  editLine(id: string): void;
  /**
   * WF4: the Mark tool, for a point (one tap places it) or an area (corners, then Finish); `kind` null until one is
   * picked. Placing or finishing opens the marker's details.
   */
  startMark(kind: MarkKind | null, shape: "point" | "area"): void;
  placePoint(ll: LatLon): void;
  finishArea(): void;
  /** A point marker dragged on the map, for the parcel open as `serial`. */
  movePoint(id: string, ll: LatLon, serial: number): void;
  /** A septic permit's class, or null to clear it. */
  setMarkupSeptic(id: string, septicClass: SepticClass | null, serial: number): void;
  /** WF5: where an easement is recorded ("" clears it); the line scored as the driveway, or null for the app's pick. */
  saveRecordedIn(id: string, recordedIn: string, serial: number): void;
  setDrivewayLine(line: string | null, serial: number): void;
  /**
   * The Mark picker (owner, after #136): open from + Mark, or from a long press (a right-click on a desktop) on the
   * map, which gives where. Null when closed.
   */
  picker: MarkPickerState | null;
  /** Opens the picker; from the map, with where (`at`) and the page point it opens beside (`point`). */
  openPicker(at?: LatLon | null, point?: { x: number; y: number }): void;
  closePicker(): void;
  /** The kinds picked last, newest first (ps.recentMarks): the picker's Recent row. */
  recentMarks: MarkChoice[];
  /** A kind picked: remembered as recent, and its tool started; opened at a place, the first point goes there. */
  pickMark(c: MarkChoice): void;
  /** The line just deleted, for the Undo toast; null when there's none or it timed out. */
  lineUndo: LineUndo | null;
  /**
   * The last listing link searched (owner, #130), offered to the next parcel opened (lib/client/attachListing.ts);
   * null once used, dismissed, replaced by another search, or ATTACH_MS after the search.
   */
  searchedListing: SearchedListing | null;
  /** A listing link was searched: offered from the next parcel opened. */
  listingSearched(l: Omit<SearchedListing, "afterSerial">): void;
  /** Attaches it to the open parcel (the link, and the street as the name when it has none). */
  attachSearchedListing(): void;
  dismissSearchedListing(): void;
  undoLineDelete(): void;
  dismissLineUndo(): void;
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
  /**
   * The layer's ×: take a part out, remove the cut, remove the house, delete a line (with Undo). Returns why it can't,
   * if it can't.
   */
  deleteLayer(id: LayerId): string | null;
  toggleHidden(id: LayerId): void;
  /** Keep the other piece of the saved split. */
  keepSide(side: Side): void;
  /** The Notes tab's text, for the parcel open when it was typed (state.serial then). */
  saveNotes(text: string, serial: number): void;
  /** The open parcel's asking price, in dollars (null clears it), for the parcel open as `serial`. */
  saveAskingPrice(price: number | null, serial: number): void;
  /** WF1: the listing's facts, for the parcel open as `serial`. */
  saveListing(patch: Partial<Pick<WorkingParcel, ListingField>>, serial: number): void;
  /**
   * Step 8: starred with its name, or unstarred (its asks and takes go). WF2: archiving with a reason, restoring, and a
   * milestone's date (null clears it).
   */
  star(name: string, serial: number): void;
  unstar(serial: number): void;
  archive(reason: string, serial: number): void;
  restore(serial: number): void;
  setMilestone(which: Milestone, date: string | null, serial: number): void;
  /** A screen finished (kept under `id`) for the parcel open when it started (state.serial then). */
  screened(id: string, serial: number): void;
}

/** The toast after leaving a parcel with a screen (17e). `at` tells two toasts for the same parcel apart. */
export interface SwitchToast {
  key: string;
  name: string;
  at: number;
}

/** The Mark picker, open: where on the map it was opened (a long press, a right-click), and at which page point. */
export interface MarkPickerState {
  at: LatLon | null;
  point: { x: number; y: number } | null;
}

/** A drawn line just deleted (owner, A): what it was, where in the list, for which open parcel, and when. */
export interface LineUndo {
  markup: Markup;
  index: number;
  /** It was the line chosen as the driveway (WF5): Undo chooses it again. */
  driveway: boolean;
  serial: number;
  at: number;
}

/** Shows a hint for a while, unless something else replaced it meanwhile. */
export function flash(hint: SetHint, text: string, ms: number): void {
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
const stamp = (): Stamp => ({
  now: new Date().toISOString(),
  key: crypto.randomUUID(),
  by: currentProfileId(),
});
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
  const [toast, setToast] = useState<SwitchToast | null>(null);
  const [lineUndo, setLineUndo] = useState<LineUndo | null>(null);
  const [picker, setPicker] = useState<MarkPickerState | null>(null);
  const [recentMarks, setRecentMarks] = useState<MarkChoice[]>(() => getPref("ps.recentMarks"));
  const [searchedListing, setSearchedListing] = useState<SearchedListing | null>(null);
  const listingTimer = useRef<number | null>(null);
  const endListingOffer = () => {
    if (listingTimer.current !== null) window.clearTimeout(listingTimer.current);
    listingTimer.current = null;
    setSearchedListing(null);
  };
  useEffect(
    () => () => {
      if (listingTimer.current !== null) window.clearTimeout(listingTimer.current);
    },
    [],
  );
  const [hoverLine, setHoverLine] = useState<string | null>(null);
  const busy = useRef(false);
  /** About to leave the open parcel: if it has a screen, offer Back to it. */
  const leaving = () => {
    const o = latest.current.store.open;
    if (o?.key && o.screenIds.length > 0) setToast({ key: o.key, name: parcelName(o).name, at: Date.now() });
    else setToast(null);
  };
  /** A switch asked for while a screen runs: say so, and don't switch (17e). */
  const refuseBusy = (): boolean => {
    if (!busy.current) return false;
    flash(hint, BUSY_TEXT, 3000);
    return true;
  };
  const docked = useDocked();
  const lookup = useRef<AbortController | null>(null);

  const { store } = state;
  // The stores this explorer wrote: their echo (below) isn't someone else's change.
  const written = useRef(new WeakSet<ParcelStore>());
  // The explorer stays mounted behind the other tabs (step 4b): what Your list (or another page, or an import while it
  // was loading) writes is taken in, so it isn't overwritten by this copy later. Before the first save below: a write
  // made between reading the parcels and mounting would otherwise be lost.
  const [writesAtLoad] = useState(parcelsWritten);
  useEffect(() => {
    if (parcelsWritten() !== writesAtLoad) {
      const now = getPref("ps.parcels");
      if (now) dispatch({ type: "adopt", store: now });
    }
    return onParcelsWritten((next) => {
      if (next && next !== latest.current.store && !written.current.has(next))
        dispatch({ type: "adopt", store: next });
    });
  }, [dispatch, writesAtLoad]);
  useEffect(() => {
    written.current.add(store);
    setPref("ps.parcels", store);
  }, [store]);
  // Step 8 (plan §1): a finished run kept on the open parcel is a grading by this profile, for its History, once the
  // parcel has its key (the run builds it).
  const graded = useRef<string | null>(null);
  const openKey = store.open?.key ?? null;
  const openScreens = store.open?.screenIds;
  useEffect(() => {
    if (graded.current && openKey && openScreens?.includes(graded.current)) {
      graded.current = null;
      logGraded(openKey);
    }
  }, [openKey, openScreens]);
  // "Open on the map" from Your list, Compare or the rulebook, while the explorer is mounted: opened here, as a tap on
  // its outline would, so the parcel left keeps its session and its Back, and refused while a screen runs.
  const opener = useRef({ leaving, docked, refuseBusy });
  useEffect(() => {
    opener.current = { leaving, docked, refuseBusy };
  });
  // Settings' Your data (step 4b) exports and imports through the explorer while it's mounted.
  useEffect(
    () =>
      registerLiveParcels({
        store: () => latest.current.store,
        importParcels: (added) => dispatch({ type: "imported", added }),
        open: (key) => {
          if (key === latest.current.store.open?.key || opener.current.refuseBusy()) return;
          opener.current.leaving();
          dispatch({ type: "openSaved", key, keepPanel: opener.current.docked });
        },
      }),
    [dispatch],
  );

  // v3's clean break (owner, #101, 2026-10-11): kept results that aren't the current schema are deleted, once, at
  // start-up (no network). Their parcels stay and re-screen when opened; one whose boundary no longer builds can't
  // be re-screened and is dropped. The map says so (ClearedNote).
  const [cleared, setCleared] = useState<ClearedNotice | null>(null);
  useEffect(() => {
    let alive = true;
    void clearUnreadableScreens().then((ids) => {
      if (!alive || !ids.length) return;
      const gone = new Set(ids);
      const dropped = latest.current.store.built.filter(
        (b) => b.screenIds.some((id) => gone.has(id)) && !derive(b).ok,
      );
      for (const b of dropped) dispatch({ type: "removeSaved", key: b.key! });
      setCleared({ results: ids.length, dropped: dropped.map((b) => parcelName(b).name) });
    });
    return () => {
      alive = false;
    };
  }, [dispatch]);

  const open = store.open;
  const derived = useMemo(() => (open ? derive(open) : null), [open]);
  const parcel = derived?.ok ? derived.record : null;

  // The saved outlines on the map: Favorites and this person's History only (step 8, plan §5).
  const historyLog = useHistoryLog();
  const me = currentProfileId();
  const saved = useMemo(
    () =>
      store.built
        .filter((b) => b.key !== open?.key && (me === null || visibleTo(b, me, historyLog)))
        .flatMap((b) => {
          const d = derive(b);
          return d.ok ? [{ key: b.key!, geo: d.record.geo, acres: d.acres }] : [];
        }),
    [store.built, open?.key, me, historyLog],
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
      if (mode) setToast(null); // a map tool starting replaces the Back toast
    },
    [dispatch, hint],
  );

  /** Deletes a drawn line, keeping it for the Undo toast (owner, A). */
  const deleteLine = (id: string, serial: number) => {
    const open = latest.current.store.open;
    const index = open?.markup.findIndex((m) => m.id === id) ?? -1;
    if (!open || index < 0 || serial !== latest.current.serial) return;
    setLineUndo({
      markup: open.markup[index]!,
      index,
      driveway: open.drivewayLine === id,
      serial,
      at: Date.now(),
    });
    dispatch({ type: "markupDelete", id, serial, stamp: stamp() });
  };

  return {
    state,
    cleared,
    dismissCleared: () => setCleared(null),
    current: () => latest.current,
    derived,
    parcel,
    saved,
    pieces,
    combined,
    shapes,
    layers,
    panelInset: docked && ((state.info && open) || state.mapPanel) ? DOCKED_PANEL_INSET : 0,
    docked,
    toast,
    back() {
      const t = toast;
      if (!t || refuseBusy()) return;
      setToast(null);
      lookup.current?.abort();
      leaving();
      dispatch({ type: "openSaved", key: t.key, keepPanel: docked });
      hint("");
    },
    dismissToast() {
      setToast(null);
    },
    setBusy(b) {
      busy.current = b;
    },
    setMapPanel(open) {
      dispatch({ type: "mapPanel", open });
    },
    map,
    setMap,
    setMode,
    async tap(hit) {
      const o = decideTap(latest.current, hit, busy.current);
      if (o.kind === "clearLayer") return dispatch({ type: "layer", id: null });
      if (o.kind === "busy") return void refuseBusy();
      if (o.kind === "select") {
        const record = await full(o.record);
        if (!record || refuseBusy()) return;
        leaving();
        dispatch({ type: "select", record, stamp: stamp(), keepPanel: docked });
      } else if (o.kind === "openSaved") {
        leaving();
        dispatch({ type: "openSaved", key: o.key, keepPanel: docked });
      }
      if (o.kind !== "none") hint("");
      // An empty map because the parcel service isn't answering: say so, not nothing (owner, after 16b).
      else if (hit.serviceDown) hint(hit.serviceDown);
      // No record under an empty spot where outlines are drawn (owner, 2026-10-11).
      else if (hit.linesShown && !hit.insideOpen && !hit.outline && !hit.savedKey)
        flash(hint, NO_PARCEL_HERE, 4000);
    },
    close() {
      if (refuseBusy()) return;
      lookup.current?.abort();
      leaving();
      dispatch({ type: "close" });
      hint("");
    },
    async openOutline(outline) {
      if (refuseBusy()) return;
      const record = await full(outline);
      if (!record || refuseBusy()) return;
      leaving();
      dispatch({ type: "select", record, stamp: stamp(), keepPanel: docked });
    },
    openSaved(key) {
      if (key === latest.current.store.open?.key || refuseBusy()) return;
      leaving();
      dispatch({ type: "openSaved", key, keepPanel: docked });
    },
    removeSaved(key) {
      dispatch({ type: "removeSaved", key });
      dropParcel(key); // its asks and takes go with it (step 6)
    },
    importParcels(added) {
      // Step 8: an imported parcel with no adder is the importer's, in their History (a favorite in the file stays one).
      const me = currentProfileId();
      dispatch({ type: "imported", added: added.map((p) => (p.addedBy ? p : { ...p, addedBy: me })) });
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
      if (DRAWING.includes(m)) dispatch({ type: "draftCancel" });
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
    startLine(kind) {
      dispatch({ type: "startLine", kind });
      hint("");
    },
    finishLine() {
      if (latest.current.draft.length < 2) return hint("Need at least two points");
      dispatch({ type: "finishLine", id: crypto.randomUUID(), stamp: stamp() });
      hint("");
    },
    saveMarkupNote(id, note, serial) {
      dispatch({ type: "markupNote", id, note, serial, stamp: stamp() });
    },
    renameMarkup(id, name, serial) {
      dispatch({ type: "markupName", id, name, serial, stamp: stamp() });
    },
    hoverLine,
    setHoverLine,
    saveMarkupWidth(id, widthFt, serial) {
      dispatch({ type: "markupWidth", id, widthFt, serial, stamp: stamp() });
    },
    deleteMarkup: deleteLine,
    setMarkupKind(id, kind, serial) {
      dispatch({ type: "markupKind", id, kind, serial, stamp: stamp() });
    },
    setMarkupCondition(id, condition, serial) {
      dispatch({ type: "markupCondition", id, condition, serial, stamp: stamp() });
    },
    editLine(id) {
      const m = latest.current.store.open?.markup.find((x) => x.id === id);
      dispatch({ type: "editLine", id });
      hint(
        m?.shape === "point"
          ? "Tap where it goes."
          : m?.shape === "area"
            ? "Tap its corners again; Undo takes the last off. Finish keeps the new shape."
            : "Tap to add points; Undo takes the last off. Finish keeps the new path.",
      );
    },
    startMark(kind, shape) {
      dispatch({ type: "startMark", kind, shape });
      hint("");
    },
    placePoint(ll) {
      if (!latest.current.markKind) return hint("Pick what you're marking first");
      dispatch({ type: "placePoint", id: crypto.randomUUID(), ll, stamp: stamp() });
      hint("");
    },
    finishArea() {
      const { draft, markKind } = latest.current;
      // A septic permit is its point with one tap (owner, after #136); any area needs three corners.
      const point = markKind === "septic" && draft.length === 1;
      if (!point && draft.length < 3) return hint("Need at least three corners");
      dispatch({ type: "finishArea", id: crypto.randomUUID(), stamp: stamp() });
      hint("");
    },
    movePoint(id, ll, serial) {
      dispatch({ type: "movePoint", id, ll, serial, stamp: stamp() });
    },
    setMarkupSeptic(id, septicClass, serial) {
      dispatch({ type: "markupSeptic", id, septicClass, serial, stamp: stamp() });
    },
    saveRecordedIn(id, recordedIn, serial) {
      dispatch({ type: "markupRecorded", id, recordedIn, serial, stamp: stamp() });
    },
    setDrivewayLine(line, serial) {
      dispatch({ type: "drivewayLine", line, serial, stamp: stamp() });
    },
    picker,
    openPicker(at = null, point) {
      // Marks belong to a parcel: none to place without one open.
      if (latest.current.store.open) setPicker({ at, point: point ?? null });
    },
    closePicker() {
      setPicker(null);
    },
    recentMarks,
    pickMark(c) {
      const at = picker?.at ?? null;
      setPicker(null);
      const recent = withRecent(recentMarks, c);
      setRecentMarks(recent);
      setPref("ps.recentMarks", recent);
      hint("");
      setToast(null);
      switch (TOOL[c]) {
        case "house":
          if (at) dispatch({ type: "house", ll: at, stamp: stamp() });
          else dispatch({ type: "mode", mode: "house" });
          return;
        case "line":
          dispatch({ type: "startLine", kind: c as LineKind });
          if (at) dispatch({ type: "draftAdd", ll: at });
          return;
        case "point":
          dispatch({ type: "startMark", kind: c as MarkKind, shape: "point" });
          if (at) dispatch({ type: "placePoint", id: crypto.randomUUID(), ll: at, stamp: stamp() });
          return;
        case "area":
        case "septic":
          dispatch({ type: "startMark", kind: c as MarkKind, shape: "area" });
          if (at) dispatch({ type: "draftAdd", ll: at });
          return;
      }
    },
    lineUndo,
    searchedListing,
    listingSearched(l) {
      endListingOffer();
      setSearchedListing({ ...l, afterSerial: latest.current.serial });
      listingTimer.current = window.setTimeout(endListingOffer, ATTACH_MS);
    },
    attachSearchedListing() {
      const open = latest.current.store.open;
      if (!searchedListing || !open) return;
      dispatch({
        type: "listing",
        patch: attachPatch(searchedListing, open),
        serial: latest.current.serial,
        stamp: stamp(),
      });
      endListingOffer();
    },
    dismissSearchedListing: endListingOffer,
    undoLineDelete() {
      if (!lineUndo) return;
      dispatch({ type: "markupRestore", ...lineUndo, stamp: stamp() });
      setLineUndo(null);
    },
    dismissLineUndo() {
      setLineUndo(null);
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
        const { parcel: picked } = await pickParcelAt(browserHttp, parcelServices, ll, ctl.signal);
        // Where a parcel can be several features (Tennessee, step 2), the record is all of them, conflicts checked.
        const parcel = picked && fieldsFor(picked.source).groupById ? await full(picked) : picked;
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
      const line = layerLine(id);
      if (line) deleteLine(line, latest.current.serial);
      else if (id.startsWith("part:")) {
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
    saveAskingPrice(price, serial) {
      dispatch({ type: "askingPrice", price, serial, stamp: stamp() });
    },
    saveListing(patch, serial) {
      dispatch({ type: "listing", patch, serial, stamp: stamp() });
    },
    star(name, serial) {
      dispatch({ type: "star", name, serial, stamp: stamp() });
    },
    unstar(serial) {
      const key = latest.current.store.open?.key;
      if (key) dropParcel(key); // as Remove drops them (plan §2)
      dispatch({ type: "unstar", serial, stamp: stamp() });
    },
    archive(reason, serial) {
      dispatch({ type: "archive", reason, serial, stamp: stamp() });
    },
    restore(serial) {
      dispatch({ type: "restore", serial, stamp: stamp() });
    },
    setMilestone(which, date, serial) {
      dispatch({ type: "milestone", which, date, serial, stamp: stamp() });
    },
    screened(id, serial) {
      graded.current = id;
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
