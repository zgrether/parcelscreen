/**
 * A parcel as a recipe (step 13e): the parts it's made of, and an optional split. The boundary, its facts
 * and its acres are always derived from the recipe, never stored, so any part can be edited later (taking a
 * parcel back out of a combination, moving or removing a split).
 *
 * A part is a ParcelRecord: a county record, or a drawn shape (source "drawn"). Several parts are combined
 * with the 13b rules (lib/geo/combine.ts), drawn ones included; overlaps count once.
 */
import { area, centroid, featureCollection, intersect, union } from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { combinedRecord, combineParcels, memberKey, type CombineLimits } from "./combine";
import { parcelFacts, type ParcelRecord } from "./parcels";
import { halfPlane, splitFromLabel, splitPieces, type Side, type SplitPieces } from "./split";
import { M2_PER_ACRE, type LatLon } from "./types";

/** A cut through the whole combined boundary (bridged strip included), and the side kept. */
export interface SplitCut {
  a: LatLon;
  b: LatLon;
  keep: Side;
}

export interface ParcelRecipe {
  parts: ParcelRecord[];
  split?: SplitCut;
}

export type DerivedParcel =
  | {
      ok: true;
      /** The boundary to screen, with the facts' props (IDs, owners, source label). */
      record: ParcelRecord;
      /** The parcels' own acres: a bridged road strip isn't part of the listing. */
      acres: number;
      /** Acres of bridged strip inside the boundary. */
      bridgeAcres: number;
      /** The widest gap bridged, m; 0 when the parts touch. */
      gapM: number;
      /** The split no longer cuts the boundary (a part was taken out, say): it was left off. */
      splitDropped: boolean;
    }
  | { ok: false; reason: "no parts" | "too far apart" | "no single boundary"; gapM: number };

/** True for a parcel from a county service (its source is the service URL). */
export const isCountyRecord = (r: ParcelRecord): boolean => /^https?:\/\//.test(r.source);

/** The state a county record comes from, by its parcel service's host. */
export const STATE_BY_HOST: Readonly<Record<string, string>> = {
  "services.nconemap.gov": "NC",
  "vginmaps.vdem.virginia.gov": "VA",
  "geoviewer.cot.tn.gov": "TN",
};

/**
 * The county part of a dedupe key: the record's 5-digit county FIPS code where it carries one (VA `FIPS`,
 * NC `stcntyfips`), else its county name in lower case (TN `COUNTY`). Parcel numbers repeat across
 * counties (VA's 52-44 exists in four), so the key must name the county, and a code doesn't vary in spelling.
 */
export function countyKey(r: ParcelRecord): string {
  const code = Object.entries(r.props).find(([k]) => /^(fips|stcntyfips)$/i.test(k))?.[1];
  const digits = typeof code === "number" ? String(code).padStart(5, "0") : String(code ?? "").trim();
  if (/^\d{5}$/.test(digits)) return digits;
  return (parcelFacts(r.geo, r.props).county ?? "").trim().toLowerCase();
}

/**
 * One recorded parcel's dedupe key, as REQUIREMENTS §3 defines it: `state:county:parcel_number` when the
 * record has a number, else `state:county:centroid (4 decimals):acres (rounded)`, with the county as
 * countyKey gives it. Null for a drawn piece.
 */
export function pieceDedupeKey(r: ParcelRecord): string | null {
  if (memberKey(r) === null) return null; // drawn: no identity
  const host = /^https?:\/\/([^/]+)/.exec(r.source)?.[1] ?? "";
  const state = STATE_BY_HOST[host] ?? "??";
  const f = parcelFacts(r.geo, r.props);
  const county = countyKey(r);
  if (f.parcelId) return `${state}:${county}:${f.parcelId.trim()}`;
  const [lon, lat] = centroid(r.geo).geometry.coordinates as [number, number];
  return `${state}:${county}:${lat.toFixed(4)},${lon.toFixed(4)}:${Math.round(f.acres)}`;
}

/**
 * What makes two parcels the same for de-duplication (Phase 1's `dedupe_key`): the keys of the recorded
 * parcels they include, sorted and joined with " & ". Drawn pieces never take part; a parcel of drawn
 * pieces only has no key (null).
 */
export function recipeDedupeKey(recipe: ParcelRecipe): string | null {
  const keys = recipe.parts.map(pieceDedupeKey).filter((k): k is string => k !== null);
  return keys.length ? [...new Set(keys)].sort().join(" & ") : null;
}

/** A drawn shape as a part. */
export function drawnPart(geo: Feature<Polygon>): ParcelRecord {
  return { geo, props: {}, source: "drawn", multiPart: false };
}

/** The parts' own land: their union, without any bridged strip. */
export function ownLand(parts: ParcelRecord[]): Feature<Polygon | MultiPolygon> | null {
  return parts.length === 1 ? parts[0]!.geo : union(featureCollection(parts.map((p) => p.geo)));
}

/** The parts' own land on one side of a cut, in acres. */
function ownAcresOnSide(
  own: Feature<Polygon | MultiPolygon> | null,
  a: LatLon,
  b: LatLon,
  keep: Side,
): number {
  if (!own) return 0;
  const kept = intersect(featureCollection([own, halfPlane(a, b, keep)]));
  return kept ? area(kept) / M2_PER_ACRE : 0;
}

/**
 * The split tool's preview: both pieces of the boundary cut by a→b, each with the acres keeping it gives
 * (the parts' own land on that side, as deriveParcel reports them; a bridged strip isn't counted).
 * `boundary` is the unsplit boundary and `own` the parts' own land (ownLand), both computed once per parcel
 * so dragging the line only cuts.
 */
export function splitPreview(
  boundary: Feature<Polygon>,
  own: Feature<Polygon | MultiPolygon> | null,
  a: LatLon,
  b: LatLon,
): SplitPieces {
  const P = splitPieces(boundary, a, b);
  return {
    ...P,
    leftAc: P.left ? ownAcresOnSide(own, a, b, -1) : 0,
    rightAc: P.right ? ownAcresOnSide(own, a, b, 1) : 0,
  };
}

export function deriveParcel(recipe: ParcelRecipe, limits: CombineLimits): DerivedParcel {
  const { parts } = recipe;
  if (!parts.length) return { ok: false, reason: "no parts", gapM: 0 };

  let base: ParcelRecord,
    acres: number,
    bridgeAcres = 0,
    gapM = 0;
  if (parts.length === 1) {
    // A drawn piece never supplies facts, even if it carries stray properties.
    base = parts[0]!.source === "drawn" ? { ...parts[0]!, props: {} } : parts[0]!;
    acres = parcelFacts(base.geo, base.props).acres;
  } else {
    const c = combineParcels(
      parts.map((p) => p.geo),
      limits,
    );
    if (!c.ok)
      return { ok: false, reason: c.reason === "fewer than two" ? "no parts" : c.reason, gapM: c.gapM };
    base = combinedRecord(parts, c);
    acres = c.acres;
    bridgeAcres = c.bridgeAcres;
    gapM = c.gapM;
  }
  if (!recipe.split) return { ok: true, record: base, acres, bridgeAcres, gapM, splitDropped: false };

  const { a, b, keep } = recipe.split;
  const P = splitPieces(base.geo, a, b);
  const piece = keep < 0 ? P.left : P.right,
    other = keep < 0 ? P.right : P.left;
  if (!piece || !other) return { ok: true, record: base, acres, bridgeAcres, gapM, splitDropped: true };

  const own = ownAcresOnSide(ownLand(parts), a, b, keep);
  const record: ParcelRecord = {
    geo: piece,
    props: { ...base.props, split_from: splitFromLabel(base.props), combined_acres: own },
    source: "split",
    multiPart: base.multiPart,
    ...(base.members ? { members: base.members } : {}),
  };
  return {
    ok: true,
    record,
    acres: own,
    bridgeAcres: Math.max(0, area(piece) / M2_PER_ACRE - own),
    gapM,
    splitDropped: false,
  };
}
