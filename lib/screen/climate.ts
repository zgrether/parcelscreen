/**
 * Climate at a spot (step 11, docs/plans/step-11-new-data.md §2.2), from the committed snapshot `pnpm data:climate`
 * writes (scripts/data-climate.mts):
 * - January's mean low and July's mean high, PRISM 1991–2020 normals at 800 m, moved from the cell's mean elevation to
 *   the spot's at the standard lapse rate (config `climate.lapseFPer1000Ft`);
 * - snowfall and the 32 °F frost dates from the most similar NOAA normals station nearby, as recorded there: a station
 *   in a valley has the valley's frosts, so they aren't moved to the spot's elevation.
 * No runtime endpoint. A spot outside the snapshot's region has no reading; the card says so.
 */
import { distance } from "@turf/turf";
import { z } from "zod";
import { SCREEN_CONSTANTS } from "./config";
import type { PartialScreenResult } from "./types";
import type { LatLon } from "./util";

const K = SCREEN_CONSTANTS.climate;
const MI_PER_KM = 0.621371;
/** An empty cell in the packed grids (the sea, or no data). */
const NO_DATA = -32768;

const StationSchema = z.object({
  id: z.string(),
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
  elevFt: z.number(),
  snowIn: z.number(),
  lastFreeze: z.string(),
  firstFreeze: z.string(),
  frostFreeDays: z.number(),
});
export type ClimateStation = z.infer<typeof StationSchema>;

const SnapshotSchema = z.object({
  checked: z.string(),
  prism: z.object({
    west: z.number(),
    north: z.number(),
    cellDeg: z.number(),
    cols: z.number().int(),
    rows: z.number().int(),
    janLowF10: z.string(),
    julHighF10: z.string(),
    elevFt: z.string(),
  }),
  stations: z.array(StationSchema).min(1),
});

/** The snapshot, its grids unpacked. */
export interface ClimateData {
  grid: { west: number; north: number; cellDeg: number; cols: number; rows: number };
  janLowF10: Int16Array;
  julHighF10: Int16Array;
  elevFt: Int16Array;
  stations: ClimateStation[];
}

export type ClimateSource = () => Promise<ClimateData | null>;

/** Base64 of little-endian Int16s, in the browser's worker and in Node alike. */
function unpack(b64: string): Int16Array {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
}

let loaded: Promise<ClimateData | null> | null = null;

/** The committed snapshot, loaded once per session (its own chunk in the browser); null when it can't be loaded. */
export const loadClimate: ClimateSource = () =>
  (loaded ??= import("./data/climate.json")
    .then((m) => {
      const s = SnapshotSchema.parse((m as { default: unknown }).default);
      const { janLowF10, julHighF10, elevFt, ...grid } = s.prism;
      return {
        grid,
        janLowF10: unpack(janLowF10),
        julHighF10: unpack(julHighF10),
        elevFt: unpack(elevFt),
        stations: s.stations,
      };
    })
    .catch(() => {
      loaded = null; // try again next run
      return null;
    }));

/** A spot's climate, as a site or the house stores it (ScoreFields.climate). */
export interface SpotClimate {
  janLowF: number;
  julHighF: number;
  /** The station its snowfall and frost dates are from, and how far it is; null when none is near enough. */
  station: string | null;
  stationMi: number | null;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** The spot's reading, or null outside the snapshot's grid (or on an empty cell). */
export function climateAt(data: ClimateData, ll: LatLon, elevFt: number): SpotClimate | null {
  const [lat, lon] = ll;
  const { west, north, cellDeg, cols, rows } = data.grid;
  const c = Math.floor((lon - west) / cellDeg);
  const r = Math.floor((north - lat) / cellDeg);
  if (c < 0 || r < 0 || c >= cols || r >= rows) return null;
  const i = r * cols + c;
  const [jan, jul, cellFt] = [data.janLowF10[i]!, data.julHighF10[i]!, data.elevFt[i]!];
  if (jan === NO_DATA || jul === NO_DATA || cellFt === NO_DATA) return null;
  // Higher is colder: the lapse rate per 1,000 ft above the cell's mean elevation.
  const lapse = (K.lapseFPer1000Ft * (elevFt - cellFt)) / 1000;
  const st = stationFor(data.stations, ll, elevFt);
  return {
    janLowF: round1(jan / 10 - lapse),
    julHighF: round1(jul / 10 - lapse),
    station: st?.station.id ?? null,
    stationMi: st ? round1(st.km * MI_PER_KM) : null,
  };
}

/**
 * The most similar station within stationMaxKm: the least distance plus elevation difference (stationFtPerKm feet of
 * difference count as a kilometre). Null when none is near enough.
 */
export function stationFor(
  stations: readonly ClimateStation[],
  ll: LatLon,
  elevFt: number,
): { station: ClimateStation; km: number } | null {
  let best: { station: ClimateStation; km: number; score: number } | null = null;
  for (const station of stations) {
    const km = distance([ll[1], ll[0]], [station.lon, station.lat], { units: "kilometers" });
    if (km > K.stationMaxKm) continue;
    const score = km + Math.abs(station.elevFt - elevFt) / K.stationFtPerKm;
    if (!best || score < best.score) best = { station, km, score };
  }
  return best && { station: best.station, km: best.km };
}

type Spots = Pick<PartialScreenResult, "sites" | "house">;

/**
 * The result's spots with their climate, and the stations they name (plan §2.2). `outside` when the parcel has spots
 * and none is on the snapshot's grid. Null without the snapshot: the spots stay unread, and the card says "not
 * measured".
 */
export function withClimate(
  data: ClimateData | null,
  r: Spots,
): (Spots & { climate: NonNullable<PartialScreenResult["climate"]> }) | null {
  if (!data) return null;
  const read = <T extends { ll: LatLon; elevFt?: number | null }>(x: T): T & { climate?: SpotClimate } => {
    const { climate: _old, ...rest } = x as T & { climate?: SpotClimate };
    const c = x.elevFt == null ? null : climateAt(data, x.ll, x.elevFt);
    return (c ? { ...rest, climate: c } : rest) as T & { climate?: SpotClimate };
  };
  const sites = r.sites?.map(read);
  const house = r.house && !("outside" in r.house) ? read(r.house) : r.house;
  const spots = [...(sites ?? []), ...(house && !("outside" in house) ? [house] : [])];
  const ids = new Set(spots.map((x) => x.climate?.station).filter((id): id is string => !!id));
  const stations = data.stations.filter((st) => ids.has(st.id)).map(({ lat: _lat, lon: _lon, ...st }) => st);
  return {
    ...(sites ? { sites } : {}),
    ...(r.house !== undefined ? { house } : {}),
    climate: { outside: spots.length > 0 && spots.every((x) => !x.climate), stations },
  };
}
