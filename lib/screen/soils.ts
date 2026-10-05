/**
 * NRCS soils: the SDA component and map-unit queries, the dominant soil under a point, the bottomland veto,
 * plain-language readings, the bench re-pick and garden adjustments, and the soils step's flags.
 * Ported verbatim (proto L772–811, L1041–1074, L1202–1204, L1409–1450).
 *
 * The SQL is built only from the parcel polygon's numeric coordinates (never from user text), so the
 * query string can't be used to inject SQL. Its exact text matters: replay matches it byte for byte.
 */
import { area, booleanPointInPolygon } from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { z } from "zod";
import type { HttpClient } from "../http";
import { wktToGeo } from "../geo/wkt";
import { SCREEN_CONSTANTS } from "./config";
import { rcToLL } from "./dem";
import type { Summary } from "./sites";
import type { Dem, Endpoints, ScreenResult, SoilRow } from "./types";
import { M2_PER_ACRE, type LatLon } from "./util";

const K = SCREEN_CONSTANTS.soils;

export interface SoilDeps {
  http: HttpClient;
  endpoints: Endpoints;
  signal?: AbortSignal;
}

/** A map unit clipped to the parcel: its pieces, merged area, and the map colour it's drawn in. */
export interface SoilUnit {
  mukey: string;
  muname: string;
  acres: number;
  geos: Feature<Polygon | MultiPolygon>[];
  color: string;
}

const SdaTableSchema = z.looseObject({ Table: z.array(z.array(z.unknown())).optional() });

const ring = (parcel: Feature<Polygon>) =>
  parcel.geometry.coordinates[0]!.map((p) => `${p[0]} ${p[1]}`).join(",");

/** The component query (major components, aggregate attributes and the septic interpretation). */
export function componentQuery(parcel: Feature<Polygon>): string {
  const wkt = "polygon((" + ring(parcel) + "))";
  return `SELECT m.mukey, m.muname, m.farmlndcl, c.cokey, c.compname, c.comppct_r, c.drainagecl, c.hydricrating, c.slope_l, c.slope_h,
      a.brockdepmin, a.drclassdcd, a.hydgrpdcd, a.wtdepannmin, a.flodfreqdcd, a.engdwbdcd, a.engdwobdcd, a.engstafdcd, a.englrsdcd, ci.interphrc AS septic
 FROM mapunit m
 LEFT OUTER JOIN muaggatt a ON a.mukey = m.mukey
 INNER JOIN component c ON c.mukey = m.mukey AND c.majcompflag = 'Yes'
 LEFT OUTER JOIN cointerp ci ON ci.cokey = c.cokey AND ci.mrulename = 'ENG - Septic Tank Absorption Fields' AND ci.ruledepth = 0
 WHERE m.mukey IN (SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('${wkt}'))
 ORDER BY m.mukey, c.comppct_r DESC`;
}

/** The map-unit polygon query, clipped to the parcel by SQL Server spatial. */
export function polygonQuery(parcel: Feature<Polygon>): string {
  const wkt = `POLYGON((${ring(parcel)}))`;
  return `SELECT p.mukey, m.muname, p.mupolygongeo.STIntersection(geometry::STGeomFromText('${wkt}',4326)).STAsText() AS wkt
 FROM mupolygon p INNER JOIN mapunit m ON m.mukey = p.mukey
 WHERE p.mupolygongeo.STIntersects(geometry::STGeomFromText('${wkt}',4326)) = 1`;
}

async function sda(query: string, deps: SoilDeps): Promise<Response> {
  return deps.http.fetch(deps.endpoints.sda, {
    method: "POST",
    body: new URLSearchParams({ query, format: "JSON+COLUMNNAME" }),
    timeoutMs: 30_000,
    ...(deps.signal ? { signal: deps.signal } : {}),
  });
}

/** SDA's JSON+COLUMNNAME table: first row is the column names. */
function rowsOf(json: unknown): Record<string, unknown>[] {
  const rows = SdaTableSchema.parse(json).Table || [];
  if (rows.length < 2) return [];
  const cols = rows[0] as string[];
  return rows.slice(1).map((v) => Object.fromEntries(cols.map((c, i) => [c, v[i]])));
}

/** Major soil components on the parcel, one row per component (proto L772–789). */
export async function fetchSoils(parcel: Feature<Polygon>, deps: SoilDeps): Promise<SoilRow[]> {
  const r = await sda(componentQuery(parcel), deps);
  if (!r.ok) {
    let t = "";
    try {
      t = (await r.text())
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 160);
    } catch {
      /* body unreadable: report the status alone */
    }
    throw new Error(`SDA ${r.status}${t ? ": " + t : ""}`);
  }
  const seen = new Set<unknown>(),
    out: SoilRow[] = [];
  for (const o of rowsOf(await r.json())) {
    if (seen.has(o.cokey)) continue;
    seen.add(o.cokey);
    out.push(o as SoilRow);
  }
  return out;
}

/** The map units clipped to the parcel, pieces merged per unit, largest first, coloured (proto L798–811). */
export async function fetchSoilPolygons(parcel: Feature<Polygon>, deps: SoilDeps): Promise<SoilUnit[]> {
  const r = await sda(polygonQuery(parcel), deps);
  if (!r.ok) throw new Error("SDA polygons " + r.status);
  const out: { mukey: string; muname: string; geo: Feature<Polygon | MultiPolygon>; acres: number }[] = [];
  for (const o of rowsOf(await r.json())) {
    const g = wktToGeo(String(o.wkt || ""));
    if (!g) continue;
    const a = area(g) / M2_PER_ACRE;
    if (a < K.minUnitAcres) continue;
    out.push({ mukey: String(o.mukey), muname: String(o.muname), geo: g, acres: a });
  }
  // Merge pieces of the same map unit. A plain object on purpose: mukeys are numeric strings, so iteration
  // is in ascending numeric order, which decides ties in the (stable) sort below, exactly as in the prototype.
  const byKey: Record<string, Omit<SoilUnit, "color">> = {};
  for (const u of out) {
    const hit = byKey[u.mukey];
    if (hit) {
      hit.acres += u.acres;
      hit.geos.push(u.geo);
    } else byKey[u.mukey] = { mukey: u.mukey, muname: u.muname, acres: u.acres, geos: [u.geo] };
  }
  return Object.values(byKey)
    .sort((a, b) => b.acres - a.acres)
    .map((u, i) => ({ ...u, color: K.colors[i % K.colors.length]! }));
}

/** The dominant component under a point, from the clipped map units (proto L1409–1413). */
export function soilAt(units: SoilUnit[] | null, rows: SoilRow[] | null, ll: LatLon): SoilRow | null {
  if (!units) return null;
  const pt = [ll[1], ll[0]];
  const u = units.find((u) =>
    u.geos.some((g) => {
      try {
        return booleanPointInPolygon(pt, g);
      } catch {
        return false;
      }
    }),
  );
  if (!u) return null;
  return (
    (rows || [])
      .filter((x) => String(x.mukey) === u.mukey)
      .sort((a, b) => (+b.comppct_r! || 0) - (+a.comppct_r! || 0))[0] || null
  );
}

/** A reason string if NRCS says this soil is no place for a house (bottomland), else null. */
export function bottomland(c: SoilRow): string | null {
  const fl = (c.flodfreqdcd || "").toLowerCase(),
    dc = (c.drainagecl || c.drclassdcd || "").toLowerCase();
  if (/frequent|occasional/.test(fl)) return `${c.compname}: ${fl}ly flooded`;
  if (/^very poor|^poor/.test(dc)) return `${c.compname}: ${dc}`;
  if (/yes/i.test(c.hydricrating || "")) return `${c.compname}: hydric (wetland) soil`;
  return null;
}

export interface SoilReading {
  /** "House & septic" line. */
  house: string;
  /** "Garden & animals" line. */
  land: string;
  prime: boolean;
  statewide: boolean;
}

/** The two plain-language lines the Soils section shows per component (proto L1416–1450). */
export function soilRead(x: SoilRow, shallowBedrockCm: number): SoilReading {
  const dc = (x.drainagecl || x.drclassdcd || "").toLowerCase(),
    sep = (x.septic || x.engstafdcd || "").toLowerCase(),
    dwb = (x.engdwbdcd || "").toLowerCase(),
    dwob = (x.engdwobdcd || "").toLowerCase();
  const rock =
    x.brockdepmin != null && x.brockdepmin !== "" && +x.brockdepmin < K.readingBedrockMaxCm
      ? +x.brockdepmin
      : null;
  const wt = x.wtdepannmin != null && x.wtdepannmin !== "" ? +x.wtdepannmin : null,
    flood = (x.flodfreqdcd || "").toLowerCase();
  const slo =
    x.slope_h != null && x.slope_h !== ""
      ? +x.slope_h
      : +((x.muname || "").match(/to (\d+) percent/)?.[1] || NaN);
  const wet = /poor/.test(dc),
    damp = /somewhat poor/.test(dc),
    hydric = /yes/i.test(x.hydricrating || ""),
    steep = slo > K.readingSteepPct,
    sloped = slo > K.readingSlopedPct;
  const floods = !!flood && !/none/.test(flood),
    shallowWT = wt != null && wt < K.readingShallowWaterTableCm;
  const rate = (r: string) =>
    /not limited/.test(r)
      ? "fine"
      : /somewhat/.test(r)
        ? "workable"
        : /very limited/.test(r)
          ? "poor"
          : "unrated";
  const house: string[] = [];
  let land: string;
  const floodsBad = floods && /frequent|occasional/.test(flood);
  if (hydric || wet || floodsBad)
    house.push(
      floodsBad
        ? `Floods (${flood}) — no house, no drainfield.`
        : "Wet ground — no house, no drainfield. This is where water sits.",
    );
  else if (steep) house.push("Too steep for a house or drainfield without heavy earthwork.");
  else {
    const b = rate(dwb),
      nb = rate(dwob),
      s = rate(sep);
    if (nb === "fine" || nb === "workable")
      house.push(
        b === "fine"
          ? "Good house ground, basement OK."
          : nb === "fine"
            ? "Good house ground on a slab or crawlspace; NRCS rates basements " +
              (b === "poor" ? "poorly." : "as a stretch.")
            : "Buildable with some site work; skip the basement.",
      );
    else if (nb === "poor")
      house.push("NRCS rates even a slab-on-grade house here as very limited — expect real foundation work.");
    else house.push("No NRCS dwelling rating.");
    house.push(
      s === "fine"
        ? "A conventional septic should work."
        : s === "workable"
          ? sloped
            ? "Septic will likely need a pressure-dosed or engineered system."
            : "Septic probably needs a soil scientist's design, not a stock drainfield."
          : s === "poor"
            ? "NRCS rates a drainfield here very limited — plan on an alternative system and a perc test before offering."
            : "No septic rating; assume a soil scientist is needed.",
    );
  }
  if (rock && rock < shallowBedrockCm) house.push(`Rock at ${rock} cm — budget for excavation.`);
  if (shallowWT && !wet) house.push(`Seasonal water table within ${wt} cm.`);
  const fl = x.farmlndcl || "",
    prime = /prime farmland/i.test(fl) && !/not prime/i.test(fl),
    statewide = /statewide|local importance/i.test(fl);
  if (hydric) land = "Likely wetland. Leave it alone; maybe hay in a dry summer.";
  else if (wet || (floods && /frequent/.test(flood))) land = "Wet pasture or hay; a garden will drown here.";
  else if (damp || shallowWT) land = "Seasonally wet. Fine for pasture; raise garden beds.";
  else if (steep) land = "Woodlot. Goats will browse it; nothing else belongs there.";
  else if (sloped) land = "Pasture on contour, orchard, or goats. Garden only in terraces.";
  else
    land = prime
      ? "Best growing ground on the parcel — garden, orchard, chickens, hay."
      : statewide
        ? "Good garden and pasture ground."
        : "Usable pasture and garden ground.";
  return { house: house.join(" "), land, prime, statewide };
}

// ---------- the 'soils' step ----------

/** Components the screen ignores (water, urban land, pits, dumps). */
export const screenableRows = (rows: SoilRow[]): SoilRow[] =>
  rows.filter((x) => !K.skipComponents.test(x.compname || ""));

/** A house site with what the soils step learned about the ground under its pin. */
export type VettedBench = Summary & { relaxed: boolean; soil: SoilRow | null; veto: string | null };

/**
 * Bottomland veto and the re-picked best site (proto L1044–1047, L1053–1054): every bench gets the soil
 * under its pin; if any bench survives, the list is re-sorted (survivors first, then by area) and the best is
 * the first survivor; otherwise the order stays and the best is the (vetoed) largest.
 */
export function vetBenches(
  benches: (Summary & { relaxed: boolean })[],
  dFine: Dem,
  units: SoilUnit[] | null,
  rows: SoilRow[],
): { benches: VettedBench[]; best: VettedBench | null; flags: ScreenResult["flags"] } {
  const vetted: VettedBench[] = benches.map((b) => {
    const c = soilAt(units, rows, rcToLL(dFine, b.rc[0], b.rc[1]));
    return { ...b, soil: c, veto: c ? bottomland(c) : null };
  });
  if (!vetted.length) return { benches: vetted, best: null, flags: [] };
  let best = vetted[0]!;
  const ok = vetted.filter((b) => !b.veto);
  if (ok.length) {
    best = ok[0]!;
    vetted.sort((a, b) => Number(!!a.veto) - Number(!!b.veto) || b.acres - a.acres);
  }
  const flags: ScreenResult["flags"] = [];
  if (best.veto)
    flags.push({
      lvl: "warn",
      t: `Every bench sits on bottomland (${best.veto}). Nothing flat here is a homesite; the buildable ground is on the slopes.`,
    });
  else if (vetted.some((b) => b.veto))
    flags.push({
      lvl: "warn",
      t: `The largest flat ground is bottomland (${vetted.find((b) => b.veto)!.veto}) — excluded from the homesite ranking.`,
    });
  return { benches: vetted, best, flags };
}

/** The soil reading under a garden patch and its score adjustment (proto L1049–1051). */
export function gardenSoil(c: SoilRow | null): { soil: string | null; soilNote: string; adj: number } {
  const A = K.gardenAdj;
  const fl = (c && c.farmlndcl) || "",
    dc = ((c && (c.drainagecl || c.drclassdcd)) || "").toLowerCase();
  const prime = /prime farmland/i.test(fl) && !/not prime/i.test(fl);
  return {
    soil: c ? c.compname : null,
    soilNote: !c
      ? "no soil polygon"
      : /very poor|^poor/.test(dc)
        ? "poorly drained — drown risk"
        : prime
          ? "prime farmland"
          : /statewide|local/i.test(fl)
            ? "farmland of statewide importance"
            : dc || "unrated",
    adj: !c
      ? A.noSoil
      : /very poor|^poor/.test(dc)
        ? A.poorlyDrained
        : /somewhat poor/.test(dc)
          ? A.somewhatPoorly
          : prime
            ? A.prime
            : A.other,
  };
}

type Garden = NonNullable<ScreenResult["gardens"]>[number];

/** Gardens with their soil and adjusted score, best first. */
export function vetGardens(gardens: Garden[], units: SoilUnit[] | null, rows: SoilRow[]): Garden[] {
  return gardens
    .map((g) => {
      const s = gardenSoil(soilAt(units, rows, g.ll));
      return { ...g, ...s, finalScore: Math.min(K.gardenScoreCap, g.score * s.adj) };
    })
    .sort((a, b) => b.finalScore - a.finalScore);
}

/** The soils step's own flags: rock, poor drainage, septic (proto L1058–1073). */
export function soilFlags(
  rows: SoilRow[],
  units: SoilUnit[] | null,
  parcelAcres: number,
  shallowBedrockCm: number,
): ScreenResult["flags"] {
  if (!rows.length) return [{ lvl: "warn", t: "NRCS returned no soil components for this polygon." }];
  const flags: ScreenResult["flags"] = [];
  // Weight every soil by the acres it actually covers: unit acres × component share.
  const unitAcres: Record<string, number> = {};
  if (units) for (const u of units) unitAcres[u.mukey] = u.acres;
  const acresOf = (x: SoilRow) => {
    const ua = unitAcres[String(x.mukey)];
    return ua != null ? ua * ((+x.comppct_r! || 0) / 100) : null;
  };
  const sum = (list: SoilRow[]) => list.reduce((a, x) => a + (acresOf(x) ?? 0), 0),
    known = Object.keys(unitAcres).length > 0,
    share = (a: number) => (known ? a / parcelAcres : null);
  const shallow = rows.filter(
    (x) => x.brockdepmin != null && x.brockdepmin !== "" && +x.brockdepmin < shallowBedrockCm,
  );
  const poor = rows.filter((x) => /poor/i.test(x.drainagecl || x.drclassdcd || ""));
  const septicBad = rows.filter((x) => /very limited/i.test(x.septic || x.engstafdcd || "")),
    septicOK = rows.filter((x) => /not limited|somewhat/i.test(x.septic || x.engstafdcd || ""));
  const gentle = (x: SoilRow) => {
    const s =
      x.slope_h != null && x.slope_h !== ""
        ? +x.slope_h
        : +((x.muname || "").match(/to (\d+) percent/)?.[1] || K.septicGentleUnknownPct);
    return s <= K.septicGentleMaxPct;
  };
  const septicOKgentle = septicOK.filter(gentle),
    septicOKac = sum(septicOKgentle);
  const names = (list: SoilRow[]) => list.map((x) => x.compname).filter((v, i, a) => a.indexOf(v) === i);
  const say = (list: SoilRow[], ac: number) =>
    known ? `${ac.toFixed(1)} ac of ${names(list).join(", ")}` : list.map((x) => x.compname).join(", ");
  if (shallow.length && (!known || share(sum(shallow))! > K.shallowShareFlag))
    flags.push({
      lvl: "warn",
      t: `Bedrock under ${shallowBedrockCm} cm on ${say(shallow, sum(shallow))}. Budget rock excavation for septic, water line and footings.`,
    });
  if (poor.length && (!known || share(sum(poor))! > K.poorShareFlag))
    flags.push({
      lvl: "warn",
      t: `Poorly drained ground on ${say(poor, sum(poor))}. No house or drainfield there; it's pasture at best.`,
    });
  if (known && septicOKac < K.septicMinAcres && septicBad.length)
    flags.push({
      lvl: "warn",
      t: `Under an acre of gentle ground carries a workable NRCS septic rating (${septicOKac.toFixed(1)} ac). Plan on an alternative system and get a soil scientist out before an offer.`,
    });
  else if (!known && septicBad.length === rows.length)
    flags.push({
      lvl: "warn",
      t: "Every soil is rated 'very limited' for septic absorption fields. Get a soil scientist out before an offer.",
    });
  if (known && septicOKac >= K.septicMinAcres)
    flags.push({
      lvl: "good",
      t: `${septicOKac.toFixed(1)} acres of gentle ground with a workable NRCS septic rating (${names(septicOKgentle).join(", ")}). Site the drainfield there.`,
    });
  return flags;
}
