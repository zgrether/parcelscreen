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
}

export const INITIAL: ExploreState = {
  mode: null,
  store: EMPTY_STORE,
  draft: [],
  split: null,
  combine: null,
};

/** The time and a fresh key for a change that may save a parcel (the reducer stays pure). */
export interface Stamp {
  now: string;
  key: string;
}

export type ExploreAction =
  | { type: "mode"; mode: Mode }
  /** Open a parcel straight from a tap on its outline. */
  | { type: "select"; record: ParcelRecord; stamp: Stamp }
  /** Unselect: close the open parcel (a built one stays in History). */
  | { type: "close" }
  | { type: "openSaved"; key: string }
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
  | { type: "applyCombine"; stamp: Stamp };

/** The house is kept to 6 decimals, as in the prototype (proto L636). */
const roundLL = (ll: LatLon): LatLon => [+ll[0].toFixed(6), +ll[1].toFixed(6)];

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
      return { ...s, ...NO_TOOL, store: save(plainParcel(a.record, a.stamp.now), a.stamp) };
    case "close":
      return { ...s, ...NO_TOOL, store: closeOpen(s.store) };
    case "openSaved":
      return { ...s, ...NO_TOOL, store: openBuilt(s.store, a.key) };
    case "removeSaved":
      return { ...s, ...(open?.key === a.key ? NO_TOOL : {}), store: removeBuilt(s.store, a.key) };
    case "house":
      if (!open) return s;
      return {
        ...s,
        store: save({ ...open, house: a.ll ? roundLL(a.ll) : null }, a.stamp),
        mode: s.mode === "house" ? null : s.mode,
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
      return { ...s, ...NO_TOOL, store: save(next, a.stamp) };
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
      return { ...s, ...NO_TOOL, store: save(next, a.stamp) };
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
}

export type TapOutcome =
  | { kind: "close" }
  | { kind: "nudge" }
  | { kind: "select"; record: ParcelRecord }
  | { kind: "openSaved"; key: string }
  | { kind: "none" };

/**
 * The selection rules (plan 13e §4): tap a visible outline to select it; tap the open parcel again, or empty
 * map, to unselect. A plain parcel swaps when you tap another; a built one stays until you close it (a small
 * nudge says so). A saved parcel under the tap wins over the county outline beneath it.
 */
export function decideTap(s: ExploreState, hit: TapHit): TapOutcome {
  const open = s.store.open;
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
