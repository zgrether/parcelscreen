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
  DEFAULT_CONDITION,
  DEFAULT_WIDTH_FT,
  isDefaultName,
  nextLineName,
  EMPTY_STORE,
  openBuilt,
  plainParcel,
  removeBuilt,
  type LineCondition,
  type ListingField,
  reasonGiven,
  type ActiveStatus,
  type Milestone,
  type Markup,
  type MarkupKind,
  type ParcelStore,
  type WorkingParcel,
} from "@/lib/client/parcelStore";
import { memberKey } from "@/lib/geo/combine";
import type { ParcelRecord } from "@/lib/geo/parcels";
import { drawnPart } from "@/lib/geo/recipe";
import type { Side } from "@/lib/geo/split";
import type { LatLon } from "@/lib/geo/types";
import { lineLayer, type LayerId } from "./layers";

/** "track" and "easement" draw a line with the parcel (follow-up 34), with the Draw tool's corners. */
export type Mode = "draw" | "house" | "split" | "combine" | "track" | "easement" | null;

/** The modes that place corners on the map. */
export const DRAWING: readonly Mode[] = ["draw", "track", "easement"];

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
  /** The map panel is open (17e): basemaps, map layers, terrain. One panel at a time, with Info. */
  mapPanel: boolean;
  /** The layer selected in the panel or on the map. */
  layer: LayerId | null;
  /**
   * Which parcel is open: bumped when another one opens (or none), not when the open one is edited, nor when
   * a first change makes it built and gives it a key. The Info panel is keyed by it, so typing a first note
   * doesn't remount the box being typed in.
   */
  serial: number;
  /** The drawn line whose path is being redrawn (owner, A): Finish replaces it, keeping what else it holds. */
  editing: string | null;
}

export const INITIAL: ExploreState = {
  mode: null,
  store: EMPTY_STORE,
  draft: [],
  split: null,
  combine: null,
  info: false,
  mapPanel: false,
  layer: null,
  serial: 0,
  editing: null,
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
  /** Parcels from an imported file, added to History (16b); the open parcel isn't changed. */
  | { type: "imported"; added: WorkingParcel[] }
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
  /** Open or close the map panel (17e); opening it closes Info. */
  | { type: "mapPanel"; open: boolean }
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
  | { type: "askingPrice"; price: number | null; serial: number; stamp: Stamp }
  /** WF1: the listing's facts (name, link, acres, agent), for the parcel open when they were typed. */
  | { type: "listing"; patch: Partial<Pick<WorkingParcel, ListingField>>; serial: number; stamp: Stamp }
  /**
   * WF2: the parcel's status (in progress or saved); archiving it with a reason (blank is refused); restoring it to
   * what it was; a milestone's date ("2026-10-20"), or null to clear it. Each for the parcel open as `serial`.
   */
  | { type: "status"; status: ActiveStatus; serial: number; stamp: Stamp }
  | { type: "archive"; reason: string; serial: number; stamp: Stamp }
  | { type: "restore"; serial: number; stamp: Stamp }
  | { type: "milestone"; which: Milestone; date: string | null; serial: number; stamp: Stamp }
  /** Follow-up 34: start a drawn line, finish it (at least two points) into the open parcel, edit or delete one. */
  | { type: "startLine"; kind: "track" | "easement" }
  | { type: "finishLine"; id: string; stamp: Stamp }
  | { type: "markupNote"; id: string; note: string; serial: number; stamp: Stamp }
  /** Owner, #127: a line's name; a blank one is ignored. */
  | { type: "markupName"; id: string; name: string; serial: number; stamp: Stamp }
  | { type: "markupWidth"; id: string; widthFt: number; serial: number; stamp: Stamp }
  | { type: "markupDelete"; id: string; serial: number; stamp: Stamp }
  /** Owner, A: a line's kind and condition; its path redrawn; a deleted line put back (Undo). */
  | { type: "markupKind"; id: string; kind: MarkupKind; serial: number; stamp: Stamp }
  | { type: "markupCondition"; id: string; condition: LineCondition; serial: number; stamp: Stamp }
  | { type: "editLine"; id: string }
  | { type: "markupRestore"; markup: Markup; index: number; serial: number; stamp: Stamp }
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
const NO_TOOL: Pick<ExploreState, "mode" | "draft" | "split" | "combine" | "editing"> = {
  mode: null,
  draft: [],
  split: null,
  combine: null,
  editing: null,
};

/**
 * A drawn line with one edit applied. A new kind brings its own name, width and condition when the old ones were still
 * the old kind's defaults (a name, width or condition the user chose is kept). `others` are the parcel's other lines.
 */
function edited(
  m: Markup,
  a: Extract<
    ExploreAction,
    { type: "markupNote" | "markupName" | "markupWidth" | "markupKind" | "markupCondition" }
  >,
  others: readonly Markup[],
): Markup {
  switch (a.type) {
    case "markupNote":
      return { ...m, note: a.note };
    case "markupName":
      return a.name.trim() ? { ...m, name: a.name.trim() } : m;
    case "markupWidth":
      return { ...m, widthFt: a.widthFt };
    case "markupCondition":
      return { ...m, condition: a.condition };
    case "markupKind":
      return {
        ...m,
        kind: a.kind,
        name: a.kind !== m.kind && isDefaultName(m.name, m.kind) ? nextLineName(others, a.kind) : m.name,
        widthFt:
          m.widthFt === null || m.widthFt === DEFAULT_WIDTH_FT[m.kind] ? DEFAULT_WIDTH_FT[a.kind] : m.widthFt,
        condition: m.condition === DEFAULT_CONDITION[m.kind] ? DEFAULT_CONDITION[a.kind] : m.condition,
      };
  }
}

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
    case "imported":
      return { ...s, store: { ...s.store, built: [...s.store.built, ...a.added] } };
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
      // Cancelling a line's Edit goes back to its details (owner, #127).
      return {
        ...s,
        draft: [],
        mode: null,
        editing: null,
        ...(s.editing ? { layer: lineLayer(s.editing), info: true, mapPanel: false } : {}),
      };
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
      return a.open ? { ...s, info: true, mapPanel: false } : { ...s, ...PANEL_CLOSED };
    case "mapPanel":
      return a.open ? { ...s, mapPanel: true, ...PANEL_CLOSED } : { ...s, mapPanel: false };
    case "layer":
      return { ...s, layer: a.id, info: a.id ? true : s.info, mapPanel: a.id ? false : s.mapPanel };
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
    case "startLine":
      // Only with a parcel open: a line belongs to one.
      if (!open) return s;
      return { ...s, draft: [], mode: a.kind, combine: null, split: null, editing: null };
    case "finishLine": {
      if (!open || (s.mode !== "track" && s.mode !== "easement")) return s;
      if (new Set(s.draft.map(roundLL).map((p) => p.join())).size < 2) return s;
      // A double-click to finish also taps twice: repeated points are dropped.
      const points = s.draft
        .map(roundLL)
        .filter((p, i, all) => i === 0 || p[0] !== all[i - 1]![0] || p[1] !== all[i - 1]![1]);
      // A redrawn line (owner, A) keeps its id, kind, condition, width and note: only its path changes.
      if (s.editing && open.markup.some((m) => m.id === s.editing)) {
        const markup = open.markup.map((m) => (m.id === s.editing ? { ...m, line: points } : m));
        return {
          ...s,
          ...NO_TOOL,
          layer: lineLayer(s.editing),
          info: true,
          mapPanel: false,
          store: save({ ...open, markup }, a.stamp),
        };
      }
      const line: Markup = {
        id: a.id,
        kind: s.mode,
        name: nextLineName(open.markup, s.mode),
        condition: DEFAULT_CONDITION[s.mode],
        line: points,
        widthFt: DEFAULT_WIDTH_FT[s.mode],
        note: "",
        at: a.stamp.now,
      };
      return { ...s, ...NO_TOOL, store: save({ ...open, markup: [...open.markup, line] }, a.stamp) };
    }
    case "editLine": {
      const m = open?.markup.find((x) => x.id === a.id);
      if (!m) return s;
      return {
        ...s,
        ...NO_TOOL,
        mode: m.kind === "easement" ? "easement" : "track",
        draft: m.line,
        editing: m.id,
        // The line tool needs the map: its details come back on Finish or Cancel.
        layer: null,
      };
    }
    case "markupRestore": {
      // Undo of a delete (owner, A): back where it was, if it's still gone and the parcel is the same.
      if (!open || a.serial !== s.serial || open.markup.some((m) => m.id === a.markup.id)) return s;
      const markup = [...open.markup];
      markup.splice(Math.min(a.index, markup.length), 0, a.markup);
      return { ...s, store: save({ ...open, markup }, a.stamp) };
    }
    case "markupNote":
    case "markupName":
    case "markupWidth":
    case "markupKind":
    case "markupCondition":
    case "markupDelete": {
      // As notes: an edit after another parcel opened is dropped.
      if (!open || a.serial !== s.serial || !open.markup.some((m) => m.id === a.id)) return s;
      const markup =
        a.type === "markupDelete"
          ? open.markup.filter((m) => m.id !== a.id)
          : open.markup.map((m) =>
              m.id !== a.id
                ? m
                : edited(
                    m,
                    a,
                    open.markup.filter((x) => x.id !== a.id),
                  ),
            );
      // An edit that changes nothing (a blank name) saves nothing.
      if (markup.every((m, i) => m === open.markup[i]) && markup.length === open.markup.length) return s;
      const layer = a.type === "markupDelete" && s.layer === lineLayer(a.id) ? null : s.layer;
      return { ...s, layer, store: save({ ...open, markup }, a.stamp) };
    }
    case "askingPrice":
      // As notes: a save after another parcel opened is dropped. The date is the entry's (owner, #101).
      if (!open || a.serial !== s.serial || a.price === open.askingPrice) return s;
      return {
        ...s,
        store: save(
          { ...open, askingPrice: a.price, askingPriceAt: a.price === null ? null : a.stamp.now },
          a.stamp,
        ),
      };
    case "status":
      // Archived parcels come back through Restore, which knows what they were.
      if (!open || a.serial !== s.serial || open.status === a.status || open.status === "archived") return s;
      return { ...s, store: save({ ...open, status: a.status }, a.stamp) };
    case "archive": {
      const reason = a.reason.trim();
      if (!open || a.serial !== s.serial || open.status === "archived" || !reasonGiven(reason)) return s;
      const archived = { reason, at: a.stamp.now, from: open.status };
      return { ...s, store: save({ ...open, status: "archived", archived }, a.stamp) };
    }
    case "restore":
      if (!open || a.serial !== s.serial || !open.archived) return s;
      return { ...s, store: save({ ...open, status: open.archived.from, archived: null }, a.stamp) };
    case "milestone":
      if (!open || a.serial !== s.serial || open.milestones[a.which] === a.date) return s;
      return {
        ...s,
        store: save({ ...open, milestones: { ...open.milestones, [a.which]: a.date } }, a.stamp),
      };
    case "listing": {
      // As notes: a save after another parcel opened is dropped; one that changes nothing saves nothing.
      if (!open || a.serial !== s.serial) return s;
      const next = { ...open, ...a.patch };
      if ((Object.keys(a.patch) as ListingField[]).every((k) => next[k] === open[k])) return s;
      return { ...s, store: save(next, a.stamp) };
    }
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
  /** Parcel outlines are drawn at this zoom, so an empty spot has no record (not just none drawn yet). */
  linesShown?: boolean;
}

/** An empty tap where outlines are drawn (owner, 2026-10-11). */
export const NO_PARCEL_HERE = "No parcel record here. Draw a custom parcel?";

/** While a screen runs, switching parcels waits (owner, 17e). */
export const BUSY_TEXT = "Screening — finish or Cancel first.";

export type TapOutcome =
  | { kind: "clearLayer" }
  | { kind: "close" }
  /** A screen is running: no switching until it finishes or is cancelled (17e). */
  | { kind: "busy" }
  | { kind: "select"; record: ParcelRecord }
  | { kind: "openSaved"; key: string }
  | { kind: "none" };

/**
 * The selection rules (plan 13e §4, 17e §1): tap a visible outline to select it. Tapping another parcel
 * switches at once, whatever is open (a built one stays in History; the explorer offers Back), but not while a
 * screen runs (`busy`). Tapping the open parcel or empty map does nothing: the ×, Esc or another parcel
 * close it (owner, 17e). A saved parcel under the tap wins over the county outline beneath it. With a layer
 * selected, the first tap only clears it.
 */
export function decideTap(s: ExploreState, hit: TapHit, busy = false): TapOutcome {
  const open = s.store.open;
  if (open && s.layer) return { kind: "clearLayer" };
  if (open && hit.insideOpen) return { kind: "none" };
  const other = hit.savedKey && hit.savedKey !== open?.key ? hit.savedKey : null;
  const to: TapOutcome | null = other
    ? { kind: "openSaved", key: other }
    : hit.outline
      ? { kind: "select", record: hit.outline }
      : null;
  if (!to) return { kind: "none" };
  return busy && open ? { kind: "busy" } : to;
}
