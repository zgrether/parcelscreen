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
  nextMarkupName,
  EMPTY_STORE,
  openBuilt,
  plainParcel,
  removeBuilt,
  type EasementType,
  type LineCondition,
  type ListingField,
  type Milestone,
  type LineKind,
  type LineMarkup,
  type Markup,
  type MarkupKind,
  type ParcelStore,
  type Scenario,
  type WorkingParcel,
} from "@/lib/client/parcelStore";
import { memberKey } from "@/lib/geo/combine";
import type { ParcelRecord } from "@/lib/geo/parcels";
import { drawnPart } from "@/lib/geo/recipe";
import type { Side } from "@/lib/geo/split";
import type { LatLon } from "@/lib/geo/types";
import {
  nextScenarioName,
  relined,
  renamed,
  withoutScenario,
  withPieceScreen,
  withScenario,
  type PieceSide,
} from "@/lib/split/scenario";
import { lineLayer, type LayerId } from "./layers";
import { withArchive, withMilestone, withRestore } from "@/lib/client/parcelStatus";
import { starred, unstarred } from "@/lib/client/favorites";
import { withAskingPrice, withListing, withNotes } from "@/lib/client/parcelEdits";
import {
  AREA_KINDS,
  POINT_KINDS,
  type AreaKind,
  type MarkKind,
  type PointKind,
  type SepticClass,
} from "@/lib/report/marks";

/**
 * "track" and "easement" draw a line with the parcel (follow-up 34), with the Draw tool's corners. "point" and "area"
 * mark something on it (WF4): a point with one tap, an area with corners; `markKind` says what.
 */
export type Mode =
  "draw" | "house" | "split" | "combine" | "track" | "easement" | "drive" | "point" | "area" | null;

/** The modes that place corners on the map. */
export const DRAWING: readonly Mode[] = ["draw", "track", "easement", "drive", "area"];

/** The modes that draw a line: one per line kind (an existing drive since the Mark picker, owner after #136). */
export const LINE_MODES: readonly Mode[] = ["track", "easement", "drive"];

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
  /**
   * Step 12 (plan §2.4): the combination is a new parcel of this name ("{name} + next door"), graded once made; the
   * parcel it started from stays as it is. Null: a combination changes the open parcel, as before.
   */
  combineAsNew: string | null;
  /** Step 12: the open (by serial) to grade as soon as it's shown, after "Grade the combination". */
  gradeOnOpen: number | null;
  /** The parcel panel shows Details (step 8b; it was the Info panel, 13e-4); Grade when false. */
  info: boolean;
  /**
   * Step 14 (plan §6 B): the parcel panel shows Uses when Details doesn't. Details wins while `info` is on, so the paths
   * that open Details (a line selected, a mark placed, the toolbar's acres) need not know about it.
   */
  uses: boolean;
  /** Map layers is open (17e; step 8b: with the results on the map, and beside Details). */
  mapPanel: boolean;
  /** The layer selected in the panel or on the map. */
  layer: LayerId | null;
  /**
   * Which parcel is open: bumped when another one opens (or none), not when the open one is edited, nor when
   * a first change makes it built and gives it a key. The Info panel is keyed by it, so typing a first note
   * doesn't remount the box being typed in.
   */
  serial: number;
  /**
   * The drawn line whose path is being redrawn (owner, A), or the area (WF4): Finish replaces it, keeping what else it
   * holds. For a point, the next tap moves it.
   */
  editing: string | null;
  /** What the Mark tool marks next (WF4); null until a kind is picked. */
  markKind: MarkKind | null;
  /** Step 14 (plan §5): the scenario whose line the split tool is moving (Adjust the line); null for a new one. */
  scenarioLine: string | null;
  /**
   * Step 14: the scenario to grade next, on the parcel open as `serial`, and which of its pieces (both after Grade both
   * pieces, one after Try again). The grading hook takes it (scenarioGrading) and runs them one after the other.
   */
  gradeScenario: { id: string; sides: PieceSide[]; serial: number } | null;
}

export const INITIAL: ExploreState = {
  mode: null,
  store: EMPTY_STORE,
  draft: [],
  split: null,
  combine: null,
  combineAsNew: null,
  gradeOnOpen: null,
  info: false,
  uses: false,
  mapPanel: false,
  layer: null,
  serial: 0,
  editing: null,
  markKind: null,
  scenarioLine: null,
  gradeScenario: null,
};

/** The parcel panel's segment (step 14): Grade, Uses or Details. */
export type PanelView = "grade" | "uses" | "details";
export const panelView = (s: Pick<ExploreState, "info" | "uses">): PanelView =>
  s.info ? "details" : s.uses ? "uses" : "grade";

/** The time and a fresh key for a change that may save a parcel (the reducer stays pure). */
export interface Stamp {
  now: string;
  key: string;
  /** The current profile (step 6): who added a parcel that this change builds. */
  by?: string | null;
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
  /** The parcels as another page wrote them while the map was behind its tab (step 4b). */
  | { type: "adopt"; store: ParcelStore }
  | { type: "house"; ll: LatLon | null; stamp: Stamp }
  | { type: "startDraw" }
  | { type: "draftAdd"; ll: LatLon }
  | { type: "draftUndo" }
  | { type: "draftCancel" }
  /** Closes the drawn shape: a new parcel, or a piece added to the open one. */
  | { type: "finishDraw"; stamp: Stamp }
  /** The split tool (step 14: a scenario); with `scenario`, its line moved (Adjust the line). */
  | { type: "startSplit"; scenario?: string }
  | { type: "splitTap"; ll: LatLon }
  | { type: "splitMove"; a: LatLon; b: LatLon | null }
  | { type: "splitCancel" }
  /**
   * Grade both pieces (step 14, plan §5): the line placed is saved as a new scenario (`id`), or as the adjusted one's new
   * line, and both its pieces are to be graded; the panel shows Uses, where the scenario is. The caller has checked that
   * the line cuts the parcel in two.
   */
  | { type: "placeScenario"; id: string; stamp: Stamp }
  /** Try again: the pieces of a scenario graded again (those that didn't grade). */
  | { type: "regradeScenario"; id: string; sides: PieceSide[] }
  /** The grading hook has taken the scenario to grade. */
  | { type: "scenarioGrading" }
  /** A piece graded: its screen kept, for the scenario of the parcel open as `serial`. */
  | { type: "pieceScreened"; id: string; side: PieceSide; screenId: string; serial: number; stamp: Stamp }
  | { type: "scenarioName"; id: string; name: string; serial: number; stamp: Stamp }
  | { type: "scenarioRemove"; id: string; serial: number; stamp: Stamp }
  /** Undo of Remove this split (owner, after #312): the scenario back where it was. */
  | { type: "scenarioRestore"; scenario: Scenario; index: number; serial: number; stamp: Stamp }
  /**
   * Add this piece to the list: the new parcel (made by pieceAsParcel) is kept and opened; the parcel it came from stays
   * as it is. Graded as it opens when the piece had no screen.
   */
  | { type: "addPiece"; parcel: WorkingParcel; stamp: Stamp }
  /** Starts combining, with the open parcel's pieces (if any). */
  | { type: "startCombine"; asNew?: string }
  | { type: "gradedOnOpen" }
  /** Adds a parcel to the combination, or takes it out if it's already in. */
  | { type: "combineToggle"; parcel: ParcelRecord }
  | { type: "combineCancel" }
  /** Use the picked pieces; the caller has checked that they make one boundary. */
  | { type: "applyCombine"; stamp: Stamp }
  /** Open or close the Info panel; closing it clears the selected layer. */
  | { type: "info"; open: boolean }
  /** Step 14: the panel on Uses (closing Details), or back to Grade. */
  | { type: "uses"; open: boolean }
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
   * Step 8: starred with its name (a favorite; it builds a plain parcel) or unstarred (back to History). WF2: archiving
   * it with a reason (blank is refused); restoring it to the favorites; a milestone's date ("2026-10-20"), or null to
   * clear it. Each for the parcel open as `serial`.
   */
  | { type: "star"; name: string; serial: number; stamp: Stamp }
  | { type: "unstar"; serial: number; stamp: Stamp }
  | { type: "archive"; reason: string; serial: number; stamp: Stamp }
  | { type: "restore"; serial: number; stamp: Stamp }
  | { type: "milestone"; which: Milestone; date: string | null; serial: number; stamp: Stamp }
  /** Follow-up 34: start a drawn line, finish it (at least two points) into the open parcel, edit or delete one. */
  | { type: "startLine"; kind: LineKind }
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
  /**
   * WF4: the Mark tool with a kind (a point, or an area's corners); a point placed (or the one being moved, moved);
   * an area finished (at least three corners); a point dragged; a septic permit's class.
   */
  | { type: "startMark"; kind: MarkKind | null; shape: "point" | "area" }
  | { type: "placePoint"; id: string; ll: LatLon; stamp: Stamp }
  | { type: "finishArea"; id: string; stamp: Stamp }
  | { type: "movePoint"; id: string; ll: LatLon; serial: number; stamp: Stamp }
  | { type: "markupSeptic"; id: string; septicClass: SepticClass | null; serial: number; stamp: Stamp }
  /** WF5: an easement's "Recorded in"; the line scored as the driveway (null: the app's pick). */
  | { type: "markupRecorded"; id: string; recordedIn: string; serial: number; stamp: Stamp }
  /** Step 14: what an easement is for; null clears it. */
  | {
      type: "markupEasementType";
      id: string;
      easementType: EasementType | null;
      serial: number;
      stamp: Stamp;
    }
  | { type: "drivewayLine"; line: string | null; serial: number; stamp: Stamp }
  /** Undo of a delete: the line back where it was, and the driveway choice too when it was the line's (WF5). */
  | { type: "markupRestore"; markup: Markup; index: number; driveway?: boolean; serial: number; stamp: Stamp }
  /** A screen finished (or a house was re-assessed) for the parcel open when it started (`serial`). */
  | { type: "screened"; id: string; serial: number; stamp: Stamp };

/** The house is kept to 6 decimals, as in the prototype (proto L636). */
const roundLL = (ll: LatLon): LatLon => [+ll[0].toFixed(6), +ll[1].toFixed(6)];

/** Unselecting always closes the Info panel (owner, plan 13e §4); so does switching parcels, unless the panel
 * is docked beside the map (owner, 13e-4 review). A selected layer belonged to the old parcel either way. */
const PANEL_CLOSED: Pick<ExploreState, "info" | "uses" | "layer"> = { info: false, uses: false, layer: null };
// Uses isn't kept from one parcel to the next (step 14): each opens on Grade, or on Details when never graded.
const switched = (
  s: ExploreState,
  keepPanel?: boolean,
): Pick<ExploreState, "info" | "uses" | "layer" | "serial"> => ({
  info: !!keepPanel && s.info && !!s.store.open,
  uses: false,
  layer: null,
  serial: s.serial + 1,
});

/** Tools in progress end when the parcel changes underneath them. */
const NO_TOOL: Pick<
  ExploreState,
  "mode" | "draft" | "split" | "combine" | "editing" | "markKind" | "scenarioLine"
> = {
  mode: null,
  draft: [],
  split: null,
  combine: null,
  editing: null,
  markKind: null,
  scenarioLine: null,
};

const LINE_KINDS: readonly MarkupKind[] = ["track", "easement", "drive"];
const isLineKind = (k: MarkupKind): k is LineKind => LINE_KINDS.includes(k);
const isPointKind = (k: MarkupKind): k is PointKind => (POINT_KINDS as readonly MarkupKind[]).includes(k);
const isAreaKind = (k: MarkupKind): k is AreaKind => (AREA_KINDS as readonly MarkupKind[]).includes(k);

/** The corners drawn, rounded, with repeats in a row dropped (a double-click to finish taps twice). */
const cleanDraft = (draft: readonly LatLon[]): LatLon[] =>
  draft.map(roundLL).filter((p, i, all) => i === 0 || p[0] !== all[i - 1]![0] || p[1] !== all[i - 1]![1]);

/**
 * A drawn line or marker with one edit applied. A new kind brings its own name, width and condition when the old ones
 * were still the old kind's defaults (a name, width or condition the user chose is kept). `others` are the parcel's
 * other lines and markers.
 */
function edited(
  m: Markup,
  a: Extract<
    ExploreAction,
    {
      type:
        | "markupNote"
        | "markupName"
        | "markupWidth"
        | "markupKind"
        | "markupCondition"
        | "markupSeptic"
        | "markupRecorded"
        | "markupEasementType";
    }
  >,
  others: readonly Markup[],
): Markup {
  switch (a.type) {
    case "markupNote":
      return { ...m, note: a.note };
    case "markupName":
      return a.name.trim() ? { ...m, name: a.name.trim() } : m;
    case "markupWidth":
      return m.shape === "line" ? { ...m, widthFt: a.widthFt } : m;
    case "markupCondition":
      return m.shape === "line" ? { ...m, condition: a.condition } : m;
    case "markupSeptic":
      return m.shape !== "line" && m.kind === "septic" ? { ...m, septicClass: a.septicClass } : m;
    case "markupRecorded":
      return m.shape === "line" && m.recordedIn !== a.recordedIn.trim()
        ? { ...m, recordedIn: a.recordedIn.trim() }
        : m;
    case "markupEasementType":
      return m.shape === "line" && (m.easementType ?? null) !== a.easementType
        ? { ...m, easementType: a.easementType }
        : m;
    case "markupKind":
      return m.shape === "line" ? lineKind(m, a.kind, others) : markKind(m, a.kind, others);
  }
}

/** A marker of another kind of its shape (WF4): its default name follows, as a line's does; a class only on a permit. */
function markKind(m: Exclude<Markup, LineMarkup>, kind: MarkupKind, others: readonly Markup[]): Markup {
  const name = kind !== m.kind && isDefaultName(m.name, m.kind) ? nextMarkupName(others, kind) : m.name;
  const septicClass = kind === "septic" ? m.septicClass : null;
  if (m.shape === "point") return isPointKind(kind) ? { ...m, kind, name, septicClass } : m;
  return isAreaKind(kind) ? { ...m, kind, name, septicClass } : m;
}

function lineKind(m: LineMarkup, kind: MarkupKind, others: readonly Markup[]): Markup {
  if (!isLineKind(kind)) return m;
  return {
    ...m,
    kind,
    name: kind !== m.kind && isDefaultName(m.name, m.kind) ? nextMarkupName(others, kind) : m.name,
    widthFt:
      m.widthFt === null || m.widthFt === DEFAULT_WIDTH_FT[m.kind] ? DEFAULT_WIDTH_FT[kind] : m.widthFt,
    condition: m.condition === DEFAULT_CONDITION[m.kind] ? DEFAULT_CONDITION[kind] : m.condition,
  };
}

export function exploreReducer(s: ExploreState, a: ExploreAction): ExploreState {
  const save = (p: WorkingParcel, st: Stamp) => commitOpen(s.store, p, st.now, () => st.key, st.by ?? null);
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
    case "adopt": {
      // The same parcel open (or none): only the data changes. Another one: as a switch, tools and panel closed.
      const was = s.store.open,
        now = a.store.open;
      const same = was === now || (!!was && !!now && was.key === now.key);
      return same
        ? { ...s, store: a.store }
        : { ...s, ...NO_TOOL, ...PANEL_CLOSED, serial: s.serial + 1, store: a.store };
    }
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
        ...(s.editing ? { layer: lineLayer(s.editing), info: true } : {}),
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
    case "startSplit": {
      // Step 14: the split tool tries a scenario; Adjust the line starts from that scenario's line. A parcel saved with a
      // split before step 14 keeps it (read as before), and a new line cuts the whole parts, as a split always did.
      const moving = a.scenario ? open?.scenarios.find((sc) => sc.id === a.scenario) : undefined;
      return {
        ...s,
        split: moving ? { a: moving.a, b: moving.b } : null,
        scenarioLine: moving?.id ?? null,
        combine: null,
        mode: "split",
      };
    }
    case "splitTap":
      if (!s.split) return { ...s, split: { a: a.ll, b: null } };
      if (!s.split.b) return { ...s, split: { a: s.split.a, b: a.ll } };
      // The line is placed: its ends are dragged to move it, and Grade both pieces takes it.
      return s;
    case "splitMove":
      return { ...s, split: { a: a.a, b: a.b } };
    case "splitCancel":
      return { ...s, split: null, mode: null, scenarioLine: null };
    case "placeScenario": {
      if (!open || !s.split?.b) return s;
      const { a: from, b: to } = s.split;
      const moved = s.scenarioLine && open.scenarios.some((sc) => sc.id === s.scenarioLine);
      const id = moved ? s.scenarioLine! : a.id;
      const next = moved
        ? relined(open, id, from, to, a.stamp.now)
        : withScenario(open, {
            id,
            name: nextScenarioName(open.scenarios),
            a: from,
            b: to,
            screens: { left: null, right: null },
            at: a.stamp.now,
          });
      return {
        ...s,
        ...NO_TOOL,
        info: false,
        uses: true,
        layer: null,
        gradeScenario: { id, sides: ["left", "right"], serial: s.serial },
        store: save(next, a.stamp),
      };
    }
    case "regradeScenario":
      if (!open?.scenarios.some((sc) => sc.id === a.id) || !a.sides.length) return s;
      return { ...s, gradeScenario: { id: a.id, sides: a.sides, serial: s.serial } };
    case "scenarioGrading":
      return s.gradeScenario ? { ...s, gradeScenario: null } : s;
    case "pieceScreened":
    case "scenarioName":
    case "scenarioRemove": {
      // As notes: a change that lands after another parcel opened is dropped; one that changes nothing saves nothing.
      if (!open || a.serial !== s.serial) return s;
      const next =
        a.type === "pieceScreened"
          ? withPieceScreen(open, a.id, a.side, a.screenId)
          : a.type === "scenarioName"
            ? renamed(open, a.id, a.name)
            : withoutScenario(open, a.id);
      return next === open ? s : { ...s, store: save(next, a.stamp) };
    }
    case "addPiece":
      return {
        ...s,
        ...NO_TOOL,
        ...switched(s),
        gradeOnOpen: a.parcel.screenIds.length ? null : s.serial + 1,
        store: save(a.parcel, a.stamp),
      };
    case "startCombine":
      return {
        ...s,
        combine: open ? [...open.pieces] : [],
        combineAsNew: a.asNew ?? null,
        split: null,
        mode: "combine",
      };
    case "gradedOnOpen":
      return { ...s, gradeOnOpen: null };
    case "combineToggle": {
      if (!s.combine) return s;
      const k = memberKey(a.parcel);
      if (k === null) return { ...s, combine: [...s.combine, a.parcel] }; // a drawn piece is never "the same" as another
      const without = s.combine.filter((m) => memberKey(m) !== k);
      return { ...s, combine: without.length < s.combine.length ? without : [...s.combine, a.parcel] };
    }
    case "combineCancel":
      return { ...s, combine: null, combineAsNew: null, mode: s.mode === "combine" ? null : s.mode };
    case "applyCombine": {
      const pieces = s.combine;
      if (!pieces?.length) return s;
      // Step 12: the parcel next door, combined as a new parcel and graded; this one stays as it is.
      if (s.combineAsNew) {
        const made = { ...plainParcel(pieces[0]!, a.stamp.now), pieces, name: s.combineAsNew };
        return {
          ...s,
          ...NO_TOOL,
          ...switched(s),
          combineAsNew: null,
          gradeOnOpen: s.serial + 1,
          store: save(made, a.stamp),
        };
      }
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
      // Step 8b: `info` is the parcel panel on Details; Map layers is its own, and both can be open.
      return a.open ? { ...s, info: true } : { ...s, ...PANEL_CLOSED };
    case "uses":
      // Leaving Details closes what it had selected, as Grade does.
      return { ...s, ...PANEL_CLOSED, uses: a.open };
    case "mapPanel":
      return { ...s, mapPanel: a.open };
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
    case "askingPrice":
    case "listing": {
      // A save that lands after another parcel opened (a debounce, a blur) is dropped, not misfiled; one that
      // changes nothing saves nothing. The price's date is the entry's (owner, #101).
      if (!open || a.serial !== s.serial) return s;
      const next =
        a.type === "notes"
          ? withNotes(open, a.text, a.stamp.now)
          : a.type === "askingPrice"
            ? withAskingPrice(open, a.price, a.stamp.now)
            : withListing(open, a.patch);
      return next === open ? s : { ...s, store: save(next, a.stamp) };
    }
    case "startLine":
      // Only with a parcel open: a line belongs to one.
      if (!open) return s;
      return { ...s, draft: [], mode: a.kind, combine: null, split: null, editing: null, markKind: null };
    case "startMark":
      // As a line: with a parcel open. Changing the kind mid-way keeps an area's corners and what's being edited.
      if (!open) return s;
      return s.mode === a.shape
        ? { ...s, markKind: a.kind }
        : { ...s, draft: [], mode: a.shape, combine: null, split: null, editing: null, markKind: a.kind };
    case "placePoint": {
      if (!open || s.mode !== "point" || !s.markKind || !isPointKind(s.markKind)) return s;
      const ll = roundLL(a.ll);
      // "Move it": the point being edited goes where the tap was.
      if (s.editing && open.markup.some((m) => m.id === s.editing)) {
        const markup = open.markup.map((m) => (m.id === s.editing && m.shape === "point" ? { ...m, ll } : m));
        return {
          ...s,
          ...NO_TOOL,
          layer: lineLayer(s.editing),
          info: true,
          store: save({ ...open, markup }, a.stamp),
        };
      }
      const mark: Markup = {
        id: a.id,
        shape: "point",
        kind: s.markKind,
        name: nextMarkupName(open.markup, s.markKind),
        ll,
        septicClass: null,
        note: "",
        at: a.stamp.now,
      };
      // Its details open, to name it or add a note.
      return {
        ...s,
        ...NO_TOOL,
        layer: lineLayer(a.id),
        info: true,
        store: save({ ...open, markup: [...open.markup, mark] }, a.stamp),
      };
    }
    case "finishArea": {
      if (!open || s.mode !== "area" || !s.markKind || !isAreaKind(s.markKind)) return s;
      const ring = cleanDraft(s.draft);
      const distinct = new Set(ring.map((p) => p.join())).size;
      // A septic permit (owner, after #136): one tap is the permit's point; three or more outline its field.
      if (distinct === 1 && s.markKind === "septic" && !s.editing) {
        const mark: Markup = {
          id: a.id,
          shape: "point",
          kind: "septic",
          name: nextMarkupName(open.markup, "septic"),
          ll: ring[0]!,
          septicClass: null,
          note: "",
          at: a.stamp.now,
        };
        return {
          ...s,
          ...NO_TOOL,
          layer: lineLayer(a.id),
          info: true,
          store: save({ ...open, markup: [...open.markup, mark] }, a.stamp),
        };
      }
      if (distinct < 3) return s;
      if (s.editing && open.markup.some((m) => m.id === s.editing)) {
        const markup = open.markup.map((m) =>
          m.id === s.editing && m.shape === "area" ? { ...m, ring } : m,
        );
        return {
          ...s,
          ...NO_TOOL,
          layer: lineLayer(s.editing),
          info: true,
          store: save({ ...open, markup }, a.stamp),
        };
      }
      const mark: Markup = {
        id: a.id,
        shape: "area",
        kind: s.markKind,
        name: nextMarkupName(open.markup, s.markKind),
        ring,
        septicClass: null,
        note: "",
        at: a.stamp.now,
      };
      return {
        ...s,
        ...NO_TOOL,
        layer: lineLayer(a.id),
        info: true,
        store: save({ ...open, markup: [...open.markup, mark] }, a.stamp),
      };
    }
    case "movePoint": {
      // A point dragged on the map (WF4), as the house is: for the parcel open when it was dragged.
      if (!open || a.serial !== s.serial) return s;
      const ll = roundLL(a.ll);
      const markup = open.markup.map((m) => (m.id === a.id && m.shape === "point" ? { ...m, ll } : m));
      if (markup.every((m, i) => m === open.markup[i])) return s;
      return { ...s, store: save({ ...open, markup }, a.stamp) };
    }
    case "finishLine": {
      if (!open || (s.mode !== "track" && s.mode !== "easement" && s.mode !== "drive")) return s;
      if (new Set(s.draft.map(roundLL).map((p) => p.join())).size < 2) return s;
      // A double-click to finish also taps twice: repeated points are dropped.
      const points = cleanDraft(s.draft);
      // A redrawn line (owner, A) keeps its id, kind, condition, width and note: only its path changes.
      if (s.editing && open.markup.some((m) => m.id === s.editing)) {
        const markup = open.markup.map((m) =>
          m.id === s.editing && m.shape === "line" ? { ...m, line: points } : m,
        );
        return {
          ...s,
          ...NO_TOOL,
          layer: lineLayer(s.editing),
          info: true,
          store: save({ ...open, markup }, a.stamp),
        };
      }
      const line: Markup = {
        id: a.id,
        shape: "line",
        recordedIn: "",
        kind: s.mode,
        name: nextMarkupName(open.markup, s.mode),
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
      // An area is redrawn from its corners (owner, WF4: no corner editing yet); a point moves to the next tap.
      if (m.shape !== "line")
        return {
          ...s,
          ...NO_TOOL,
          mode: m.shape,
          markKind: m.kind,
          draft: m.shape === "area" ? m.ring : [],
          editing: m.id,
          layer: null,
        };
      return {
        ...s,
        ...NO_TOOL,
        mode: m.kind,
        draft: m.line,
        editing: m.id,
        // The line tool needs the map: its details come back on Finish or Cancel.
        layer: null,
      };
    }
    case "scenarioRestore": {
      // Back where it was, if it's still gone and the parcel is the same.
      if (!open || a.serial !== s.serial || open.scenarios.some((x) => x.id === a.scenario.id)) return s;
      const scenarios = [...open.scenarios];
      scenarios.splice(Math.min(a.index, scenarios.length), 0, a.scenario);
      return { ...s, store: save({ ...open, scenarios }, a.stamp) };
    }
    case "markupRestore": {
      // Undo of a delete (owner, A): back where it was, if it's still gone and the parcel is the same.
      if (!open || a.serial !== s.serial || open.markup.some((m) => m.id === a.markup.id)) return s;
      const markup = [...open.markup];
      markup.splice(Math.min(a.index, markup.length), 0, a.markup);
      const drivewayLine = a.driveway ? a.markup.id : open.drivewayLine;
      return { ...s, store: save({ ...open, markup, drivewayLine }, a.stamp) };
    }
    case "drivewayLine": {
      // As notes: a choice made after another parcel opened is dropped; the same choice saves nothing.
      if (!open || a.serial !== s.serial || open.drivewayLine === a.line) return s;
      if (a.line && !open.markup.some((m) => m.id === a.line && m.shape === "line")) return s;
      return { ...s, store: save({ ...open, drivewayLine: a.line }, a.stamp) };
    }
    case "markupNote":
    case "markupName":
    case "markupWidth":
    case "markupKind":
    case "markupCondition":
    case "markupSeptic":
    case "markupRecorded":
    case "markupEasementType":
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
      // A line chosen as the driveway, deleted: the card scores the app's pick again (WF5; Undo restores both).
      const drivewayLine = a.type === "markupDelete" && open.drivewayLine === a.id ? null : open.drivewayLine;
      return { ...s, layer, store: save({ ...open, markup, drivewayLine }, a.stamp) };
    }
    case "star":
    case "unstar":
    case "archive":
    case "restore":
    case "milestone": {
      // As notes: a change after another parcel opened is dropped; one that changes nothing saves nothing.
      if (!open || a.serial !== s.serial) return s;
      const next =
        a.type === "star"
          ? starred(open, a.name)
          : a.type === "unstar"
            ? unstarred(open)
            : a.type === "archive"
              ? withArchive(open, a.reason, a.stamp.now)
              : a.type === "restore"
                ? withRestore(open)
                : withMilestone(open, a.which, a.date);
      return next === open ? s : { ...s, store: save(next, a.stamp) };
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
