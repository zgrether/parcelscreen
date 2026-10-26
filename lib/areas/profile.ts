/**
 * Profiling an area (step 13, docs/plans/step-13-area-catalog.md §3): about 200 points on its rural land, and at
 * each the same measures a screen makes, by the same code (lib/screen): elevation and Long view on the 30 m DEM, the
 * sky's zenith brightness from the atlas, climate normals at the point's height, drives to the nearest ER, grocery,
 * commercial airport, trailhead, long-trail access point and flatwater paddle launch, and the distance to open public
 * land. Then each
 * measure's median. Every request goes through the deps' HttpClient; nothing here touches the DOM.
 */
import { bbox } from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import type { HttpClient } from "../http";
import * as UTM from "../geo/utm";
import { SCREEN_CONSTANTS } from "../screen/config";
import { bilinear, type DemCache } from "../screen/dem";
import { climateAt, type ClimateData } from "../screen/climate";
import { lpMag, lpRatioAt, type AtlasCache } from "../screen/sky";
import { horizonProfile } from "../screen/sun";
import { viewOf } from "../screen/view";
import { LONG_TRAILS } from "../screen/data/longTrails";
import { officialTrailheads } from "../screen/trailheads";
import { placesFromHttp, type BakedLaunch, type PlacesSource } from "../screen/placeData";
import { distinctLaunches } from "../screen/paddling";
import type { Endpoints } from "../screen/types";
import { openPct } from "../report/view";
import type { LatLon } from "../geo/types";
import type { AreaDef } from "./catalog";
import { erDestinations, type AirportList, type ErList } from "./data";
import type { ErOverride } from "../screen/hospitals";
import { osrmMatrix, pointDrives, type Matrix } from "./drives";
import { sampleArea, type Sample } from "./sample";
import {
  fetchDemTiles,
  fetchLandCover,
  fetchPlaces,
  fetchPublicLand,
  distinct,
  gridCentres,
  landCoverAt,
  onPublicLand,
  openLandFt,
  tileFor,
  widen,
  type Box,
} from "./sources";
import { AREA_FILE_VERSION, MEASURES, type AreaFile, type Measure } from "./types";

const K = SCREEN_CONSTANTS.areas;
const FT_PER_M = 3.28084;

export interface ProfileDeps {
  http: HttpClient;
  endpoints: Endpoints;
  atlas: AtlasCache;
  dems?: DemCache;
  climate: ClimateData | null;
  ers: ErList;
  /** The hand-checked ER overrides (lib/screen/data/er-overrides.json). */
  erOverrides: readonly ErOverride[];
  airports: AirportList;
  /** The run's date, YYYY-MM-DD: injected, so a replayed run is the same file. */
  today: string;
  /** The drive tables; OSRM's by default. */
  matrix?: Matrix;
  /** The baked places (the official trailheads, the paddle launches); read over HTTP from endpoints.places by default. */
  places?: PlacesSource;
}

/** Smaller runs for the tests: fewer points, a coarser DEM and land cover. */
export interface ProfileScale {
  points?: number;
  demResM?: number;
  landCoverScale?: number;
}

type Column = (number | null)[];

/** The median of the readings, ignoring nulls; null when there are none. */
export function median(xs: Column): number | null {
  const v = xs.filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

/** Each measure's rounding, as the card shows it. */
const ROUND: Record<Measure, number> = {
  elevFt: 0,
  skyMag: 2,
  janLowF: 1,
  julHighF: 1,
  viewOpenPct: 0,
  erMin: 0,
  groceryMin: 0,
  airportMin: 0,
  trailheadMin: 0,
  openLandFt: -1,
  longTrailMin: 0,
  paddleMin: 0,
};
const round = (m: Measure, x: number | null): number | null => {
  if (x === null || !Number.isFinite(x)) return null;
  const f = 10 ** ROUND[m];
  return Math.round(x * f) / f;
};

/** The 1° cells a box touches (lib/screen/placeData.ts cellOf's names). */
function cellsOfBox([w, s, e, n]: Box): string[] {
  const out: string[] = [];
  for (let a = Math.floor(s); a <= Math.floor(n); a++)
    for (let o = Math.floor(w); o <= Math.floor(e); o++) out.push(`${a}_${o}`);
  return out;
}

/**
 * The flatwater launches a point in the box might drive to: within paddling.maxKm of it, as a screen looks, each put-in
 * once (paddling.sameWithinM).
 */
async function flatLaunches(box: Box, places: PlacesSource): Promise<LatLon[]> {
  const cells = cellsOfBox(widen(box, SCREEN_CONSTANTS.paddling.maxKm));
  const all = [...(await places("osm", cells)), ...(await places("official", cells))];
  const flat = all
    .filter((p): p is BakedLaunch => p.kind === "launch" && p.water === "flat")
    .sort((a, b) => a.ll[0] - b.ll[0] || a.ll[1] - b.ll[1]);
  return distinctLaunches(flat.map((l) => ({ l, km: 0 }))).map((x) => x.l.ll);
}

export async function profileArea(
  def: AreaDef,
  outline: Feature<Polygon | MultiPolygon>,
  deps: ProfileDeps,
  scale: ProfileScale = {},
): Promise<{ file: AreaFile; sample: Sample }> {
  const box = bbox(outline) as Box;
  const padus = deps.endpoints.padus[0]!;

  // 1. Rural land: NLCD and PAD-US over the outline's box (wider for the distance to open land).
  const cover = await fetchLandCover(box, deps.http, scale.landCoverScale ?? 1);
  const land = await fetchPublicLand(widen(box, K.padusMarginKm), deps.http, padus);
  const sample = sampleArea(
    def.id,
    outline,
    { landCover: (ll) => landCoverAt(cover, ll), onPublicLand: (ll) => onPublicLand(land, ll) },
    scale.points ?? K.points,
  );
  const pts = sample.points;

  // 2. The ground: elevation and Long view on DEM tiles reaching past every point by the horizon's 6 km.
  const reachKm = SCREEN_CONSTANTS.sun.horizonMaxM / 1000;
  const tiles = pts.length
    ? await fetchDemTiles(
        box,
        reachKm + 1,
        { http: deps.http, endpoints: deps.endpoints, ...(deps.dems ? { cache: deps.dems } : {}) },
        scale.demResM ?? K.demResM,
      )
    : [];
  const cols = Object.fromEntries(MEASURES.map((m) => [m, [] as Column])) as Record<Measure, Column>;
  for (const ll of pts) {
    const t = tileFor(tiles, ll);
    const elevM = t ? bilinear(t.dem, ...UTM.fwd(ll[0], ll[1])) : NaN;
    const elevFt = Number.isFinite(elevM) ? elevM * FT_PER_M : null;
    cols.elevFt.push(round("elevFt", elevFt));
    cols.viewOpenPct.push(t ? openPct(viewOf(horizonProfile(t.dem, t.r, t.c), t.dem, t.r, t.c)) : null);
    const sky = await lpRatioAt(ll[0], ll[1], {
      http: deps.http,
      endpoints: deps.endpoints,
      atlas: deps.atlas,
    });
    cols.skyMag.push(round("skyMag", sky ? lpMag(sky.ratio) : null));
    const c = deps.climate && elevFt !== null ? climateAt(deps.climate, ll, elevFt) : null;
    cols.janLowF.push(round("janLowF", c?.janLowF ?? null));
    cols.julHighF.push(round("julHighF", c?.julHighF ?? null));
    cols.openLandFt.push(round("openLandFt", openLandFt(land, ll)));
  }

  // 3. The drives, in a few OSRM tables.
  const places = pts.length
    ? await fetchPlaces(widen(box, K.placesMarginKm), deps.http, deps.endpoints.overpass)
    : { chains: [], otherGroceries: [], trailheads: [] };
  // The trailheads a screen reads: OpenStreetMap's, and the official lists (USFS, the state parks), searched around
  // each cell of the area's box, as a screen searches around its parcel.
  const official = pts.length
    ? await Promise.all(
        gridCentres(box).map((c) =>
          officialTrailheads(c, {
            http: deps.http,
            endpoints: deps.endpoints,
            ...(deps.places ? { places: deps.places } : {}),
          }),
        ),
      )
    : [];
  const trailheads = distinct([...places.trailheads, ...official.flat().map((t) => t.ll)]);
  const launches = pts.length
    ? await flatLaunches(box, deps.places ?? placesFromHttp(deps.http, deps.endpoints.places))
    : [];
  const drives = await pointDrives(
    pts,
    {
      ers: erDestinations(deps.ers, deps.erOverrides),
      chains: places.chains,
      otherGroceries: places.otherGroceries,
      airports: deps.airports.airports.map((a) => a.ll),
      trailheads,
      trailPoints: LONG_TRAILS.flatMap((t) => t.points.map((p): LatLon => [p.lat, p.lon])),
      launches,
    },
    deps.matrix ?? osrmMatrix({ http: deps.http, endpoints: deps.endpoints }),
  );
  for (const d of drives) {
    cols.erMin.push(d.erMin);
    cols.groceryMin.push(d.groceryMin);
    cols.airportMin.push(d.airportMin);
    cols.trailheadMin.push(d.trailheadMin);
    cols.longTrailMin.push(d.longTrailMin);
    cols.paddleMin.push(d.paddleMin);
  }

  const medians = Object.fromEntries(MEASURES.map((m) => [m, round(m, median(cols[m]))])) as Record<
    Measure,
    number | null
  >;
  const skyYear = deps.atlas.tiles.size ? (await [...deps.atlas.tiles.values()][0]!).year : null;
  const file: AreaFile = {
    version: AREA_FILE_VERSION,
    id: def.id,
    name: def.name,
    description: [def.description[0], def.description[1]],
    outline: outline.geometry,
    profiledAt: deps.today,
    sources: {
      landCover: "NLCD 2021 Land Cover (MRLC)",
      publicLand: "PAD-US, fee land (USGS)",
      elevation: `USGS 3DEP, ${scale.demResM ?? K.demResM} m`,
      sky: skyYear ? `Light-pollution atlas, ${skyYear}` : "Light-pollution atlas",
      climate: deps.climate ? "PRISM and NOAA normals, 1991–2020" : "none",
      er: `CMS Hospital General Information, ${deps.ers.released}${deps.erOverrides.length ? `; ${deps.erOverrides.length} checked by hand` : ""}`,
      airports: `FAA via BTS NTAD, ${deps.airports.effective}`,
      places: `OpenStreetMap via Overpass, ${deps.today}`,
      launches: "Paddle launches: OpenStreetMap and USFS, classified with NHD (the baked places)",
      drives: `OSRM, ${deps.today}`,
    },
    candidates: sample.candidates,
    thin: sample.thin,
    points: { ll: pts, ...cols },
    medians,
  };
  return { file, sample };
}
