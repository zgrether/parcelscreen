/**
 * The explorer's parcel state and its transitions. The committed parcel lives in the parcel store
 * (lib/client/parcelStore.ts): the open parcel and History, as a recipe of pieces, a split and a house.
 * What's here besides is the work in progress of a tool: the tool mode, the boundary being drawn, the split
 * line, the parcels picked to combine. Pure: the map and panel dispatch actions and render from this.
 */
import { polygon } from "@turf/turf";
import {
  closeOpen,
  commitOpen,
  EMPTY_STORE,
  isBuilt,
  openBuilt,
  plainParcel,
  removeBuilt,
  type ParcelStore,
  type WorkingParcel,
} from "@/lib/client/parcelStore";
import { memberKey } from "@/lib/geo/combine";
import type { ParcelRecord } from "@/lib/geo/parcels";
import { drawnPart } from "@/lib/geo/recipe";
import type { Side } from "@/lib/geo/split";
import type { LatLon } from "@/lib/geo/types";
import type { LayerId } from "./layers";

export type Mode = "draw" | "house" | "split" | "combine" | null;

export interface SplitLine {
  a: LatLon;
  /** Null until the second tap. */
  b: LatLon | null;
}

export interface ExploreState {
  mode: Mode;
  /** The open parcel and History. */
  store: ParcelStore;
  /** Corners of the shape being drawn. */
  draft: LatLon[];
  /** The split tool's line while it's being placed. */
  split: SplitLine | null;
  /** Pieces picked to combine; null when not combining. */
  combine: ParcelRecord[] | null;
  /** The Info panel is open (13e-4). */
  info: boolean;
  /** The layer selected in the panel or on the map. */
  layer: LayerId | null;
  /**
   * Which parcel is open: bumped when another one opens (or none), not when the open one is edited, nor when
   * a first change makes it built and gives it a key. The Info panel is keyed by it, so typing a first note
   * doesn't remount the box being typed in.
   */
  serial: number;
}

export const INITIAL: ExploreState = {
  mode: null,
  store: EMPTY_STORE,
  draft: [],
  split: null,
  combine: null,
  info: false,
  layer: null,
  serial: 0,
};

/** The time and a fresh key for a change that may save a parcel (the reducer stays pure). */
export interface Stamp {
  now: string;
  key: string;
}

export type ExploreAction =
  | { type: "mode"; mode: Mode }
  /**
   * Open a parcel straight from a tap on its outline. `keepPanel`: the Info panel is docked beside the map
   * (desktop), so switching parcels leaves it open on the new one.
   */
  | { type: "select"; record: ParcelRecord; stamp: Stamp; keepPanel?: boolean }
  /** Unselect: close the open parcel (a built one stays in History). */
  | { type: "close" }
  | { type: "openSaved"; key: string; keepPanel?: boolean }
  | { type: "removeSaved"; key: string }
  | { type: "house"; ll: LatLon | null; stamp: Stamp }
  | { type: "startDraw" }
  | { type: "draftAdd"; ll: LatLon }
  | { type: "draftUndo" }
  | { type: "draftCancel" }
  /** Closes the drawn shape: a new parcel, or a piece added to the open one. */
  | { type: "finishDraw"; stamp: Stamp }
  | { type: "startSplit" }
  | { type: "splitTap"; ll: LatLon }
  | { type: "splitMove"; a: LatLon; b: LatLon | null }
  | { type: "splitCancel" }
  /** Keep one side of the split line: the line itself is saved, so it can be moved or removed later. */
  | { type: "keepPiece"; side: Side; stamp: Stamp }
  /** Starts combining, with the open parcel's pieces (if any). */
  | { type: "startCombine" }
  /** Adds a parcel to the combination, or takes it out if it's already in. */
  | { type: "combineToggle"; parcel: ParcelRecord }
  | { type: "combineCancel" }
  /** Use the picked pieces; the caller has checked that they make one boundary. */
  | { type: "applyCombine"; stamp: Stamp }
  /** Open or close the Info panel; closing it clears the selected layer. */
  | { type: "info"; open: boolean }
  /** Select a layer (opening the panel), or clear the selection. */
  | { type: "layer"; id: LayerId | null }
  /** Take a part out of the parcel; the caller has checked that the rest make one boundary. */
  | { type: "removePart"; index: number; stamp: Stamp }
  | { type: "removeSplit"; stamp: Stamp }
  /** Keep the other side of the saved split. */
  | { type: "keepSide"; side: Side; stamp: Stamp }
  | { type: "toggleHidden"; id: LayerId; stamp: Stamp }
  /** The Notes tab's text, for the parcel that was open when it was typed (`serial`). */
  | { type: "notes"; text: string; serial: number; stamp: Stamp }
  /** A screen finished (or a house was re-assessed) for the parcel open when it started (`serial`). */
  | { type: "screened"; id: string; serial: number; stamp: Stamp };

/** The house is kept to 6 decimals, as in the prototype (proto L636). */
const roundLL = (ll: LatLon): LatLon => [+ll[0].toFixed(6), +ll[1].toFixed(6)];

/** Unselecting always closes the Info panel (owner, plan 13e §4); so does switching parcels, unless the panel
 * is docked beside the map (owner, 13e-4 review). A selected layer belonged to the old parcel either way. */
const PANEL_CLOSED: Pick<ExploreState, "info" | "layer"> = { info: false, layer: null };
const switched = (s: ExploreState, keepPanel?: boolean): Pick<ExploreState, "info" | "layer" | "serial"> => ({
  info: !!keepPanel && s.info && !!s.store.open,
  layer: null,
  serial: s.serial + 1,
});

/** Tools in progress end when the parcel changes underneath them. */
const NO_TOOL: Pick<ExploreState, "mode" | "draft" | "split" | "combine"> = {
  mode: null,
  draft: [],
  split: null,
  combine: null,
};

export function exploreReducer(s: ExploreState, a: ExploreAction): ExploreState {
  const save = (p: WorkingParcel, st: Stamp) => commitOpen(s.store, p, st.now, () => st.key);
  const open = s.store.open;
  switch (a.type) {
    case "mode":
      return { ...s, mode: a.mode };
    case "select":
      return {
        ...s,
        ...NO_TOOL,
        ...switched(s, a.keepPanel),
        store: save(plainParcel(a.record, a.stamp.now), a.stamp),
      };
    case "close":
      return { ...s, ...NO_TOOL, ...PANEL_CLOSED, serial: s.serial + 1, store: closeOpen(s.store) };
    case "openSaved":
      return { ...s, ...NO_TOOL, ...switched(s, a.keepPanel), store: openBuilt(s.store, a.key) };
    case "removeSaved":
      return {
        ...s,
        ...(open?.key === a.key ? { ...NO_TOOL, ...PANEL_CLOSED, serial: s.serial + 1 } : {}),
        store: removeBuilt(s.store, a.key),
      };
    case "house":
      if (!open) return s;
      return {
        ...s,
        store: save({ ...open, house: a.ll ? roundLL(a.ll) : null }, a.stamp),
        mode: s.mode === "house" ? null : s.mode,
        layer: !a.ll && s.layer === "house" ? null : s.layer,
      };
    case "startDraw":
      return { ...s, draft: [], mode: "draw", combine: null, split: null };
    case "draftAdd":
      return { ...s, draft: [...s.draft, a.ll] };
    case "draftUndo":
      return { ...s, draft: s.draft.slice(0, -1) };
    case "draftCancel":
      return { ...s, draft: [], mode: null };
    case "finishDraw": {
      if (s.draft.length < 3) return s;
      const ring = s.draft.map(([lat, lon]) => [lon, lat]);
      ring.push(ring[0]!);
      const piece = drawnPart(polygon([ring]));
      const next = open ? { ...open, pieces: [...open.pieces, piece] } : plainParcel(piece, a.stamp.now);
      // The parts are renumbered, so a selected part no longer names the same one.
      return {
        ...s,
        ...NO_TOOL,
        layer: null,
        serial: open ? s.serial : s.serial + 1,
        store: save(next, a.stamp),
      };
    }
    case "startSplit":
      // An existing split is edited where it is.
      return {
        ...s,
        split: open?.split ? { a: open.split.a, b: open.split.b } : null,
        combine: null,
        mode: "split",
      };
    case "splitTap":
      if (!s.split) return { ...s, split: { a: a.ll, b: null } };
      // The tool stays on: the next tap, on a piece, keeps it (keepPiece).
      if (!s.split.b) return { ...s, split: { a: s.split.a, b: a.ll } };
      return s;
    case "splitMove":
      return { ...s, split: { a: a.a, b: a.b } };
    case "splitCancel":
      return { ...s, split: null, mode: null };
    case "keepPiece":
      if (!open || !s.split?.b) return s;
      return {
        ...s,
        ...NO_TOOL,
        store: save({ ...open, split: { a: s.split.a, b: s.split.b, keep: a.side } }, a.stamp),
      };
    case "startCombine":
      return { ...s, combine: open ? [...open.pieces] : [], split: null, mode: "combine" };
    case "combineToggle": {
      if (!s.combine) return s;
      const k = memberKey(a.parcel);
      if (k === null) return { ...s, combine: [...s.combine, a.parcel] }; // a drawn piece is never "the same" as another
      const without = s.combine.filter((m) => memberKey(m) !== k);
      return { ...s, combine: without.length < s.combine.length ? without : [...s.combine, a.parcel] };
    }
    case "combineCancel":
      return { ...s, combine: null, mode: s.mode === "combine" ? null : s.mode };
    case "applyCombine": {
      const pieces = s.combine;
      if (!pieces?.length) return s;
      // The split stays: if it no longer cuts the new boundary, deriving the parcel leaves it off and says so.
      const next = open ? { ...open, pieces } : { ...plainParcel(pieces[0]!, a.stamp.now), pieces };
      return {
        ...s,
        ...NO_TOOL,
        layer: null,
        serial: open ? s.serial : s.serial + 1,
        store: save(next, a.stamp),
      };
    }
    case "info":
      return a.open ? { ...s, info: true } : { ...s, ...PANEL_CLOSED };
    case "layer":
      return { ...s, layer: a.id, info: a.id ? true : s.info };
    case "removePart":
      if (!open || open.pieces.length < 2) return s;
      // A split that no longer cuts what's left is left off when the parcel is derived, and says so.
      return {
        ...s,
        layer: null,
        store: save({ ...open, pieces: open.pieces.filter((_, i) => i !== a.index) }, a.stamp),
      };
    case "removeSplit":
      if (!open?.split) return s;
      return { ...s, layer: null, store: save({ ...open, split: null }, a.stamp) };
    case "keepSide":
      if (!open?.split) return s;
      return { ...s, store: save({ ...open, split: { ...open.split, keep: a.side } }, a.stamp) };
    case "screened":
      // A screen is one of the built rules: the parcel is saved to History with it.
      if (!open || a.serial !== s.serial || open.screenIds.includes(a.id)) return s;
      return { ...s, store: save({ ...open, screenIds: [...open.screenIds, a.id] }, a.stamp) };
    case "notes":
      // A save that lands after another parcel opened (a debounce, a blur) is dropped, not misfiled.
      if (!open || a.serial !== s.serial || a.text === open.notes) return s;
      return {
        ...s,
        store: save({ ...open, notes: a.text, notesAt: a.text.trim() ? a.stamp.now : null }, a.stamp),
      };
    case "toggleHidden": {
      if (!open) return s;
      const hidden = open.hidden.includes(a.id)
        ? open.hidden.filter((h) => h !== a.id)
        : [...open.hidden, a.id];
      return { ...s, store: save({ ...open, hidden }, a.stamp) };
    }
  }
}

/** What a map tap hit, with no tool waiting for taps. */
export interface TapHit {
  /** Inside the open parcel's boundary. */
  insideOpen: boolean;
  /** A county outline under the tap. */
  outline: ParcelRecord | null;
  /** A saved (built) parcel under the tap. */
  savedKey: string | null;
  /** Why no outline could be under it: a state parcel service that isn't answering in this view. */
  serviceDown?: string | null;
}

export type TapOutcome =
  | { kind: "clearLayer" }
  | { kind: "close" }
  | { kind: "nudge" }
  | { kind: "select"; record: ParcelRecord }
  | { kind: "openSaved"; key: string }
  | { kind: "none" };

/**
 * The selection rules (plan 13e §4): tap a visible outline to select it; tap the open parcel again, or empty
 * map, to unselect. A plain parcel swaps when you tap another; a built one stays until you close it (a small
 * nudge says so). A saved parcel under the tap wins over the county outline beneath it. With a layer
 * selected, the first tap only clears it.
 */
export function decideTap(s: ExploreState, hit: TapHit): TapOutcome {
  const open = s.store.open;
  if (open && s.layer) return { kind: "clearLayer" };
  const other = hit.savedKey && hit.savedKey !== open?.key ? hit.savedKey : null;
  if (open) {
    if (hit.insideOpen) return { kind: "close" };
    if (!other && !hit.outline) return { kind: "close" };
    if (isBuilt(open)) return { kind: "nudge" };
    return other ? { kind: "openSaved", key: other } : { kind: "select", record: hit.outline! };
  }
  if (other) return { kind: "openSaved", key: other };
  if (hit.outline) return { kind: "select", record: hit.outline };
  return { kind: "none" };
}
