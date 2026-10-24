/**
 * Privacy at a spot (step 11, docs/plans/step-11-new-data.md §2.3): the houses around it, from the committed footprint
 * tiles `pnpm data:buildings` writes (Microsoft Global ML Building Footprints; scripts/data-buildings.mts):
 * - the houses within a quarter mile;
 * - the houses within a mile in sight: the straight line from eye height at the spot to the house's roof clears the
 *   bare-earth DEM all the way (trees ignored, so it reads "in winter, with leaves down");
 * - the nearest house, and how far.
 * A house is a footprint of at least privacy.minHouseM2 that isn't on the parcel. No runtime endpoint: a parcel outside
 * the tiles' region has no reading, and the card says so.
 */
import {
  bbox,
  booleanPointInPolygon,
  distance,
  lineString,
  pointToLineDistance,
  polygonToLine,
} from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import * as UTM from "../geo/utm";
import { SCREEN_CONSTANTS } from "./config";
import { REGION, STEP_DEG, TILE_DEG, TILES } from "./data/buildings";
import { bilinear } from "./dem";
import type { Dem, PartialScreenResult } from "./types";
import type { LatLon } from "./util";

const K = SCREEN_CONSTANTS.privacy;
const FT_PER_M = 3.28084;
/** A height the tiles don't know. */
const NO_HEIGHT = 15;

export interface House {
  ll: LatLon;
  /** Its own height, whole metres (14 at most); null when the footprints don't give one. */
  heightM: number | null;
}

/** The houses in the named tiles (a tile with none isn't in the index), or null when they can't be loaded. */
export type BuildingSource = (tiles: readonly string[]) => Promise<House[] | null>;

/** A tile's name: its south-west corner, "n3650w8160" for 36.5 N, 81.6 W (as the bake names them). */
export const tileName = (lat: number, lon: number): string =>
  `n${Math.round(Math.floor(lat / TILE_DEG) * TILE_DEG * 100)}w${Math.round(-Math.floor(lon / TILE_DEG) * TILE_DEG * 100)}`;

/** A tile's houses, from its 3-byte words (scripts/data-buildings.mts `packed`). */
export function unpack(name: string, b64: string): House[] {
  const south = Number(name.slice(1, name.indexOf("w"))) / 100;
  const west = -Number(name.slice(name.indexOf("w") + 1)) / 100;
  const b = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const out: House[] = [];
  for (let i = 0; i + 2 < b.length; i += 3) {
    const v = b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
    const h = (v >> 20) & 15;
    out.push({
      ll: [south + (v & 1023) * STEP_DEG, west + ((v >> 10) & 1023) * STEP_DEG],
      heightM: h === NO_HEIGHT ? null : h,
    });
  }
  return out;
}

const cache = new Map<string, Promise<House[]>>();

/** The committed tiles, each loaded once per session (its own chunk in the browser); null when one can't be loaded. */
export const loadBuildings: BuildingSource = async (names) => {
  const tile = (name: string): Promise<House[]> => {
    const load = TILES[name];
    if (!load) return Promise.resolve([]);
    const kept = cache.get(name);
    if (kept) return kept;
    const p = load().then((m: { default: { b: string } }) => unpack(name, m.default.b));
    p.catch(() => cache.delete(name)); // try again next run
    cache.set(name, p);
    return p;
  };
  try {
    return (await Promise.all(names.map(tile))).flat();
  } catch {
    return null;
  }
};

/** Whether a point is inside the tiles' region: outside it, no tile was baked, so "no house" isn't known. */
export const inRegion = ([lat, lon]: LatLon): boolean =>
  lat >= REGION[0] && lat < REGION[2] && lon >= REGION[1] && lon < REGION[3];

/** The tiles a circle of `m` metres around a point touches. */
export function tilesAround([lat, lon]: LatLon, m: number): string[] {
  const dLat = m / 111_320;
  const dLon = m / (111_320 * Math.cos((lat * Math.PI) / 180));
  const names = new Set<string>();
  for (let y = lat - dLat; y <= lat + dLat + TILE_DEG; y += TILE_DEG)
    for (let x = lon - dLon; x <= lon + dLon + TILE_DEG; x += TILE_DEG)
      names.add(tileName(Math.min(y, lat + dLat), Math.min(x, lon + dLon)));
  return [...names];
}

/** The tiles the parcel's box, widened by `m` metres, touches. */
export function tilesAroundParcel(parcel: Feature<Polygon | MultiPolygon>, m: number): string[] {
  const [w, s, e, n] = bbox(parcel);
  const dLat = m / 111_320;
  const dLon = m / (111_320 * Math.cos((((s + n) / 2) * Math.PI) / 180));
  const names = new Set<string>();
  for (let y = s - dLat; y <= n + dLat + TILE_DEG; y += TILE_DEG)
    for (let x = w - dLon; x <= e + dLon + TILE_DEG; x += TILE_DEG)
      names.add(tileName(Math.min(y, n + dLat), Math.min(x, e + dLon)));
  return [...names];
}

/** Owner, after #312: the houses within privacy.nearM of the boundary, the parcel's own left out. */
export function housesNearBoundary(
  houses: readonly House[],
  parcel: Feature<Polygon | MultiPolygon>,
): number {
  const [w, s, e, n] = bbox(parcel);
  const dLat = K.nearM / 111_320;
  const dLon = K.nearM / (111_320 * Math.cos((((s + n) / 2) * Math.PI) / 180));
  const l = polygonToLine(parcel);
  const edges = (l.type === "FeatureCollection" ? l.features : [l]).flatMap((f) =>
    f.geometry.type === "LineString"
      ? [lineString(f.geometry.coordinates)]
      : f.geometry.coordinates.map((c) => lineString(c)),
  );
  let count = 0;
  for (const h of houses) {
    const [lat, lon] = h.ll;
    if (lat < s - dLat || lat > n + dLat || lon < w - dLon || lon > e + dLon) continue;
    if (booleanPointInPolygon([lon, lat], parcel)) continue;
    if (edges.some((g) => pointToLineDistance([lon, lat], g, { units: "meters" }) <= K.nearM)) count++;
  }
  return count;
}

/** A spot's privacy, as a site or the house stores it (ScoreFields.privacy). */
export interface SpotPrivacy {
  /** Houses within a quarter mile. */
  near: number;
  /** Houses within a mile with a clear line of sight from the spot, over bare earth. */
  inSight: number;
  /** The nearest house within a mile, in feet; null when there's none. */
  nearestFt: number | null;
}

/**
 * Whether the line from `from` (eye height above `fromM`) to the house's roof clears the DEM. The samples start and end
 * one step in, so neither end's own cell blocks it.
 */
export function inSight(dem: Dem, from: LatLon, fromM: number, house: House): boolean {
  const [x0, y0] = UTM.fwd(from[0], from[1]);
  const [x1, y1] = UTM.fwd(house.ll[0], house.ll[1]);
  const ground = bilinear(dem, x1, y1);
  if (Number.isNaN(ground)) return false;
  const z0 = fromM + K.eyeM;
  const z1 = ground + (house.heightM ?? K.roofM);
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.floor(d / K.stepM);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const z = bilinear(dem, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
    if (!Number.isNaN(z) && z >= z0 + (z1 - z0) * t) return false;
  }
  return true;
}

/** A spot's privacy among the houses around it, the parcel's own left out. */
export function privacyAt(
  houses: readonly House[],
  dem: Dem,
  parcel: Feature<Polygon | MultiPolygon>,
  ll: LatLon,
  elevFt: number,
): SpotPrivacy {
  let near = 0;
  let seen = 0;
  let nearestM = Infinity;
  for (const h of houses) {
    const m = distance([ll[1], ll[0]], [h.ll[1], h.ll[0]], { units: "meters" });
    if (m > K.sightM || booleanPointInPolygon([h.ll[1], h.ll[0]], parcel)) continue;
    if (m <= K.nearM) near++;
    if (m < nearestM) nearestM = m;
    if (inSight(dem, ll, elevFt / FT_PER_M, h)) seen++;
  }
  return {
    near,
    inSight: seen,
    nearestFt: Number.isFinite(nearestM) ? Math.round(nearestM * FT_PER_M) : null,
  };
}

type Spots = Pick<PartialScreenResult, "sites" | "house">;

/**
 * The result's spots with their privacy (plan §2.3), and whether the parcel is outside the footprints' region. Null
 * without the tiles, or without the wide DEM: the spots stay unread, and the card says "not measured".
 */
export async function withPrivacy(
  source: BuildingSource,
  dem: Dem | undefined,
  parcel: Feature<Polygon | MultiPolygon>,
  centre: LatLon,
  r: Spots,
): Promise<(Spots & { privacy: { outside: boolean; nearBoundary?: number } }) | null> {
  if (!dem) return null;
  if (!inRegion(centre)) return { ...r, privacy: { outside: true } };
  const spots = [...(r.sites ?? []), ...(r.house && !("outside" in r.house) ? [r.house] : [])];
  const houses = await source([
    ...new Set([...spots.flatMap((x) => tilesAround(x.ll, K.sightM)), ...tilesAroundParcel(parcel, K.nearM)]),
  ]);
  if (!houses) return null;
  const read = <T extends { ll: LatLon; elevFt?: number | null }>(x: T): T & { privacy?: SpotPrivacy } => {
    const { privacy: _old, ...rest } = x as T & { privacy?: SpotPrivacy };
    return (
      x.elevFt == null ? rest : { ...rest, privacy: privacyAt(houses, dem, parcel, x.ll, x.elevFt) }
    ) as T & { privacy?: SpotPrivacy };
  };
  return {
    ...(r.sites ? { sites: r.sites.map(read) } : {}),
    ...(r.house !== undefined ? { house: r.house && !("outside" in r.house) ? read(r.house) : r.house } : {}),
    privacy: { outside: false, nearBoundary: housesNearBoundary(houses, parcel) },
  };
}
