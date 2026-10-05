"use client";
/**
 * The explorer's tools, shared by the panel and the map (proto L566–707): state from exploreReducer, plus the
 * hints, lookups and timers each action brings. Exposed through ExploreContext.
 */
import type { Map as MlMap } from "maplibre-gl";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { browserHttp } from "@/lib/client/http";
import { getPref, setPref } from "@/lib/client/prefs";
import { CancelledError } from "@/lib/http";
import { combinedRecord, combineParcels, type CombineResult } from "@/lib/geo/combine";
import { parseLatLon } from "@/lib/geo/coords";
import { parcelFromLine, pickParcelAt, squareAround, type ParcelLine } from "@/lib/geo/parcels";
import { fitSplit as fitSplitLine, splitPieces, type Side, type SplitPieces } from "@/lib/geo/split";
import type { LatLon } from "@/lib/geo/types";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import {
  exploreReducer,
  INITIAL,
  MODE_HINT,
  type ExploreAction,
  type ExploreState,
  type Mode,
} from "./exploreState";

export type SetHint = (text: string | ((prev: string) => string)) => void;

export interface ExploreController {
  state: ExploreState;
  /** The state as of the last action, for event handlers that run before React re-renders. */
  current(): ExploreState;
  /** Both pieces of the current split, once the line has two ends. */
  pieces: SplitPieces | null;
  /** The combination of the picked parcels, once there are two. */
  combined: CombineResult | null;
  map: MlMap | null;
  setMap(map: MlMap | null): void;
  setMode(mode: Mode): void;
  goTo(text: string): void;
  pickAt(ll: LatLon): Promise<void>;
  selectOutline(line: ParcelLine): void;
  squareHere(acres: number): void;
  setHouse(ll: LatLon | null): void;
  startDraw(): void;
  addCorner(ll: LatLon): void;
  finishDraw(): void;
  cancelDraw(): void;
  startSplit(): void;
  splitTap(ll: LatLon): void;
  moveSplit(a: LatLon, b: LatLon | null): void;
  fitSplit(targetAc: number, side: Side): void;
  choosePiece(side: Side): void;
  cancelSplit(): void;
  startCombine(): void;
  /** A tap while combining: the outline under it, else the parcel the services find there. */
  combineAt(ll: LatLon, line: ParcelLine | null): Promise<void>;
  combineRemove(index: number): void;
  applyCombination(): void;
  cancelCombine(): void;
  clear(): void;
}

/** Shows a hint for a while, unless something else replaced it meanwhile. */
function flash(hint: SetHint, text: string, ms: number): void {
  hint(text);
  setTimeout(() => hint((h) => (h === text ? "" : h)), ms);
}

export function useExploreController(parcelServices: readonly string[], hint: SetHint): ExploreController {
  // The parcel and house from before a refresh (step 13d). The explorer renders client-side only.
  const [restored] = useState<ExploreState>(() => {
    const saved = getPref("ps.current");
    return saved ? { ...INITIAL, parcel: saved.parcel, house: saved.house } : INITIAL;
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
  const lookup = useRef<AbortController | null>(null);

  const pieces = useMemo(() => {
    const { parcel, split } = state;
    return parcel && split?.b ? splitPieces(parcel.geo, split.a, split.b) : null;
  }, [state]);

  const { parcel, house } = state;
  useEffect(() => setPref("ps.current", parcel || house ? { parcel, house } : null), [parcel, house]);

  const combined = useMemo(
    () =>
      state.combine && state.combine.length >= 2
        ? combineParcels(
            state.combine.map((m) => m.geo),
            SCREEN_CONSTANTS.combine,
          )
        : null,
    [state.combine],
  );

  const setMode = useCallback(
    (mode: Mode) => {
      dispatch({ type: "mode", mode });
      hint(mode ? MODE_HINT[mode] : "");
    },
    [dispatch, hint],
  );

  const pickAt = useCallback(
    async (ll: LatLon) => {
      lookup.current?.abort(); // a newer tap supersedes an unfinished lookup
      const ctl = new AbortController();
      lookup.current = ctl;
      hint("Looking up parcel…");
      try {
        const { parcel, report } = await pickParcelAt(browserHttp, parcelServices, ll, ctl.signal);
        if (parcel) {
          dispatch({ type: "parcel", parcel });
          hint("");
        } else {
          dispatch({ type: "noParcel", ll, report });
          hint("No parcel record here.");
        }
      } catch (e) {
        if (!(e instanceof CancelledError)) throw e;
      }
    },
    [dispatch, hint, parcelServices],
  );

  return {
    state,
    current: () => latest.current,
    pieces,
    combined,
    map,
    setMap,
    setMode,
    pickAt,
    goTo(text) {
      const ll = parseLatLon(text);
      if (!ll) return hint("Need two numbers: lat, lon");
      map?.jumpTo({ center: [ll[1], ll[0]], zoom: 16 });
      hint("");
    },
    selectOutline(line) {
      dispatch({ type: "parcel", parcel: parcelFromLine(line), mode: null });
      hint("");
    },
    squareHere(acres) {
      const ll = latest.current.noParcel?.ll;
      if (!ll) return;
      const geo = squareAround(ll, acres);
      dispatch({
        type: "parcel",
        parcel: { geo, props: {}, source: "square", multiPart: false },
        mode: null,
      });
      hint("");
    },
    setHouse(ll) {
      if (latest.current.mode === "house") hint("");
      dispatch({ type: "house", ll });
    },
    startDraw() {
      dispatch({ type: "startDraw" });
      hint(MODE_HINT.draw);
    },
    addCorner(ll) {
      dispatch({ type: "draftAdd", ll });
    },
    finishDraw() {
      if (latest.current.draft.length < 3) return hint("Need at least three corners");
      dispatch({ type: "finishDraw" });
      hint("");
    },
    cancelDraw() {
      dispatch({ type: "draftCancel" });
      hint("");
    },
    startSplit() {
      dispatch({ type: "startSplit" });
      hint(MODE_HINT.split);
    },
    splitTap(ll) {
      const split = latest.current.split;
      dispatch({ type: "splitTap", ll });
      if (split && !split.b) flash(hint, "Drag the end markers to adjust; use Fit to hit an acreage", 3000);
    },
    moveSplit(a, b) {
      dispatch({ type: "splitMove", a, b });
    },
    fitSplit(targetAc, side) {
      const { parcel, split } = latest.current;
      if (!(targetAc > 0) || !parcel || !split?.b) return;
      const moved = fitSplitLine(parcel.geo, split.a, split.b, targetAc, side);
      if (!moved)
        return flash(
          hint,
          "Can't reach that acreage by sliding this line — rotate it or pick the other side",
          2500,
        );
      dispatch({ type: "splitMove", ...moved });
    },
    choosePiece(side) {
      const { parcel, split } = latest.current;
      if (!parcel || !split?.b) return;
      dispatch({ type: "usePiece", pieces: splitPieces(parcel.geo, split.a, split.b), side });
      hint("");
    },
    cancelSplit() {
      dispatch({ type: "splitCancel" });
      hint("");
    },
    startCombine() {
      dispatch({ type: "startCombine" });
      hint(MODE_HINT.combine);
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
          hint(MODE_HINT.combine);
        } else hint("No parcel record here.");
      } catch (e) {
        if (!(e instanceof CancelledError)) throw e;
      }
    },
    combineRemove(index) {
      dispatch({ type: "combineRemove", index });
    },
    applyCombination() {
      const members = latest.current.combine;
      if (!members || members.length < 2) return;
      const r = combineParcels(
        members.map((m) => m.geo),
        SCREEN_CONSTANTS.combine,
      );
      if (!r.ok) return;
      dispatch({ type: "parcel", parcel: combinedRecord(members, r), mode: null });
      hint("");
    },
    cancelCombine() {
      dispatch({ type: "combineCancel" });
      hint("");
    },
    clear() {
      lookup.current?.abort();
      dispatch({ type: "clear" });
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
