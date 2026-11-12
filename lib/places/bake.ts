/**
 * The places bake (roadmap step 14d, docs/plans/step-14d-places.md §2, §7): every grocery, trailhead and trailhead
 * parking lot in VA, NC and TN plus 60 km, from the sources a grade asked live before (places.ts, trailheads.ts,
 * trailheadParking.ts), written as 1° cells (lib/screen/placeData.ts).
 * - OpenStreetMap through Overpass: one query per cell (supermarkets, trailheads), then the parking within
 *   drive.parkingWithinM of every trailhead, a batch of points per query.
 * - USFS INFRA trailheads, the three states' park points and TDEC's TREC trails: each layer once over the area, paged.
 * A source that doesn't answer keeps the previous bake's places, dated as fetched then; with no previous bake, the bake
 * fails. Run by `pnpm data:places` (test/tools/places-bake.test.ts) from the places workflow and the monthly refresh.
 */
import { point, pointToLineDistance, pointToPolygonDistance } from "@turf/turf";
import type { LineString, MultiLineString, MultiPolygon, Polygon } from "geojson";
import type { HttpClient } from "../http";
import { DEFAULT_ENDPOINTS, SCREEN_CONSTANTS } from "../screen/config";
import {
  FOLDER_OF,
  PLACE_FOLDERS,
  PLACES_VERSION,
  cellOf,
  type BakedLaunch,
  type BakedParking,
  type BakedTrailhead,
  type Grocer,
  type Place,
  type PlaceCell,
  type PlaceSource,
  type PlacesIndex,
} from "../screen/placeData";
import { kmToState, outlineOf, type StateCode } from "../screen/states";
import { hikingTagged, parkingQuery } from "../screen/trailheadParking";
import { STATE_SOURCES, readableName } from "../screen/trailheads";
import type { LatLon } from "../screen/util";
import cragsJson from "../screen/data/crags.json";
import { cragPlace, lastChecked, parseCrags } from "./crags";
import { flatwaterByName } from "./flatwater";
import { RIDB_EXPORT, RIDB_LAUNCHES } from "./ridb";
import { trailheadOverrides } from "./trailheadOverrides";

/** The baked area: within this of VA, NC or TN (the brief: "plus 60 km"). */
export const MARGIN_KM = 60;
const STATES: readonly StateCode[] = ["VA", "NC", "TN"];
/** Trailheads per parking query: each is one `around` clause. */
const PARKING_BATCH = 150;
const PAGE = 1000;
const MAX_PAGES = 50;

export interface BakeDeps {
  http: HttpClient;
  /** Overpass mirrors, tried in order for each query. */
  overpass?: readonly string[];
  /** YYYY-MM-DD. */
  today: string;
  /** The previous bake, for a source that doesn't answer. */
  previous?: { index: PlacesIndex; places: Place[] };
  log?: (line: string) => void;
  /** Waits between retries (tests pass a no-op). */
  sleep?: (ms: number) => Promise<void>;
  /** The clock for the classification's time budget, in ms (Date.now; tests pass their own). */
  now?: () => number;
}

export interface Bake {
  index: PlacesIndex;
  cells: PlaceCell[];
  /** What kept the previous bake's places this time, as the refresh summary says it: "usfs", "osm towns", … */
  kept: string[];
  /** The trail lots baked as trailheads (existing-house plan §2), for the bake's report; empty when OSM kept last bake's. */
  trailLots: BakedTrailhead[];
  /** Each quarter's trail lots this bake, for the report (Zach, 11/12): found, the shipped baseline, kept after merging. */
  trailLotCells: TrailLotCell[];
}

/** One quarter's trail-lot pass. */
export interface TrailLotCell {
  cell: string;
  /** Found by this bake's query, or null when it failed after its retries. */
  found: number | null;
  /** The shipped lots in the quarter (the previous bake's). */
  baseline: number;
  /** This bake's and the shipped, one per OSM id. */
  merged: number;
  /** Asked again after a failure. */
  retried: boolean;
}

/**
 * The trail lots a bake should keep at least (Zach, 11/12): bake 2's, the most a whole-cell query ever answered (1,140
 * found, 594 kept after merging with the other trailheads), or the shipped baseline if that's larger.
 */
export const TRAIL_LOT_BAR = { found: 1_140, kept: 594 } as const;

/** The pause between one quarter's trail-lot query and the next: one request at a time, politely (Zach, 11/12). */
const TRAIL_LOT_GAP_MS = 2_000;

const round6 = ([lat, lon]: LatLon): LatLon => [+lat.toFixed(6), +lon.toFixed(6)];

/** Within MARGIN_KM of one of the three states (inside one counts). */
export function inArea(ll: LatLon): boolean {
  return STATES.some((s) => kmToState(s, ll) <= MARGIN_KM);
}

let AREA_CELLS: string[] | null = null;

/** The states' outline points, every DENSE_KM or closer along each edge: for a quick nearest-point test per cell. */
const DENSE_KM = 5;

function densePoints(): LatLon[] {
  const out: LatLon[] = [];
  for (const s of STATES)
    for (const ring of outlineOf(s).coordinates)
      for (let i = 1; i < ring.length; i++) {
        const [x0, y0] = ring[i - 1] as [number, number];
        const [x1, y1] = ring[i] as [number, number];
        const steps = Math.max(1, Math.ceil(Math.hypot((x1 - x0) * 89, (y1 - y0) * 111) / DENSE_KM));
        for (let k = 0; k < steps; k++)
          out.push([y0 + ((y1 - y0) * k) / steps, x0 + ((x1 - x0) * k) / steps]);
      }
  return out;
}

/**
 * The cells the bake covers, "34_-84" …, south to north and west to east: each cell with a state's outline within
 * MARGIN_KM (plus the outline points' spacing, so none is missed), or a state around its centre. A superset of the
 * area: `inArea` decides each place.
 */
export function areaCells(): string[] {
  if (AREA_CELLS) return AREA_CELLS;
  const pts = densePoints();
  const reach = MARGIN_KM + DENSE_KM;
  const out: string[] = [];
  for (let lat = 33; lat <= 40; lat++)
    for (let lon = -92; lon <= -75; lon++) {
      const kmPerLon = 111.32 * Math.cos(((lat + 0.5) * Math.PI) / 180);
      const near = pts.some(([y, x]) => {
        const dy = (y < lat ? lat - y : y > lat + 1 ? y - lat - 1 : 0) * 111.32;
        const dx = (x < lon ? lon - x : x > lon + 1 ? x - lon - 1 : 0) * kmPerLon;
        return Math.hypot(dx, dy) <= reach;
      });
      if (near || STATES.some((s) => kmToState(s, [lat + 0.5, lon + 0.5]) <= 0)) out.push(`${lat}_${lon}`);
    }
  return (AREA_CELLS = out);
}

/** A 1° cell's box (west, south, east, north); a quarter's ("36_-82/ne") is its half-degree corner. */
const cellBox = (cell: string): [number, number, number, number] => {
  const [whole, q] = cell.split("/") as [string, string | undefined];
  const [lat, lon] = whole.split("_").map(Number) as [number, number];
  if (!q) return [lon, lat, lon + 1, lat + 1];
  const s = lat + (q[0] === "n" ? 0.5 : 0);
  const w = lon + (q[1] === "e" ? 0.5 : 0);
  return [w, s, w + 0.5, s + 0.5];
};

/** A cell's four quarters, for the trail-lot query: a whole cell's answer came back uneven (Zach, 11/12). */
export const QUARTERS = ["sw", "se", "nw", "ne"] as const;
export const quartersOf = (cell: string): string[] => QUARTERS.map((q) => `${cell}/${q}`);

/** Whether a place is in a cell's or a quarter's box (west and south edges in, east and north out). */
export function inBox(cell: string, [lat, lon]: LatLon): boolean {
  const [w, s, e, n] = cellBox(cell);
  return lon >= w && lon < e && lat >= s && lat < n;
}

// ---------- OpenStreetMap ----------

export interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
  /** A relation's members (`out body`). */
  members?: { type: string; ref: number; role?: string }[];
  /** A way's points (`out geom`); a point outside the query's bbox comes back null. */
  geometry?: ({ lat: number; lon: number } | null)[];
}

/** One Overpass query, each mirror in turn (POST, as the area profiler sends it). */
export async function overpass(ql: string, deps: Pick<BakeDeps, "http" | "overpass">): Promise<OsmElement[]> {
  const errs: string[] = [];
  for (const m of deps.overpass ?? DEFAULT_ENDPOINTS.overpass) {
    try {
      const r = await deps.http.fetch(m, {
        method: "POST",
        body: new URLSearchParams({ data: ql }),
        timeoutMs: 200_000,
      });
      if (!r.ok) throw new Error(`${new URL(m).host} ${r.status}`);
      const j = (await r.json()) as { elements?: OsmElement[]; remark?: string };
      // A query past its time or memory comes back 200 with what it found so far and a remark (a runtime error, a
      // timeout): not an answer, whatever the remark says (Zach, 11/12).
      if (j.remark) throw new Error(`${new URL(m).host}: ${j.remark}`);
      return j.elements ?? [];
    } catch (e) {
      errs.push(String(e));
    }
  }
  throw new Error(`Overpass unreachable (${errs.join("; ")})`);
}

/** The waits before each retry of a cell's Overpass query when no mirror answered (both 502/504 at once, 11/11). */
const OVERPASS_RETRY_MS = [30_000, 90_000];

/** `overpass`, every mirror again after each of OVERPASS_RETRY_MS. */
async function overpassRetried(
  ql: string,
  deps: Pick<BakeDeps, "http" | "overpass" | "sleep" | "log">,
  what: string,
  onRetry?: () => void,
): Promise<OsmElement[]> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      return await overpass(ql, deps);
    } catch (e) {
      if (attempt >= OVERPASS_RETRY_MS.length) throw e;
      onRetry?.();
      deps.log?.(`${what}: ${String(e)}; again in ${OVERPASS_RETRY_MS[attempt]! / 1000} s`);
      await sleep(OVERPASS_RETRY_MS[attempt]!);
    }
  }
}

export const at = (e: OsmElement): LatLon | null =>
  e.center ? [e.center.lat, e.center.lon] : e.lat != null && e.lon != null ? [e.lat, e.lon] : null;

/**
 * One cell's supermarkets and trailheads (as the near step read them from Photon, places.ts), and its paddle launches
 * (step 14d plan §2.4) with the canoe routes they're on (`out body`: a route's members, not its geometry).
 */
export function osmCellQuery(cell: string): string {
  const [w, s, e, n] = cellBox(cell);
  return (
    `[out:json][timeout:180][bbox:${s},${w},${n},${e}];` +
    `(nwr["shop"="supermarket"];nwr["highway"="trailhead"];nwr["information"="trailhead"];)->.p;` +
    `(nwr["leisure"="slipway"];nwr["canoe"~"^(put_in|egress|put_in;egress)$"];` +
    `nwr["whitewater"~"^(put_in|egress|put_in;egress)$"];nwr["waterway"="access_point"];)->.l;` +
    `(.p;.l;);out center tags;rel(bn.l)["route"="canoe"];out body;`
  );
}

/**
 * The parking lots by a trail in a cell or a quarter of one (existing-house plan §2): lots within near.trailLotM of a hiking or foot route's
 * paths, footways, tracks, bridleways or service roads (never its public roads), or of a named path or footway an
 * agency runs; then the
 * trails near those lots with their points, and the routes they're on (`out body`: their members), to name each lot.
 */
export function trailLotQuery(cell: string): string {
  const [w, s, e, n] = cellBox(cell);
  const M = SCREEN_CONSTANTS.near.trailLotM;
  // The routes' members are asked for whatever their highway: filtered in Overpass, the Brumley Mountain Trail's
  // members came back empty (probe round 3, 11/11). trailLots keeps only the lots near a path, footway, track,
  // bridleway or service road (never a public road), measured to each line here.
  return (
    `[out:json][timeout:180][bbox:${s},${w},${n},${e}];` +
    `rel["route"~"^(hiking|foot)$"]->.hr;` +
    `way(r.hr)["highway"]->.rw;` +
    `way["highway"~"^(path|footway)$"]["name"]["operator"~"forest|park|conservation|wildlife",i]->.aw;` +
    `(.rw;.aw;)->.tw;` +
    `nwr["amenity"="parking"](around.tw:${M})->.p;.p out center tags;` +
    `way.tw(around.p:${M})->.near;.near out tags geom;` +
    `rel(bw.near)["route"~"^(hiking|foot)$"];out body;`
  );
}

/**
 * The ways a lot is measured to: a route's paths, footways, tracks and bridleways, and the service roads it follows
 * (a gated forest road up to the footpath, as the Brumley Mountain Trail's at Hayters Gap; Zach, 11/11). Never a public
 * through road (residential up to trunk), even one a hiking route follows.
 */
const TRAIL_HIGHWAY = /^(path|footway|track|bridleway|service)$/;

/** Lots a trailhead can't be: no public access. */
const PRIVATE_LOT = /^(private|customers|permit|no)$/;

/** A trail lot, before merging: its own name when it had one (kept first when two are one). */
export interface TrailLot extends BakedTrailhead {
  ownName: boolean;
}

const metres = (a: LatLon, b: LatLon): number => {
  const R = 6_371_000,
    rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad,
    dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** The nearest point of a polyline to a place, metres (each segment, in a local flat frame). */
function toLine(ll: LatLon, line: readonly LatLon[]): number {
  const k = Math.cos((ll[0] * Math.PI) / 180);
  const xy = ([la, lo]: LatLon): [number, number] => [(lo - ll[1]) * k * 111_320, (la - ll[0]) * 111_320];
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, ay] = xy(line[i]!),
      [bx, by] = xy(line[i + 1]!);
    const dx = bx - ax,
      dy = by - ay;
    const t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return line.length === 1 ? metres(ll, line[0]!) : best;
}

/**
 * trailLotQuery's answer as trailheads (existing-house plan §2): each public lot named for itself, else for the nearest
 * trail's route ("Brumley Mountain Trail (parking)"), else the trail's own name.
 */
export function trailLots(elements: readonly OsmElement[]): TrailLot[] {
  const ways = elements.filter(
    (e) => e.type === "way" && e.geometry && TRAIL_HIGHWAY.test(e.tags?.highway ?? ""),
  );
  const M = SCREEN_CONSTANTS.near.trailLotM;
  const routeOf = new Map<number, string>();
  for (const r of elements)
    if (r.type === "relation" && r.tags?.name)
      for (const m of r.members ?? [])
        if (m.type === "way" && !routeOf.has(m.ref)) routeOf.set(m.ref, r.tags.name);
  const out: TrailLot[] = [];
  for (const e of elements) {
    const t = e.tags ?? {};
    if (t.amenity !== "parking" || PRIVATE_LOT.test(t.access ?? "")) continue;
    const ll = at(e);
    if (!ll || !inArea(ll)) continue;
    const near = ways
      .map((w) => ({
        w,
        m: toLine(
          ll,
          w.geometry!.flatMap((g): LatLon[] => (g ? [[g.lat, g.lon]] : [])),
        ),
      }))
      .sort((a, b) => a.m - b.m)[0];
    // Near a road the route follows, not its trail: not a trailhead.
    if (!near || near.m > M) continue;
    const trail = routeOf.get(near.w.id) ?? near.w.tags?.name;
    const own = !!t.name?.trim();
    out.push({
      kind: "trailhead",
      id: `osm:${e.type}/${e.id}`,
      name: own ? t.name!.trim() : trail ? `${trail} (parking)` : "Trailhead (parking)",
      ll: round6(ll),
      src: "osm",
      ownName: own,
    });
  }
  return out;
}

/**
 * The trail lots kept (existing-house plan §2): one within near.trailLotMergeM of any other trailhead is that trailhead;
 * lots within it of each other are one, a lot with its own name kept first, else the first found. By distance alone:
 * "Brumley Mountain Trail (parking)" and "Brumley Mountain Trailhead" don't share a name.
 */
export function mergeTrailLots(
  lots: readonly TrailLot[],
  others: readonly { ll: LatLon }[],
): BakedTrailhead[] {
  const M = SCREEN_CONSTANTS.near.trailLotMergeM;
  const kept: BakedTrailhead[] = [];
  for (const l of [...lots].sort((a, b) => Number(b.ownName) - Number(a.ownName))) {
    if (others.some((o) => metres(o.ll, l.ll) <= M) || kept.some((k) => metres(k.ll, l.ll) <= M)) continue;
    const { ownName: _o, ...place } = l;
    kept.push(place);
  }
  return kept;
}

/** Overpass's answer for a cell as places: supermarkets as grocers (named "Supermarket" when unnamed), trailheads. */
export function osmPlaces(elements: readonly OsmElement[]): (Grocer | BakedTrailhead)[] {
  const out: (Grocer | BakedTrailhead)[] = [];
  for (const e of elements) {
    if (e.type === "relation") continue; // the canoe routes (osmLaunches)
    const ll = at(e);
    if (!ll || !inArea(ll)) continue;
    const id = `osm:${e.type}/${e.id}`;
    const t = e.tags ?? {};
    if (t.shop === "supermarket") {
      const name = t.name || "Supermarket";
      out.push({
        kind: "grocer",
        id,
        name,
        ll: round6(ll),
        src: "osm",
        big: SCREEN_CONSTANTS.near.bigGrocer.test(name),
      });
    } else if (t.highway === "trailhead" || t.information === "trailhead")
      out.push({ kind: "trailhead", id, name: t.name || "Trailhead", ll: round6(ll), src: "osm" });
  }
  return out;
}

/** A launch before its water is known (classifyLaunches). */
export interface RawLaunch {
  id: string;
  ll: LatLon;
  src: "osm" | "usfs";
  name?: string;
  /** Tagged whitewater=*: a river launch whatever water it's near. */
  whitewater?: true;
  trail?: string;
}

const PUT_IN = /^(put_in|egress|put_in;egress)$/;

/**
 * A cell's paddle launches from Overpass's answer (step 14d plan §2.4): slipways, canoe and whitewater put-ins and
 * egresses, and waterway access points; not a slipway tagged canoe=no, nor anything private. A launch on a canoe route
 * takes the route's name as its paddle trail.
 */
export function osmLaunches(elements: readonly OsmElement[]): RawLaunch[] {
  const trailOf = new Map<string, string>();
  for (const r of elements)
    if (r.type === "relation" && r.tags?.route === "canoe" && r.tags.name)
      for (const m of r.members ?? []) if (m.type === "node") trailOf.set(`node/${m.ref}`, r.tags.name);
  const out: RawLaunch[] = [];
  for (const e of elements) {
    if (e.type === "relation" && e.tags?.route === "canoe") continue;
    const t = e.tags ?? {};
    const launch =
      t.leisure === "slipway" ||
      PUT_IN.test(t.canoe ?? "") ||
      PUT_IN.test(t.whitewater ?? "") ||
      t.waterway === "access_point";
    if (!launch || t.canoe === "no" || t.access === "private" || t.access === "no") continue;
    const ll = at(e);
    if (!ll || !inArea(ll)) continue;
    const trail = trailOf.get(`${e.type}/${e.id}`);
    out.push({
      id: `osm:${e.type}/${e.id}`,
      ll: round6(ll),
      src: "osm",
      ...(t.name ? { name: t.name } : {}),
      ...(PUT_IN.test(t.whitewater ?? "") ? { whitewater: true as const } : {}),
      ...(trail ? { trail } : {}),
    });
  }
  return out;
}

// ---------- NHD: flatwater or river ----------

interface NhdFeature {
  type: "Feature";
  properties: Record<string, unknown> | null;
  geometry: Polygon | MultiPolygon | LineString | MultiLineString | null;
}

/** NHD features within `distanceM` of any of the points: one query, GeoJSON out. */
async function nhdNear(
  url: string,
  points: readonly LatLon[],
  distanceM: number,
  outFields: string,
  deps: BakeDeps,
): Promise<NhdFeature[]> {
  const q = new URLSearchParams({
    geometry: JSON.stringify({
      points: points.map(([lat, lon]) => [lon, lat]),
      spatialReference: { wkid: 4326 },
    }),
    geometryType: "esriGeometryMultipoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    distance: String(distanceM),
    units: "esriSRUnit_Meter",
    outFields,
    returnGeometry: "true",
    outSR: "4326",
    maxAllowableOffset: "0.0001",
    geometryPrecision: "6",
    f: "geojson",
  });
  const r = await deps.http.fetch(`${url}/query`, { method: "POST", body: q, timeoutMs: 180_000 });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  const j = (await r.json()) as { features?: NhdFeature[]; error?: { message?: string } };
  if (j.error) throw new Error(`${new URL(url).host}: ${j.error.message ?? "error"}`);
  return j.features ?? [];
}

const ACRES_PER_KM2 = 247.105;
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/**
 * Each launch on its water (step 14d plan §2.4): flatwater when within paddling.flatwaterWithinM of an NHD lake, pond
 * or reservoir (FTYPE 390, 436) of at least paddling.flatwaterMinAc, the nearest such; else a river, named by the
 * nearest named flowline within paddling.riverWithinM; still flatwater when its name or a known pool says so
 * (flatwaterByName, #350), unless it's below a dam (tailwaterOf). Whitewater put-ins are rivers whatever they're near. Named
 * "<water> access" when unnamed, else "Boat launch". Pure: the NHD features are given.
 */
export function classifyLaunches(
  launches: readonly RawLaunch[],
  waterbodies: readonly NhdFeature[],
  flowlines: readonly NhdFeature[],
): BakedLaunch[] {
  const P = SCREEN_CONSTANTS.paddling;
  const lakes = waterbodies.flatMap((f) => {
    const p = f.properties ?? {};
    const ftype = Number(p.FTYPE ?? p.ftype);
    const ac = Number(p.AREASQKM ?? p.areasqkm) * ACRES_PER_KM2;
    if (!f.geometry || (f.geometry.type !== "Polygon" && f.geometry.type !== "MultiPolygon")) return [];
    if (!(SCREEN_CONSTANTS.streams.ponds as readonly number[]).includes(ftype) || !(ac >= P.flatwaterMinAc))
      return [];
    return [{ geo: f.geometry, name: str(p.GNIS_NAME ?? p.gnis_name), ac }];
  });
  const rivers = flowlines.flatMap((f) => {
    const name = str(f.properties?.GNIS_NAME ?? f.properties?.gnis_name);
    if (!name || !f.geometry || (f.geometry.type !== "LineString" && f.geometry.type !== "MultiLineString"))
      return [];
    return [{ geo: f.geometry, name }];
  });
  return launches.map((l) => {
    const pt = point([l.ll[1], l.ll[0]]);
    let lake: (typeof lakes)[number] | undefined;
    let lakeM = Infinity;
    if (!l.whitewater)
      for (const k of lakes) {
        const m = Math.max(0, pointToPolygonDistance(pt, k.geo, { units: "meters" }));
        if (m <= P.flatwaterWithinM && m < lakeM) [lake, lakeM] = [k, m];
      }
    // NHD's lakes stop short of some dam pools; the launch's own name or a known pool still says flatwater (#350).
    const still = lake ? null : flatwaterByName(l);
    let river: string | undefined;
    if (!lake && !still) {
      let best = Infinity;
      for (const r of rivers) {
        const m = pointToLineDistance(pt, r.geo.type === "LineString" ? r.geo : lineOfMulti(r.geo), {
          units: "meters",
        });
        if (m <= P.riverWithinM && m < best) [river, best] = [r.name, m];
      }
    }
    const waterName = lake ? lake.name : still ? still.waterName : river;
    const name = l.name ?? (waterName ? `${waterName} access` : "Boat launch");
    return {
      kind: "launch" as const,
      id: l.id,
      name,
      ll: l.ll,
      src: l.src,
      water: lake || still ? ("flat" as const) : ("river" as const),
      ...(waterName ? { waterName } : {}),
      ...(lake ? { waterAc: Math.round(lake.ac) } : {}),
      ...(l.trail ? { trail: l.trail } : {}),
    };
  });
}

/** A multi-line's parts as one line, for the distance to it (its nearest part is all that matters). */
function lineOfMulti(g: MultiLineString): LineString {
  return { type: "LineString", coordinates: g.coordinates.flat() };
}

/** Launches per pair of NHD queries: a whole cell's buffers at once timed NHD out (a 504, 10/25). */
const NHD_BATCH = 25;
/** The waits before each retry of an NHD query that failed (a 5xx or a timeout). */
const NHD_RETRY_MS = [15_000, 45_000, 90_000];
/**
 * The classification's whole time: past it, every batch left keeps the previous bake's launches. The second bake took
 * 5 h 46 min of a runner's 6 h, nearly all of it NHD's 504s retried (10/26); the monthly refresh also profiles the areas.
 */
const NHD_BUDGET_MS = 90 * 60_000;

/** `nhdNear`, retried on a failure after each of NHD_RETRY_MS. */
async function nhdNearRetried(...args: Parameters<typeof nhdNear>): Promise<NhdFeature[]> {
  const deps = args[4];
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      return await nhdNear(...args);
    } catch (e) {
      if (attempt >= NHD_RETRY_MS.length) throw e;
      deps.log?.(`launches: ${String(e)}; again in ${NHD_RETRY_MS[attempt]! / 1000} s`);
      await sleep(NHD_RETRY_MS[attempt]!);
    }
  }
}

/**
 * Every launch classified, NHD_BATCH launches per pair of NHD queries. A batch NHD won't answer keeps the previous
 * bake's launches of the same ids, and is otherwise left out until the next bake; the cells it was in are returned.
 */
async function classifyAll(
  raw: readonly RawLaunch[],
  deps: BakeDeps,
): Promise<{ launches: BakedLaunch[]; unanswered: string[] }> {
  const P = SCREEN_CONSTANTS.paddling;
  const byCell = new Map<string, RawLaunch[]>();
  for (const l of raw) byCell.set(cellOf(l.ll), [...(byCell.get(cellOf(l.ll)) ?? []), l]);
  const before = new Map(
    (deps.previous?.places ?? []).flatMap((p) => (p.kind === "launch" ? [[p.id, p] as const] : [])),
  );
  const launches: BakedLaunch[] = [];
  const unanswered = new Set<string>();
  const now = deps.now ?? Date.now;
  const deadline = now() + NHD_BUDGET_MS;
  let n = 0;
  for (const [cell, inCell] of byCell) {
    for (let i = 0; i < inCell.length; i += NHD_BATCH) {
      const batch = inCell.slice(i, i + NHD_BATCH);
      const pts = batch.map((l) => l.ll);
      try {
        if (now() > deadline) throw new Error(`out of time (${NHD_BUDGET_MS / 60_000} min)`);
        const [bodies, lines] = await Promise.all([
          nhdNearRetried(
            DEFAULT_ENDPOINTS.nhdWaterbody,
            pts,
            P.flatwaterWithinM,
            "GNIS_NAME,FTYPE,AREASQKM",
            deps,
          ),
          nhdNearRetried(DEFAULT_ENDPOINTS.nhd, pts, P.riverWithinM, "GNIS_NAME", deps),
        ]);
        launches.push(...classifyLaunches(batch, bodies, lines));
      } catch (e) {
        unanswered.add(cell);
        const kept = batch.flatMap((l) => (before.has(l.id) ? [before.get(l.id)!] : []));
        launches.push(...kept);
        deps.log?.(
          `launches: cell ${cell}: ${String(e)}; ${kept.length} of ${batch.length} kept from the previous bake`,
        );
      }
    }
    deps.log?.(`launches: cell ${cell} (${++n} of ${byCell.size}), ${inCell.length} classified`);
  }
  return { launches, unanswered: [...unanswered] };
}

/** The lots within drive.parkingWithinM of any of the trailheads, deduplicated, each with what parkingFor reads. */
async function parkingNear(trailheads: readonly BakedTrailhead[], deps: BakeDeps): Promise<BakedParking[]> {
  const lots = new Map<string, BakedParking>();
  for (let i = 0; i < trailheads.length; i += PARKING_BATCH) {
    const batch = trailheads.slice(i, i + PARKING_BATCH).map((t) => t.ll);
    // parkingQuery's own timeout is a grade's; a batch of 150 needs longer.
    const ql = parkingQuery(batch).replace("[timeout:25]", "[timeout:180]");
    for (const e of await overpass(ql, deps)) {
      const ll = at(e);
      if (!ll) continue;
      const tags = e.tags ?? {};
      const id = `osm:${e.type}/${e.id}`;
      lots.set(id, {
        kind: "parking",
        id,
        ll: round6(ll),
        src: "osm",
        ...(tags.name ? { name: tags.name } : {}),
        ...(hikingTagged(tags) ? { hiking: true as const } : {}),
      });
    }
    deps.log?.(
      `parking: ${Math.min(i + PARKING_BATCH, trailheads.length)} of ${trailheads.length} trailheads`,
    );
  }
  return [...lots.values()];
}

// ---------- the official layers ----------

interface ArcFeature {
  attributes: Record<string, unknown>;
  geometry?: { x: number; y: number };
}

/** Every feature of an ArcGIS layer in the area's box, paged by resultOffset in OBJECTID order. */
async function arcgisAll(
  url: string,
  where: string,
  fields: readonly string[],
  geometry: boolean,
  box: [number, number, number, number],
  deps: BakeDeps,
): Promise<{ oid: string; features: ArcFeature[] }> {
  const meta = (await (await deps.http.fetch(`${url}?f=json`, { timeoutMs: 60_000 })).json()) as {
    objectIdField?: string;
    fields?: { name: string; type: string }[];
  };
  const oid =
    meta.objectIdField ?? meta.fields?.find((f) => f.type === "esriFieldTypeOID")?.name ?? "OBJECTID";
  const [w, s, e, n] = box;
  const out: ArcFeature[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = new URLSearchParams({
      where,
      geometry: JSON.stringify({ xmin: w, ymin: s, xmax: e, ymax: n, spatialReference: { wkid: 4326 } }),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: [oid, ...fields].join(","),
      returnGeometry: String(geometry),
      outSR: "4326",
      orderByFields: oid,
      resultOffset: String(page * PAGE),
      resultRecordCount: String(PAGE),
      f: "json",
    });
    const r = await deps.http.fetch(`${url}/query`, { method: "POST", body: q, timeoutMs: 120_000 });
    if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
    const j = (await r.json()) as {
      features?: ArcFeature[];
      exceededTransferLimit?: boolean;
      error?: { message?: string };
    };
    if (j.error) throw new Error(`${new URL(url).host}: ${j.error.message ?? "error"}`);
    out.push(...(j.features ?? []));
    if (!j.exceededTransferLimit) return { oid, features: out };
  }
  throw new Error(`${new URL(url).host}: more than ${MAX_PAGES * PAGE} features`);
}

/** A layer's points as trailheads named by `nameField`, in the area. */
async function pointLayer(
  src: PlaceSource,
  url: string,
  nameField: string,
  where: string,
  box: [number, number, number, number],
  deps: BakeDeps,
): Promise<BakedTrailhead[]> {
  const { oid, features } = await arcgisAll(url, where, [nameField], true, box, deps);
  return features.flatMap((f) => {
    const name = f.attributes[nameField];
    if (!f.geometry || typeof name !== "string" || !name.trim()) return [];
    const ll: LatLon = [f.geometry.y, f.geometry.x];
    if (!inArea(ll)) return [];
    return [
      {
        kind: "trailhead" as const,
        id: `${src}:${String(f.attributes[oid])}`,
        name: readableName(name),
        ll: round6(ll),
        src,
      },
    ];
  });
}

/** TREC's trails' primary and secondary trailheads (trailheads.ts reads the same fields per grade), 0,0 dropped. */
async function trecLayer(
  url: string,
  box: [number, number, number, number],
  deps: BakeDeps,
): Promise<BakedTrailhead[]> {
  const fields = [
    "Trail_Name",
    "PrimaryTrailhead_Latitude",
    "PrimaryTrailhead_Longitude",
    "SecondaryTrailhead_Latitude",
    "SecondaryTrailhead_Longitude",
  ];
  const { oid, features } = await arcgisAll(url, "1=1", fields, false, box, deps);
  const out: BakedTrailhead[] = [];
  for (const { attributes: a } of features) {
    const name = typeof a.Trail_Name === "string" ? readableName(a.Trail_Name) : "";
    if (!name) continue;
    const heads: [string, unknown, unknown][] = [
      ["p", a.PrimaryTrailhead_Latitude, a.PrimaryTrailhead_Longitude],
      ["s", a.SecondaryTrailhead_Latitude, a.SecondaryTrailhead_Longitude],
    ];
    for (const [which, lat, lon] of heads) {
      if (lat == null || lon == null) continue;
      const ll: LatLon = [Number(lat), Number(lon)];
      if (!Number.isFinite(ll[0]) || !Number.isFinite(ll[1]) || (ll[0] === 0 && ll[1] === 0) || !inArea(ll))
        continue;
      out.push({
        kind: "trailhead",
        id: `tn-trec:${String(a[oid])}:${which}`,
        name,
        ll: round6(ll),
        src: "tn-trec",
        trec: true,
      });
    }
  }
  return out;
}

// ---------- the sources, and the bake ----------

interface SourceDef {
  id: PlaceSource;
  name: string;
  licence: string;
  attribution: string;
  url: string;
  /** A fixed list's date (RIDB_LAUNCHES): the bake doesn't fetch it. */
  fetched?: string;
}

const STATE_SRC: Record<string, PlaceSource> = {
  "VA:parks": "va-parks",
  "NC:parks": "nc-parks",
  "TN:parks": "tn-parks",
  "TN:trails": "tn-trec",
};

/** What index.json says of each source; the licences as commercial-review.md records them. */
export const SOURCE_DEFS: readonly SourceDef[] = [
  {
    id: "osm",
    name: "OpenStreetMap (supermarkets, trailheads, parking)",
    licence: "ODbL 1.0",
    attribution: "© OpenStreetMap contributors",
    url: "https://www.openstreetmap.org/copyright",
  },
  {
    id: "usfs",
    name: "US Forest Service INFRA recreation sites (trailheads)",
    licence: "Public domain (US government work)",
    attribution: "USDA Forest Service",
    url: DEFAULT_ENDPOINTS.usfsRecSites,
  },
  {
    id: "ridb",
    name: "Recreation.gov (RIDB): the Corps' and the Forest Service's boating sites missing from the others",
    licence: "Public domain (US government work: the Corps' and the Forest Service's records)",
    attribution: "Recreation.gov",
    url: RIDB_EXPORT,
    fetched: "2026-10-26",
  },
  {
    id: "crags",
    name: "Climbing areas, kept by hand (lib/screen/data/crags.json): the land managers' and climbing coalitions' pages",
    licence:
      "Parcel Screen's own list of facts; each lot's point © OpenStreetMap contributors (an insubstantial extract)",
    attribution: "Parcel Screen; parking © OpenStreetMap contributors",
    url: "https://github.com/zgrether/parcelscreen/blob/main/lib/screen/data/crags.json",
    fetched: lastChecked(parseCrags(cragsJson)),
  },
  ...STATE_SOURCES.map((s): SourceDef => ({
    id: STATE_SRC[`${s.state}:${s.kind}`]!,
    name: s.label,
    licence:
      "Published by the state for public use; redistribution terms to confirm (docs/commercial-review.md)",
    attribution: s.label,
    url: DEFAULT_ENDPOINTS.stateParks.find((u) => u.startsWith(s.prefix)) ?? s.prefix,
  })),
];

const BOX: [number, number, number, number] = [-92, 33, -74, 41];

/**
 * Bakes every source. Each official layer and each OSM cell is asked once; parking is asked around every trailhead
 * (OSM and official). A source that throws keeps its previous places.
 */
export async function bakePlaces(deps: BakeDeps): Promise<Bake> {
  const log = deps.log ?? (() => {});
  const cells = areaCells();
  log(`${cells.length} cells`);
  const got = new Map<PlaceSource, Place[]>();
  const failed: string[] = [];
  const keep = (src: PlaceSource, why: unknown) => {
    const prev = deps.previous;
    if (!prev) throw new Error(`${src} didn't answer and there's no previous bake: ${String(why)}`);
    failed.push(src);
    log(`${src}: ${String(why)}; keeping the previous bake's`);
    got.set(
      src,
      prev.places.filter((p) => p.src === src && p.kind !== "parking"),
    );
  };

  // Launches found this bake, classified once every source has answered (classifyAll).
  const raw: RawLaunch[] = [];

  // The towns, for the refresh summary only: kept from the previous bake when Overpass won't say.
  let towns = deps.previous?.index.towns;
  try {
    towns = townsOf(await overpass(TOWNS_QUERY, deps));
  } catch (e) {
    failed.push("osm towns");
    log(`towns: ${String(e)}; keeping the previous bake's`);
  }

  // OSM, a cell at a time; one cell failing fails the source (a partial OSM would read as places closing).
  let osmOk = false;
  try {
    const osm: Place[] = [];
    const launches: RawLaunch[] = [];
    for (const [i, cell] of cells.entries()) {
      const elements = await overpassRetried(osmCellQuery(cell), deps, `osm: cell ${cell}`);
      osm.push(...osmPlaces(elements));
      launches.push(...osmLaunches(elements));
      log(
        `osm: cell ${cell} (${i + 1} of ${cells.length}), ${osm.length} places and ${launches.length} launches so far`,
      );
    }
    got.set("osm", osm);
    raw.push(...launches);
    osmOk = true;
  } catch (e) {
    keep("osm", e);
  }

  // Existing-house plan §2: the lots by a trail, merged once every source has answered. Their own pass, after OSM's,
  // a quarter cell at a time, one request at a time (Zach, 11/12). Each quarter's lots are the shipped ones (the previous
  // bake's) and this bake's, one per OSM id: an Overpass answer that comes back short never takes lots away, and a
  // quarter that won't answer keeps its shipped lots. A lot gone from OSM lingers (pruning is in polish.md).
  const lots: TrailLot[] = [];
  const lotCells: TrailLotCell[] = [];
  if (osmOk) {
    const tagged = new Set((got.get("osm") ?? []).map((p) => p.id));
    // The shipped lots: OSM trailheads the previous bake had that this bake's tagged ones don't.
    const shipped = (deps.previous?.places ?? []).filter(
      (p): p is BakedTrailhead => p.src === "osm" && p.kind === "trailhead" && !tagged.has(p.id),
    );
    const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const quarters = cells.flatMap(quartersOf);
    for (const [i, q] of quarters.entries()) {
      if (i) await sleep(TRAIL_LOT_GAP_MS);
      let retried = false;
      let found: TrailLot[] | null = null;
      try {
        found = trailLots(
          await overpassRetried(trailLotQuery(q), deps, `trail lots: ${q}`, () => (retried = true)),
        ).filter((l) => inBox(q, l.ll));
      } catch (e) {
        log(`trail lots: ${q}: ${String(e)}; its shipped lots kept`);
      }
      const base = shipped
        .filter((p) => inBox(q, p.ll))
        .map((p): TrailLot => ({ ...p, ownName: !p.name.endsWith("(parking)") }));
      const byId = new Map(base.map((l) => [l.id, l]));
      for (const l of found ?? []) byId.set(l.id, l);
      lots.push(...byId.values());
      lotCells.push({
        cell: q,
        found: found?.length ?? null,
        baseline: base.length,
        merged: byId.size,
        retried,
      });
      if (retried || found === null || found.length < base.length)
        log(
          `trail lots: ${q}: ${found === null ? "failed" : `${found.length} found`}, ${base.length} shipped, ${byId.size} kept${retried ? " (retried)" : ""}`,
        );
    }
    const missed = lotCells.filter((c) => c.found === null).map((c) => c.cell);
    if (missed.length)
      failed.push(
        `trail lots in ${missed.length} quarter cell${missed.length === 1 ? "" : "s"} (${missed.join(", ")})`,
      );
  }

  // The cited trailhead overrides (lib/places/data/trailhead-overrides.json): kept with OSM's, whatever Overpass says.
  const overrides = trailheadOverrides();

  // USFS: its trailheads, and its boating sites as launches (the subtype's value as the layer has it: BOATING SITE).
  try {
    const [trailheads, boating] = await Promise.all([
      pointLayer("usfs", DEFAULT_ENDPOINTS.usfsRecSites, "site_name", "site_subtype='TRAILHEAD'", BOX, deps),
      pointLayer(
        "usfs",
        DEFAULT_ENDPOINTS.usfsRecSites,
        "site_name",
        "site_subtype LIKE '%BOAT%'",
        BOX,
        deps,
      ),
    ]);
    got.set("usfs", trailheads);
    // Their own ids: a boating site and a trailhead never share a place's id, whatever the layer's.
    raw.push(
      ...boating.map((b): RawLaunch => ({
        id: b.id.replace(/^usfs:/, "usfs:boat:"),
        ll: b.ll,
        src: "usfs",
        name: b.name,
      })),
    );
  } catch (e) {
    keep("usfs", e);
  }
  for (const s of STATE_SOURCES) {
    const src = STATE_SRC[`${s.state}:${s.kind}`]!;
    const url = DEFAULT_ENDPOINTS.stateParks.find((u) => u.startsWith(s.prefix));
    try {
      if (!url) throw new Error(`no endpoint for ${s.prefix}`);
      got.set(
        src,
        s.kind === "trails"
          ? await trecLayer(url, BOX, deps)
          : await pointLayer(src, url, s.name, s.where ?? "1=1", BOX, deps),
      );
    } catch (e) {
      keep(src, e);
    }
    log(`${src}: ${got.get(src)?.length ?? 0}`);
  }

  // The trail lots (existing-house plan §2), against every other trailhead (the overrides among them) and each other;
  // kept with OSM's.
  const tagged = [
    ...[...got.values()].flat().filter((p): p is BakedTrailhead => p.kind === "trailhead"),
    ...overrides,
  ];
  const keptLots = mergeTrailLots(lots, tagged);
  got.set("osm", [...(got.get("osm") ?? []), ...overrides, ...keptLots]);
  log(
    `trail lots: ${lots.length} after merging with the shipped, ${keptLots.length} kept; ${overrides.length} overrides`,
  );

  // Parking around every trailhead, whichever source: kept with OSM (it is OSM's).
  const trailheads = [...got.values()].flat().filter((p): p is BakedTrailhead => p.kind === "trailhead");
  let parking: BakedParking[];
  try {
    parking = await parkingNear(trailheads, deps);
  } catch (e) {
    if (!deps.previous) throw e;
    failed.push("osm parking");
    log(`parking: ${String(e)}; keeping the previous bake's`);
    parking = deps.previous.places.filter((p): p is BakedParking => p.kind === "parking");
  }
  // A lot that is a trailhead itself (a trail lot, or a lot tagged as one) is asked for again here, around itself, with
  // the same id: kept as the trailhead, never as its own parking (the cells keep one place per id, the last).
  const trailheadIds = new Set(trailheads.map((t) => t.id));
  parking = parking.filter((p) => !trailheadIds.has(p.id));

  // Each launch on its water (NHD), a batch at a time; a batch NHD won't answer keeps the previous bake's.
  const classified = await classifyAll(raw, deps);
  const launches = classified.launches;
  if (classified.unanswered.length)
    failed.push(`launch classification (NHD) in ${classified.unanswered.length} cells`);

  // Step 17: the curated climbing areas, from the repo's own list (no network; pnpm data:crags writes them alone too).
  const crags = parseCrags(cragsJson).map(cragPlace);
  const all: Place[] = [...[...got.values()].flat(), ...parking, ...launches, ...RIDB_LAUNCHES, ...crags];
  const byFile = new Map<string, Place[]>();
  for (const p of all) {
    const key = `${FOLDER_OF[p.src]}/${cellOf(p.ll)}`;
    byFile.set(key, [...(byFile.get(key) ?? []), p]);
  }
  const cellFiles: PlaceCell[] = [...byFile.entries()]
    .map(([key, places]) => {
      const [folder, cell] = key.split("/") as [PlaceCell["folder"], string];
      // The same place can come twice (an OSM element in two cells' boxes, on their shared edge): kept once.
      const unique = [...new Map(places.map((p) => [p.id, p])).values()].sort((a, b) =>
        a.id < b.id ? -1 : 1,
      );
      // The curated cells carry the list's last check, as pnpm data:crags writes them (the same list, the same files).
      const baked = folder === "curated" ? lastChecked(parseCrags(cragsJson)) : deps.today;
      return { version: PLACES_VERSION, folder, cell, baked, places: unique };
    })
    .sort((a, b) => (a.folder + a.cell < b.folder + b.cell ? -1 : 1));

  const fetchedOf = (id: PlaceSource) =>
    failed.includes(id)
      ? (deps.previous?.index.sources.find((s) => s.id === id)?.fetched ?? deps.today)
      : deps.today;
  const index: PlacesIndex = {
    version: PLACES_VERSION,
    baked: deps.today,
    bounds: boundsOf(cells),
    marginKm: MARGIN_KM,
    ...(towns?.length ? { towns } : {}),
    sources: SOURCE_DEFS.map((d) => ({
      ...d,
      folder: FOLDER_OF[d.id],
      fetched: d.fetched ?? fetchedOf(d.id),
      count: cellFiles.reduce(
        (t, c) => t + c.places.filter((p) => p.src === d.id && p.kind !== "parking").length,
        0,
      ),
    })),
    cells: Object.fromEntries(
      PLACE_FOLDERS.map((f) => [
        f,
        Object.fromEntries(cellFiles.filter((c) => c.folder === f).map((c) => [c.cell, c.places.length])),
      ]),
    ) as PlacesIndex["cells"],
  };
  if (failed.length) log(`kept the previous bake's: ${failed.join(", ")}`);
  return { index, cells: cellFiles, kept: failed, trailLots: keptLots, trailLotCells: lotCells };
}

/** OSM's named towns and cities over the baked box. */
export const TOWNS_QUERY = `[out:json][timeout:180][bbox:${BOX[1]},${BOX[0]},${BOX[3]},${BOX[2]}];node[place~"^(town|city)$"][name];out;`;

export function townsOf(elements: readonly OsmElement[]): NonNullable<PlacesIndex["towns"]> {
  return elements
    .flatMap((e) => {
      const ll = at(e);
      const name = e.tags?.name;
      return ll && name && inArea(ll) ? [{ name, ll: round6(ll) }] : [];
    })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.ll[0] - b.ll[0]));
}

function boundsOf(cells: readonly string[]): [number, number, number, number] {
  const boxes = cells.map(cellBox);
  return [
    Math.min(...boxes.map((b) => b[0])),
    Math.min(...boxes.map((b) => b[1])),
    Math.max(...boxes.map((b) => b[2])),
    Math.max(...boxes.map((b) => b[3])),
  ];
}

/**
 * The bake's report on the trail lots (existing-house plan §5, PR 4): how many per state (inside it, else "nearby"), and
 * the ten nearest a town's centre, where a town park's lot would be the likeliest false trailhead.
 */
export function trailLotReport(
  lots: readonly BakedTrailhead[],
  towns: readonly { name: string; ll: LatLon }[],
  quarters: readonly TrailLotCell[] = [],
): string {
  const per = new Map<string, number>();
  for (const l of lots) {
    const st = STATES.find((s) => kmToState(s, l.ll) <= 0) ?? "nearby";
    per.set(st, (per.get(st) ?? 0) + 1);
  }
  const nearest = lots
    .map((l) => {
      const t = towns.map((x) => ({ x, m: metres(l.ll, x.ll) })).sort((a, b) => a.m - b.m)[0];
      return { l, t };
    })
    .filter((x) => x.t)
    .sort((a, b) => a.t!.m - b.t!.m)
    .slice(0, 10);
  return [
    "# The trail lots baked as trailheads",
    "",
    `${lots.length} lots, by state: ${[...per].map(([k, n]) => `${k} ${n}`).join(", ") || "none"}.`,
    "",
    "## The ten nearest a town's centre",
    "",
    "| Lot | Where | Town | Distance |",
    "|---|---|---|---|",
    ...nearest.map(
      ({ l, t }) =>
        `| ${l.name} | ${l.ll[0].toFixed(4)}, ${l.ll[1].toFixed(4)} | ${t!.x.name} | ${Math.round(t!.m)} m |`,
    ),
    "",
    ...quarterReport(quarters, lots.length),
  ].join("\n");
}

/**
 * Each quarter cell's trail lots (Zach, 11/12): the ones retried, failed or found below the shipped baseline first (the
 * signal of Overpass trouble), then every quarter's counts.
 */
function quarterReport(quarters: readonly TrailLotCell[], kept: number): string[] {
  if (!quarters.length) return [];
  const odd = quarters.filter((q) => q.retried || q.found === null || q.found < q.baseline);
  const row = (q: TrailLotCell) =>
    `| ${q.cell} | ${q.found ?? "failed"} | ${q.baseline} | ${q.merged} | ${q.retried ? "yes" : ""} |`;
  const head = ["| Quarter | Found | Shipped | Kept | Retried |", "|---|---|---|---|---|"];
  const merged = quarters.reduce((t, q) => t + q.merged, 0);
  const shipped = quarters.reduce((t, q) => t + q.baseline, 0);
  const barMerged = Math.max(TRAIL_LOT_BAR.found, shipped);
  const barKept = Math.max(TRAIL_LOT_BAR.kept, shipped);
  return [
    "## Each quarter cell",
    "",
    `Against the bar (Zach, 11/12; bake 2's, or the shipped if larger): ${merged} after merging with the shipped (bar ${barMerged}), ${kept} kept after merging with the other trailheads (bar ${barKept})${merged < barMerged || kept < barKept ? ": short" : ""}.`,
    "",
    `${quarters.length} quarters; found ${quarters.reduce((t, q) => t + (q.found ?? 0), 0)}, shipped ${quarters.reduce((t, q) => t + q.baseline, 0)}, kept ${quarters.reduce((t, q) => t + q.merged, 0)} before merging with the other trailheads.`,
    "",
    `### Retried, failed or below the shipped (${odd.length})`,
    "",
    ...(odd.length ? [...head, ...odd.map(row)] : ["None."]),
    "",
    "### All",
    "",
    ...head,
    ...quarters.map(row),
    "",
  ];
}
