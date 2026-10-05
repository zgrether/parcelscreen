/**
 * The explorer's parcel-finding state and its transitions (proto L561–707): the tool mode, the loaded
 * parcel, the existing house, the boundary being drawn, the split line, and the "no parcel here" report.
 * Pure: the map and panel components dispatch actions and render from this.
 */
import { polygon } from "@turf/turf";
import type { ParcelRecord } from "@/lib/geo/parcels";
import { splitFromLabel, type SplitPieces } from "@/lib/geo/split";
import type { LatLon } from "@/lib/geo/types";

export type Mode = "pick" | "draw" | "house" | "split" | null;

/** What the hint says while each tool waits for taps (proto L578). */
export const MODE_HINT: Record<NonNullable<Mode>, string> = {
  pick: "Tap a lot — with parcel lines on, tap any outline",
  draw: "Tap each corner. Then tap the first corner again, or press Finish.",
  house: "Tap where the house stands (drag the bulls-eye later to adjust)",
  split: "Tap two points to draw the dividing line across the parcel",
};

export interface SplitLine {
  a: LatLon;
  /** Null until the second tap. */
  b: LatLon | null;
}

export interface ExploreState {
  mode: Mode;
  parcel: ParcelRecord | null;
  house: LatLon | null;
  /** Corners of the boundary being drawn. */
  draft: LatLon[];
  split: SplitLine | null;
  /** The last tap found no parcel: what each service said, and where (for the square fallback). */
  noParcel: { ll: LatLon; report: string[] } | null;
}

export const INITIAL: ExploreState = {
  mode: null,
  parcel: null,
  house: null,
  draft: [],
  split: null,
  noParcel: null,
};

export type ExploreAction =
  | { type: "mode"; mode: Mode }
  /** A parcel from any source; `mode` is the tool mode afterwards (a successful tap lookup stays in "pick"). */
  | { type: "parcel"; parcel: ParcelRecord | null; mode?: Mode }
  | { type: "noParcel"; ll: LatLon; report: string[] }
  | { type: "house"; ll: LatLon | null }
  | { type: "startDraw" }
  | { type: "draftAdd"; ll: LatLon }
  | { type: "draftCancel" }
  /** Closes the drawn boundary; the caller checks there are at least three corners. */
  | { type: "finishDraw" }
  | { type: "startSplit" }
  | { type: "splitTap"; ll: LatLon }
  | { type: "splitMove"; a: LatLon; b: LatLon | null }
  | { type: "splitCancel" }
  | { type: "usePiece"; pieces: SplitPieces; side: 1 | -1 }
  | { type: "clear" };

/** The house is kept to 6 decimals, as in the prototype (proto L636). */
const roundLL = (ll: LatLon): LatLon => [+ll[0].toFixed(6), +ll[1].toFixed(6)];

export function exploreReducer(s: ExploreState, a: ExploreAction): ExploreState {
  switch (a.type) {
    case "mode":
      return { ...s, mode: a.mode };
    case "parcel":
      // A different parcel ends any split of the old one.
      return { ...s, parcel: a.parcel, noParcel: null, split: null, mode: a.mode ?? s.mode };
    case "noParcel":
      return { ...s, noParcel: { ll: a.ll, report: a.report } };
    case "house":
      return { ...s, house: a.ll ? roundLL(a.ll) : null, mode: s.mode === "house" ? null : s.mode };
    case "startDraw":
      return { ...s, draft: [], mode: "draw" };
    case "draftAdd":
      return { ...s, draft: [...s.draft, a.ll] };
    case "draftCancel":
      return { ...s, draft: [], mode: null };
    case "finishDraw": {
      if (s.draft.length < 3) return s;
      const ring = s.draft.map(([lat, lon]) => [lon, lat]);
      ring.push(ring[0]!);
      const parcel: ParcelRecord = { geo: polygon([ring]), props: {}, source: "drawn", multiPart: false };
      return { ...s, parcel, noParcel: null, split: null, draft: [], mode: null };
    }
    case "startSplit":
      return { ...s, split: null, mode: "split" };
    case "splitTap":
      if (!s.split) return { ...s, split: { a: a.ll, b: null } };
      if (!s.split.b) return { ...s, split: { a: s.split.a, b: a.ll }, mode: null };
      return s;
    case "splitMove":
      return { ...s, split: { a: a.a, b: a.b } };
    case "splitCancel":
      return { ...s, split: null, mode: null };
    case "usePiece": {
      const geo = a.side < 0 ? a.pieces.left : a.pieces.right;
      if (!geo || !s.parcel) return s;
      const props = { ...s.parcel.props, split_from: splitFromLabel(s.parcel.props) };
      return {
        ...s,
        parcel: { geo, props, source: "split", multiPart: false },
        noParcel: null,
        split: null,
        mode: null,
      };
    }
    case "clear":
      return INITIAL;
  }
}
