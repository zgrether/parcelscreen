/**
 * Map search (step 13f plan §4): what a typed query means. Pure, so it's tested without a map: coordinates
 * parsed locally, parcel numbers normalized so "52-47A", "52 47A" and "5247A" are the same query (owner,
 * 13f), and the SQL each county service is asked.
 */
import type { LatLon } from "../geo/types";

/**
 * Coordinates, if the whole query is a lat, lon pair that reads as coordinates: two numbers in range, each
 * with a decimal point or a sign. ("52 47" stays a parcel number, not a point in Siberia.)
 */
export function coordinatesIn(text: string): LatLon | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
  if (!m) return null;
  const [a, b] = [m[1]!, m[2]!];
  const looksLikeCoords = (s: string) => s.includes(".") || s.startsWith("-");
  if (!looksLikeCoords(a) || !looksLikeCoords(b)) return null;
  const lat = Number(a),
    lon = Number(b);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lat, lon] : null;
}

/** A parcel number with its separators gone, upper case: "52-47 a" → "5247A". */
export const normalizeId = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Parcel numbers are searched from this many characters (after normalizing). */
export const MIN_ID_CHARS = 3;

/**
 * The LIKE pattern that finds a normalized prefix whatever separators the county stores between its
 * characters: "5247A" → "5%2%4%7%A%". It over-matches ("55A2-1-Y-47A"), so results are filtered with
 * `matchesId`. Null below MIN_ID_CHARS.
 */
export function idPattern(query: string): string | null {
  const n = normalizeId(query);
  return n.length < MIN_ID_CHARS ? null : `${[...n].join("%")}%`;
}

/** Whether a stored parcel number starts with the query, separators ignored. */
export const matchesId = (stored: string, query: string): boolean =>
  normalizeId(stored).startsWith(normalizeId(query));

const sqlString = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * The where clause for one county of one service, or (null) the whole region, which the request's envelope bounds (UX
 * part 2 PR 4): its parcel number, and its second number where it has one.
 */
export function parcelNumberWhere(
  fields: { id: string; county: string; altId?: string },
  countyCode: string | null,
  pattern: string,
): string {
  const like = (field: string) => `UPPER(${field}) LIKE ${sqlString(pattern)}`;
  const ids = fields.altId ? `(${like(fields.id)} OR ${like(fields.altId)})` : like(fields.id);
  return countyCode === null ? ids : `${fields.county}=${sqlString(countyCode)} AND ${ids}`;
}

/** Saved parcels whose name contains the query, or whose name starts with it as a parcel number. */
export function matchesName(name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return name.toLowerCase().includes(q) || (normalizeId(query).length > 0 && matchesId(name, query));
}

/**
 * A Tennessee tax-card parcel number as typed (step 2): control map, then group, then parcel, e.g. "063D A 015.00",
 * "63D A 15", "040 037.01". The map is up to three digits and an optional letter (zero-padded as the county stores
 * it: "63D" is "063D"); the group a single letter, often absent; the parcel up to three digits with optional
 * decimals, matched as a prefix ("15" finds 015.00 and 015.01). Separators are spaces or dashes. Null when the
 * query isn't one.
 */
export interface TaxCardQuery {
  map: string;
  group: string | null;
  /** The stored PARCEL's start, e.g. "015" or "037.0". */
  parcel: string | null;
}

export function taxCardQuery(text: string): TaxCardQuery | null {
  const tokens = text
    .trim()
    .toUpperCase()
    .split(/[\s-]+/)
    .filter(Boolean);
  const map = /^(\d{1,3})([A-Z]?)$/.exec(tokens[0] ?? "");
  if (!map || tokens.length > 3) return null;
  let i = 1;
  const group = /^[A-Z]$/.test(tokens[i] ?? "") ? tokens[i++]! : null;
  const parcel = /^(\d{1,3})(\.\d{0,2})?$/.exec(tokens[i] ?? "");
  if (tokens[i] !== undefined && !parcel) return null;
  if (parcel) i++;
  if (i !== tokens.length) return null;
  return {
    map: map[1]!.padStart(3, "0") + map[2]!,
    group,
    parcel: parcel ? parcel[1]!.padStart(3, "0") + (parcel[2] ?? "") : null,
  };
}

/** A Tennessee service's tax card fields (the state's CMAP, GP and PARCEL; Hamilton County's MAP, GROUP_ and PARCEL). */
export interface TaxCardFields {
  map: string;
  group: string;
  parcel: string;
}

/**
 * The where clause for one county of a Tennessee service (or the region's, null): its map, and the group and parcel.
 * `countyField` is null for a county's own service, which holds only its county.
 */
export function taxCardWhere(
  countyField: string | null,
  county: string | null,
  q: TaxCardQuery,
  fields: TaxCardFields = { map: "CMAP", group: "GP", parcel: "PARCEL" },
): string {
  return [
    ...(county === null || countyField === null ? [] : [`${countyField}=${sqlString(county)}`]),
    `${fields.map}=${sqlString(q.map)}`,
    ...(q.group ? [`${fields.group}=${sqlString(q.group)}`] : []),
    ...(q.parcel ? [`${fields.parcel} LIKE ${sqlString(`${q.parcel}%`)}`] : []),
  ].join(" AND ");
}
