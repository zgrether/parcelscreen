/**
 * Trailheads from the Forest Service and the state parks, merged with OpenStreetMap's (follow-up 24, Batch A
 * A2b; docs/plans/batch-a.md §3, owner 2026-10-08).
 *
 * - USFS: its INFRA recreation sites of subtype TRAILHEAD (Elk Garden A.T., …).
 * - State parks: each state's park points (VA VGIN landmarks, NC DPR, TN TDEC), listed as the park.
 * - Tennessee's trails (step 2, owner 2026-10-17): TDEC's TREC compilation of the state's trails, each with its
 *   primary and secondary trailhead's coordinates. A TREC point names a trail, not a trailhead, so it's merged by
 *   distance alone (near.trecMergeM) and the trailhead lists the trails it serves (`serves`).
 * - OSM: highway=trailhead or information=trailhead (lib/screen/places.ts).
 *
 * Two points are one trailhead only when they're within near.trailheadDedupeM AND their names match after
 * normalisation (case, punctuation, the words "trailhead", "TH" and "parking" stripped); otherwise both are kept.
 * Of a matched pair the official point is kept: USFS, then the state's, then OSM's. TREC points are merged after:
 * those within near.trecMergeM of each other are one trailhead serving all their trails, and one within it of any
 * other trailhead joins that trailhead, whatever the names, which keeps its own.
 */
import { distance } from "@turf/turf";
import { CancelledError, type HttpClient } from "../http";
import { SCREEN_CONSTANTS } from "./config";
import type { Endpoints } from "./types";
import { stateWithinKm, type StateCode } from "./states";
import type { LatLon } from "./util";

const K = SCREEN_CONSTANTS.near;

export type TrailheadSource = "usfs" | "state" | "osm";

export interface TrailheadPoint {
  name: string;
  ll: LatLon;
  source: TrailheadSource;
  /** The TREC trails this trailhead serves (step 2), by name; absent when none. */
  serves?: string[];
  /** A TREC trail's trailhead, before merging: its name is the trail's. */
  trec?: true;
}

/**
 * Each state's official layer, by URL prefix (step 2: two can share an ArcGIS host): its kind, its name field and,
 * where the layer holds more than parks, the filter; what `unanswered` stores when it doesn't answer, and what the
 * report calls it then (follow-up 53).
 */
export interface StateSource {
  prefix: string;
  state: StateCode;
  kind: "parks" | "trails";
  name: string;
  where?: string;
  /** The `unanswered` token: "state parks (<host>)" for the parks, as before step 2. */
  token: string;
  label: string;
}

export const STATE_SOURCES: readonly StateSource[] = [
  {
    prefix: "https://vginmaps.vdem.virginia.gov/",
    state: "VA",
    kind: "parks",
    name: "LandmkName",
    where: "PlaceType='State Park Points'",
    token: "state parks (vginmaps.vdem.virginia.gov)",
    label: "VA state parks (VGIN)",
  },
  {
    prefix: "https://services6.arcgis.com/",
    state: "NC",
    kind: "parks",
    name: "FullName",
    token: "state parks (services6.arcgis.com)",
    label: "NC state parks (DPR)",
  },
  {
    prefix: "https://services5.arcgis.com/",
    state: "TN",
    kind: "parks",
    name: "PARK_NAME",
    token: "state parks (services5.arcgis.com)",
    label: "TN state parks (TDEC)",
  },
  // TDEC Recreation Resources' TREC trails (step 2): the Lines layer, whose trails carry their trailheads' coordinates.
  // The Points layer holds only 30 trails statewide, where the state has no lines (checked 2026-10-17).
  {
    prefix:
      "https://services1.arcgis.com/YuVBSS7Y1of2Qud1/arcgis/rest/services/Tennessee_Statewide_Trails_Lines_Public/",
    state: "TN",
    kind: "trails",
    name: "Trail_Name",
    token: "state trails (Tennessee_Statewide_Trails_Lines_Public)",
    label: "TN trails (TDEC)",
  },
];

/**
 * "serves: A, B": the TREC trails a trailhead serves (step 2, owner: shown under its name), or null when it serves none
 * but the one it's named after.
 */
export function servesLine(t: { name: string; serves?: readonly string[] | undefined }): string | null {
  const trails = t.serves ?? [];
  if (!trails.length || (trails.length === 1 && trails[0] === t.name)) return null;
  return `serves: ${trails.join(", ")}`;
}

const stateSource = (url: string): StateSource | undefined =>
  STATE_SOURCES.find((x) => url.startsWith(x.prefix));

const USFS = "USFS recreation sites";
const STATE_PREFIX = "state parks (";

/**
 * An official trailhead list that didn't answer, as `unanswered` (a result's `noResponse`) names it, in the report's
 * words: "VA state parks (VGIN)" for "state parks (vginmaps.vdem.virginia.gov)". Null for what isn't a trailhead list.
 */
export function trailheadSourceLabel(unanswered: string): string | null {
  if (unanswered === USFS) return USFS;
  const known = STATE_SOURCES.find((x) => x.token === unanswered);
  if (known) return known.label;
  if (!unanswered.startsWith(STATE_PREFIX) || !unanswered.endsWith(")")) return null;
  return unanswered;
}

/**
 * Name in title case when a source shouts it (USFS: "ELK GARDEN A.T."), else as given. "AT" keeps its capitals:
 * in a shouted trailhead name it's the Appalachian Trail (USFS: "BEECH MOUNTAIN AT"), not "at".
 */
export function readableName(s: string): string {
  const t = s.trim();
  if (t !== t.toUpperCase() || !/[A-Z]{3}/.test(t)) return t;
  return t
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\bAt\b/g, "AT");
}

/** The dedupe form of a name: lower case, punctuation out, "trailhead"/"th"/"parking" dropped. */
export function normalizeTrailheadName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter((w) => w && w !== "trailhead" && w !== "th" && w !== "parking")
    .join(" ");
}

const RANK: Record<TrailheadSource, number> = { usfs: 0, state: 1, osm: 2 };

const metres = (a: LatLon, b: LatLon): number => distance([a[1], a[0]], [b[1], b[0]], { units: "meters" });

/**
 * Merges the sources: official points first; a point is dropped only if a kept one is near AND same-named. Then the
 * TREC trails' trailheads (step 2): collapsed into one wherever they're within near.trecMergeM of each other, serving
 * all their trails (named after the first trail alphabetically); each joins the nearest kept trailhead within
 * near.trecMergeM, adding its trails to what that one serves and keeping that one's name; the rest are trailheads.
 */
export function mergeTrailheads(points: readonly TrailheadPoint[]): TrailheadPoint[] {
  const kept: TrailheadPoint[] = [];
  for (const p of points.filter((x) => !x.trec).sort((a, b) => RANK[a.source] - RANK[b.source])) {
    const n = normalizeTrailheadName(p.name);
    const dup = kept.some(
      (k) => normalizeTrailheadName(k.name) === n && metres(k.ll, p.ll) <= K.trailheadDedupeM,
    );
    if (!dup) kept.push(p);
  }
  for (const c of trecClusters(points.filter((x) => x.trec))) {
    let near = -1;
    let best = Infinity;
    kept.forEach((k, i) => {
      const m = metres(k.ll, c.ll);
      if (m <= K.trecMergeM && m < best) [near, best] = [i, m];
    });
    if (near >= 0) {
      const k = kept[near]!;
      kept[near] = { ...k, serves: uniqueSorted([...(k.serves ?? []), ...c.serves]) };
    } else kept.push({ name: c.serves[0]!, ll: c.ll, source: "state", serves: c.serves });
  }
  return kept;
}

const uniqueSorted = (names: readonly string[]): string[] =>
  [...new Set(names)].sort((a, b) => a.localeCompare(b));

/**
 * TREC trailheads within near.trecMergeM of each other, one point per lot (single linkage: a chain of close points is
 * one lot), at its first point's place, serving every trail in it.
 */
function trecClusters(points: readonly TrailheadPoint[]): { ll: LatLon; serves: string[] }[] {
  const parent = points.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i]!)));
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++)
      if (metres(points[i]!.ll, points[j]!.ll) <= K.trecMergeM) parent[root(j)] = root(i);
  const lots = new Map<number, TrailheadPoint[]>();
  points.forEach((p, i) => lots.set(root(i), [...(lots.get(root(i)) ?? []), p]));
  return [...lots.values()].map((ps) => ({ ll: ps[0]!.ll, serves: uniqueSorted(ps.map((p) => p.name)) }));
}

interface ArcPoint {
  attributes: Record<string, unknown>;
  geometry?: { x: number; y: number };
}

/** Points of one ArcGIS layer within `km` of the centre. */
async function pointsNear(
  url: string,
  centre: LatLon,
  km: number,
  fields: { name: string; where?: string },
  deps: { http: HttpClient; signal?: AbortSignal },
): Promise<{ name: string; ll: LatLon }[]> {
  const q = new URLSearchParams({
    geometry: `${centre[1]},${centre[0]}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    distance: String(km * 1000),
    units: "esriSRUnit_Meter",
    where: fields.where ?? "1=1",
    outFields: fields.name,
    returnGeometry: "true",
    outSR: "4326",
    f: "json",
  });
  const r = await deps.http.fetch(`${url}/query`, {
    method: "POST",
    body: q,
    timeoutMs: K.officialTimeoutMs,
    ...(deps.signal ? { signal: deps.signal } : {}),
  });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  const j = (await r.json()) as { features?: ArcPoint[]; error?: { message?: string } };
  if (j.error) throw new Error(`${new URL(url).host}: ${j.error.message ?? "error"}`);
  return (j.features ?? [])
    .filter((f) => f.geometry && typeof f.attributes[fields.name] === "string")
    .map((f) => ({
      name: readableName(String(f.attributes[fields.name])),
      ll: [f.geometry!.y, f.geometry!.x] as LatLon,
    }));
}

interface TrecPage {
  features?: { attributes: Record<string, unknown> }[];
  exceededTransferLimit?: boolean;
  error?: { message?: string };
}

const TREC_FIELDS = [
  "OBJECTID",
  "Trail_Name",
  "PrimaryTrailhead_Latitude",
  "PrimaryTrailhead_Longitude",
  "SecondaryTrailhead_Latitude",
  "SecondaryTrailhead_Longitude",
].join(",");

/**
 * Tennessee's TREC trails (step 2, owner 2026-10-17): the trails in an envelope of `km` around the centre, asked for
 * their names and trailhead coordinates only (never their lines), paged; each trail's primary and secondary trailheads
 * within `km` of the centre, 0,0 dropped. A trail's line may pass near while its trailheads are far: only the
 * trailheads count.
 */
async function trecTrailheadsNear(
  url: string,
  centre: LatLon,
  km: number,
  deps: { http: HttpClient; signal?: AbortSignal },
): Promise<TrailheadPoint[]> {
  const dLat = km / 111.32,
    dLon = km / (111.32 * Math.cos((centre[0] * Math.PI) / 180));
  const envelope = JSON.stringify({
    xmin: centre[1] - dLon,
    ymin: centre[0] - dLat,
    xmax: centre[1] + dLon,
    ymax: centre[0] + dLat,
    spatialReference: { wkid: 4326 },
  });
  const out: TrailheadPoint[] = [];
  for (let page = 0; page < K.trecMaxPages; page++) {
    const q = new URLSearchParams({
      geometry: envelope,
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: TREC_FIELDS,
      returnGeometry: "false",
      orderByFields: "OBJECTID",
      resultOffset: String(page * K.trecPageSize),
      resultRecordCount: String(K.trecPageSize),
      f: "json",
    });
    const r = await deps.http.fetch(`${url}/query`, {
      method: "POST",
      body: q,
      timeoutMs: K.officialTimeoutMs,
      ...(deps.signal ? { signal: deps.signal } : {}),
    });
    if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
    const j = (await r.json()) as TrecPage;
    if (j.error) throw new Error(`${new URL(url).host}: ${j.error.message ?? "error"}`);
    for (const { attributes: a } of j.features ?? []) {
      const name = typeof a.Trail_Name === "string" ? readableName(a.Trail_Name) : "";
      if (!name) continue;
      const heads: [unknown, unknown][] = [
        [a.PrimaryTrailhead_Latitude, a.PrimaryTrailhead_Longitude],
        [a.SecondaryTrailhead_Latitude, a.SecondaryTrailhead_Longitude],
      ];
      for (const [lat, lon] of heads) {
        if (lat == null || lon == null) continue;
        const ll: LatLon = [Number(lat), Number(lon)];
        if (!Number.isFinite(ll[0]) || !Number.isFinite(ll[1]) || (ll[0] === 0 && ll[1] === 0)) continue;
        if (metres(centre, ll) > km * 1000) continue;
        out.push({ name, ll, source: "state", trec: true });
      }
    }
    if (!j.exceededTransferLimit) break;
  }
  return out;
}

/**
 * The official trailheads within near.trailheadKm: USFS's, and the parks of each state that comes that close (follow-up
 * 53, #122 review: a state out of reach isn't asked, so it can't go unanswered). A source that fails is left out
 * (OpenStreetMap still answers, and the count says what was found), and named in `unanswered` (v4; phase-0.md §9.20
 * (c)); a cancel still cancels.
 */
export async function officialTrailheads(
  centre: LatLon,
  deps: { http: HttpClient; endpoints: Endpoints; signal?: AbortSignal },
  unanswered: string[] = [],
): Promise<TrailheadPoint[]> {
  const names = [USFS];
  const asked: Promise<TrailheadPoint[]>[] = [
    pointsNear(
      deps.endpoints.usfsRecSites,
      centre,
      K.trailheadKm,
      { name: "site_name", where: "site_subtype='TRAILHEAD'" },
      deps,
    ).then((ps) => ps.map((p) => ({ ...p, source: "usfs" as const }))),
    ...deps.endpoints.stateParks.flatMap((url) => {
      const src = stateSource(url);
      // An unknown layer, or a state out of reach: not asked, so never unanswered.
      if (!src || !stateWithinKm(src.state, centre, K.trailheadKm + K.stateOutlineMarginKm)) return [];
      names.push(src.token);
      if (src.kind === "trails") return [trecTrailheadsNear(url, centre, K.trailheadKm, deps)];
      return [
        pointsNear(url, centre, K.trailheadKm, src, deps).then((ps) =>
          ps.map((p) => ({ ...p, source: "state" as const })),
        ),
      ];
    }),
  ];
  const settled = await Promise.allSettled(asked);
  const cancelled = settled.find((s) => s.status === "rejected" && s.reason instanceof CancelledError);
  if (cancelled) throw (cancelled as PromiseRejectedResult).reason;
  settled.forEach((s, i) => {
    if (s.status === "rejected") unanswered.push(names[i]!);
  });
  return settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
}
