/**
 * Split as a scenario (step 14, docs/plans/step-14-land-uses.md §5, §13 Q6–Q7): a line across the parcel's parts, and
 * the two pieces it makes, each graded as its own parcel would be: the same parts with the split kept on its side, the
 * lines as drawn (the engine measures the part inside), the marks inside the piece only, and the house only if it's
 * inside. No land price. Pure: the reducer and the grading hook call these.
 */
import { bearing, booleanPointInPolygon, centroid, point } from "@turf/turf";
import type { Feature, Polygon } from "geojson";
import { deriveParcel } from "../geo/recipe";
import type { Side } from "../geo/split";
import type { LatLon } from "../geo/types";
import { areaPolygon } from "../report/marks";
import { SCREEN_CONSTANTS } from "../screen/config";
import { starred } from "../client/favorites";
import {
  FROM_ORIGINAL,
  plainParcel,
  type Markup,
  type Scenario,
  type WorkingParcel,
} from "../client/parcelStore";
import { SIDE_WORD, SPLIT_WORDS } from "./words";

/** Left and right of the line's direction a→b, as the screens are kept. */
export type PieceSide = "left" | "right";
export const PIECE_SIDES: readonly PieceSide[] = ["left", "right"];

/** The split tool's side (lib/geo/split.ts): −1 left of a→b, +1 right. */
export const sideOf = (side: PieceSide): Side => (side === "left" ? -1 : 1);

/** The compass word for the side a piece lies on: "North", "Southwest". */
export function pieceSideWord(a: LatLon, b: LatLon, side: PieceSide): string {
  const br = (bearing([a[1], a[0]], [b[1], b[0]]) + 90 * sideOf(side) + 360) % 360;
  return SIDE_WORD[Math.round(br / 45) % 8]!;
}

const DEFAULT_NAME = /^Split (\d+)$/;
/** "Split 1", one past the highest default name in use. */
export function nextScenarioName(scenarios: readonly Pick<Scenario, "name">[]): string {
  const used = scenarios.map((s) => Number(DEFAULT_NAME.exec(s.name)?.[1] ?? 0));
  return SPLIT_WORDS.defaultName(Math.max(0, ...used) + 1);
}

const inside = (ll: LatLon, geo: Feature<Polygon>): boolean =>
  booleanPointInPolygon(point([ll[1], ll[0]]), geo);

/**
 * The markup a piece is graded with: every line as drawn, and the points and areas inside it (an area by its centre, so
 * one the line cuts goes with the piece holding most of it).
 */
export function markupInside(markup: readonly Markup[], geo: Feature<Polygon>): Markup[] {
  return markup.filter((m) => {
    if (m.shape === "line") return true;
    if (m.shape === "point") return inside(m.ll, geo);
    const [lon, lat] = centroid(areaPolygon(m.ring)).geometry.coordinates as [number, number];
    return inside([lat, lon], geo);
  });
}

/** One piece as a parcel to grade: its boundary and acres, and the parcel it is (the store's shape, never saved). */
export interface Piece {
  side: PieceSide;
  /** "North" */
  word: string;
  acres: number;
  geo: Feature<Polygon>;
  parcel: WorkingParcel;
}

/** The piece on this side of the scenario's line; null when the line doesn't cut the parts into two. */
export function pieceOf(
  p: WorkingParcel,
  line: Pick<Scenario, "a" | "b">,
  side: PieceSide,
  limits = SCREEN_CONSTANTS.combine,
): Piece | null {
  const split = { a: line.a, b: line.b, keep: sideOf(side) };
  const d = deriveParcel({ parts: p.pieces, split }, limits);
  if (!d.ok || d.splitDropped) return null;
  const geo = d.record.geo;
  return {
    side,
    word: pieceSideWord(line.a, line.b, side),
    acres: d.acres,
    geo,
    parcel: {
      ...p,
      split,
      house: p.house && inside(p.house, geo) ? p.house : null,
      markup: markupInside(p.markup, geo),
      scenarios: [],
    },
  };
}

/** Both pieces, left then right; null when the line doesn't cut the parts into two. */
export function piecesOf(p: WorkingParcel, line: Pick<Scenario, "a" | "b">): [Piece, Piece] | null {
  const left = pieceOf(p, line, "left"),
    right = pieceOf(p, line, "right");
  return left && right ? [left, right] : null;
}

/**
 * "Add this piece to the list" (§5.1): a new parcel from the same parts with the split kept on the piece's side, its
 * house, marks and lines as the piece was graded with, on the list by `name`, with the piece's screen as its own when it
 * has one. The parent's deed restrictions and HOA come with it, marked "from the original parcel" (owner, after #312);
 * nothing else of the listing does (no price, no link, no acres).
 */
export function pieceAsParcel(
  piece: Piece,
  screenId: string | null,
  name: string,
  now: string,
): WorkingParcel {
  const g = piece.parcel;
  return starred(
    {
      ...plainParcel(g.pieces[0]!, now),
      pieces: g.pieces,
      split: g.split,
      house: g.house,
      markup: g.markup,
      drivewayLine: g.drivewayLine,
      screenIds: screenId ? [screenId] : [],
      deedRestrictions: g.deedRestrictions,
      hoa: g.hoa,
      ...copied(g),
    },
    name,
  );
}

/** Which of the deed restrictions and HOA the parent has to copy: those typed or picked. */
function copied(g: WorkingParcel): Pick<WorkingParcel, "fromOriginal"> {
  const from = FROM_ORIGINAL.filter((k) =>
    k === "hoa" ? g.hoa !== "unknown" : g.deedRestrictions.trim() !== "",
  );
  return from.length ? { fromOriginal: from } : {};
}

// ---------- the parcel's scenarios (the reducer's edits; each returns the parcel itself when nothing changes) ----------

export const withScenario = (p: WorkingParcel, sc: Scenario): WorkingParcel => ({
  ...p,
  scenarios: [...p.scenarios, sc],
});

const edit = (p: WorkingParcel, id: string, f: (sc: Scenario) => Scenario): WorkingParcel => {
  let changed = false;
  const scenarios = p.scenarios.map((sc) => {
    if (sc.id !== id) return sc;
    const next = f(sc);
    changed ||= next !== sc;
    return next;
  });
  return changed ? { ...p, scenarios } : p;
};

/** A new line: the old screens no longer fit it, so both pieces wait for a grade. */
export const relined = (p: WorkingParcel, id: string, a: LatLon, b: LatLon, now: string): WorkingParcel =>
  edit(p, id, (sc) => ({ ...sc, a, b, screens: { left: null, right: null }, at: now }));

/** A blank name is ignored. */
export const renamed = (p: WorkingParcel, id: string, name: string): WorkingParcel =>
  edit(p, id, (sc) => (name.trim() && name.trim() !== sc.name ? { ...sc, name: name.trim() } : sc));

export const withoutScenario = (p: WorkingParcel, id: string): WorkingParcel =>
  p.scenarios.some((sc) => sc.id === id) ? { ...p, scenarios: p.scenarios.filter((sc) => sc.id !== id) } : p;

/** A piece graded: its screen kept under the scenario. */
export const withPieceScreen = (
  p: WorkingParcel,
  id: string,
  side: PieceSide,
  screenId: string,
): WorkingParcel =>
  edit(p, id, (sc) =>
    sc.screens[side] === screenId ? sc : { ...sc, screens: { ...sc.screens, [side]: screenId } },
  );
