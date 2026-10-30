/**
 * The Places layer's data (roadmap step 14d, docs/plans/step-14d-places.md §5): which places each kind shows, as map
 * features, and the tap card's lines. Pure: the map component (components/Map/PlacesLayer.tsx) loads the cells and
 * draws; nothing here fetches. Strings are the plan's §9 (declared).
 */
import type { Feature, FeatureCollection, Point } from "geojson";
import { CLOSER_GROCERY, NEAREST_HOSPITAL, REAL_GROCERY } from "../screen/driveList";
import type { LongTrail } from "../screen/data/longTrails";
import type { ErPlace } from "../screen/hospitals";
import type { Place, PlaceSource } from "../screen/placeData";
import type { ScreenResult, UserConfig } from "../screen/types";
import type { LatLon } from "../geo/types";

/** The sub-toggles, in the panel's order. */
export const PLACE_KINDS = ["er", "airport", "trailhead", "grocery", "longTrail", "launch"] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

export const PLACES_WORDS = {
  toggle: "Places",
  kinds: {
    er: "ER hospitals",
    airport: "Airports",
    trailhead: "Trailheads",
    grocery: "Groceries",
    longTrail: "Long-trail access",
    launch: "Paddle launches",
  } satisfies Record<PlaceKind, string>,
  zoomIn: "Zoom in to see places",
  failed: "Some places didn't load",
  attribution: "Places: © OpenStreetMap contributors, USFS, CMS, the states' parks",
  // Polish 2 (P11): the class in plain words; a river launch beside a graded parcel says why it has no drive.
  river: "Check the river's class (how hard its rapids are) before paddling",
  notTimed: "Not timed: rivers are listed, not graded",
  /** Under the toggles: the launches' two colours. */
  launchKey: "Paddle launches: blue on a lake or reservoir, green on a river.",
  checked: (date: string) => `Checked ${date}`,
  minutes: (n: number) => `${n} min from this parcel`,
} as const;

/** Each kind's one-place type, the card's second line. */
const TYPE: Record<Exclude<PlaceKind, "launch">, string> = {
  er: "ER hospital",
  airport: "Airport",
  trailhead: "Trailhead",
  grocery: "Grocery",
  longTrail: "Long-trail access",
};

/** Where a baked place came from, as the card says it. */
const SOURCE_NAME: Record<PlaceSource, string> = {
  osm: "OpenStreetMap",
  usfs: "US Forest Service",
  "va-parks": "Virginia State Parks",
  "nc-parks": "NC State Parks",
  "tn-parks": "Tennessee State Parks",
  "tn-trec": "Tennessee's TREC trails",
  ridb: "Recreation.gov",
  crags: "Parcel Screen's climbing list",
};

/** What a feature carries: enough for its icon and its card, all primitives (GeoJSON properties). */
export interface PlaceProps {
  id: string;
  kind: PlaceKind;
  name: string;
  /** The card's source line; empty when it has none (an airport from Settings). */
  source: string;
  /** The date its list was checked or baked, YYYY-MM-DD; empty when none. */
  checked: string;
  /** Launches: "flat" or "river"; empty otherwise. */
  water: "flat" | "river" | "";
  /** A launch's lake or river; a long-trail point's trail. */
  of: string;
}

export type PlaceFeature = Feature<Point, PlaceProps>;

const feature = (ll: LatLon, p: PlaceProps): PlaceFeature => ({
  type: "Feature",
  properties: p,
  geometry: { type: "Point", coordinates: [ll[1], ll[0]] },
});

/** The baked kinds from a cell's places (parking isn't shown: it's a trailhead's, never a place of its own). */
export function bakedFeatures(
  places: readonly Place[],
  baked: string,
): Partial<Record<PlaceKind, PlaceFeature[]>> {
  const out: Partial<Record<PlaceKind, PlaceFeature[]>> = {};
  const add = (k: PlaceKind, f: PlaceFeature) => (out[k] ??= []).push(f);
  for (const p of places) {
    const base = { id: p.id, name: p.name ?? "Paddle launch", source: SOURCE_NAME[p.src], checked: baked };
    if (p.kind === "grocer") add("grocery", feature(p.ll, { ...base, kind: "grocery", water: "", of: "" }));
    else if (p.kind === "trailhead")
      add("trailhead", feature(p.ll, { ...base, kind: "trailhead", water: "", of: "" }));
    else if (p.kind === "launch")
      add("launch", feature(p.ll, { ...base, kind: "launch", water: p.water, of: p.waterName ?? "" }));
  }
  return out;
}

export const erFeatures = (ers: readonly ErPlace[], checked: string): PlaceFeature[] =>
  ers.map((h, i) =>
    feature(h.ll, { id: `er:${i}`, kind: "er", name: h.name, source: "CMS", checked, water: "", of: "" }),
  );

/** Settings' airports (plan Q7: the ones a grade times). */
export const airportFeatures = (anchors: UserConfig["anchors"]): PlaceFeature[] =>
  anchors.map((a, i) =>
    feature([a.lat, a.lon], {
      id: `airport:${i}`,
      kind: "airport",
      name: a.name,
      source: "",
      checked: "",
      water: "",
      of: "",
    }),
  );

export const longTrailFeatures = (trails: readonly LongTrail[]): PlaceFeature[] =>
  trails.flatMap((t) =>
    t.points.map((p) =>
      feature([p.lat, p.lon], {
        id: `trail:${t.name}:${p.name}`,
        kind: "longTrail",
        name: p.name,
        source: "",
        checked: "",
        water: "",
        of: t.name,
      }),
    ),
  );

export const collection = (features: readonly PlaceFeature[]): FeatureCollection<Point, PlaceProps> => ({
  type: "FeatureCollection",
  features: [...features],
});

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
/** Metres, flat-earth: enough to say two points are one place. */
const metres = (a: LatLon, b: LatLon) =>
  Math.hypot((b[0] - a[0]) * 111_200, (b[1] - a[1]) * 111_320 * Math.cos((a[0] * Math.PI) / 180));
/** A baked trailhead and the result's are one when this close (the result may have merged a TREC one into it). */
const SAME_TRAILHEAD_M = 50;

/** The minutes the open parcel's grade already timed to this place, if it did; nothing is fetched. */
/** What the tap card reads of the open parcel's result. */
export type TimedResult = Pick<ScreenResult, "drives" | "closerGrocery" | "near" | "longTrail" | "paddling">;

export function timedMinutes(r: TimedResult | null, p: PlaceProps, ll: LatLon): number | null {
  if (!r) return null;
  const drive = (pred: (d: NonNullable<ScreenResult["drives"]>[number]) => boolean) =>
    [...(r.drives ?? []), ...(r.closerGrocery ? [r.closerGrocery] : [])].find(pred)?.min ?? null;
  switch (p.kind) {
    case "er":
      return drive((d) => d.label === NEAREST_HOSPITAL && sameName(d.name, p.name));
    case "grocery":
      return drive(
        (d) => (d.label === REAL_GROCERY || d.label === CLOSER_GROCERY) && sameName(d.name, p.name),
      );
    case "airport":
      return drive((d) => sameName(d.label, p.name));
    case "trailhead": {
      const t = r.near?.trailheads.find((x) => x.drive && metres(x.ll, ll) <= SAME_TRAILHEAD_M);
      return t?.drive?.min ?? null;
    }
    case "longTrail":
      return r.longTrail && sameName(r.longTrail.trail, p.of) && sameName(r.longTrail.point, p.name)
        ? r.longTrail.min
        : null;
    case "launch": {
      const f = r.paddling?.flat;
      return p.water === "flat" && f && sameName(f.name, p.name) && (f.water ?? "") === p.of ? f.min : null;
    }
  }
}

/**
 * The tap card's lines: the name, its type, its source, when it was checked, the drive from the open parcel when the
 * grade timed it, and a river's warning. `firstFlat`: the first flatwater card of a visit says what flatwater is.
 * `graded`: a parcel's grade is open, so a river launch's missing drive is said to be by design.
 */
export function cardLines(
  p: PlaceProps,
  minutes: number | null,
  firstFlat = false,
  graded = false,
): string[] {
  const river = p.kind === "launch" && p.water === "river";
  const type =
    p.kind === "launch"
      ? `Paddle launch: ${p.water === "flat" ? (firstFlat ? "flatwater (a lake or reservoir)" : "flatwater") : "river"}${p.of ? `, ${p.of}` : ""}`
      : p.kind === "longTrail" && p.of
        ? `${TYPE.longTrail}: ${p.of}`
        : TYPE[p.kind];
  return [
    p.name,
    type,
    ...(p.source ? [`From ${p.source}`] : []),
    ...(p.checked ? [PLACES_WORDS.checked(p.checked)] : []),
    ...(minutes !== null ? [PLACES_WORDS.minutes(minutes)] : river && graded ? [PLACES_WORDS.notTimed] : []),
    ...(river ? [PLACES_WORDS.river] : []),
  ];
}

/** The 1° cells (lib/screen/placeData.ts cellOf's names) a [west, south, east, north] box touches. */
export function cellsInBox([w, s, e, n]: readonly [number, number, number, number]): string[] {
  const out: string[] = [];
  for (let a = Math.floor(s); a <= Math.floor(n); a++)
    for (let o = Math.floor(w); o <= Math.floor(e); o++) out.push(`${a}_${o}`);
  return out;
}
