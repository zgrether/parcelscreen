/**
 * An area's drive times (step 13, docs/plans/step-13-area-catalog.md §3.2): each point's drives to its nearest ERs,
 * groceries, commercial airports, trailheads and long-trail access points, by straight line first, then timed in OSRM
 * tables of many points to many destinations, at most areas.tableMaxCoords coordinates each: a few requests an area.
 * The grocery drive is the Town row's: the nearest chain's, or a non-chain's when it's closerMinMin nearer.
 */
import { SCREEN_CONSTANTS } from "../screen/config";
import { CancelledError } from "../http";
import { tableUrl, type DriveDeps } from "../screen/drive";
import type { LatLon } from "../geo/types";

const K = SCREEN_CONSTANTS.areas;

/** Where an area's drives go, by kind. */
export interface Destinations {
  ers: readonly LatLon[];
  /** Supermarkets of a big chain (config.places.bigGrocer), and the others. */
  chains: readonly LatLon[];
  otherGroceries: readonly LatLon[];
  airports: readonly LatLon[];
  trailheads: readonly LatLon[];
  trailPoints: readonly LatLon[];
}

export interface PointDrives {
  erMin: number | null;
  groceryMin: number | null;
  airportMin: number | null;
  trailheadMin: number | null;
  longTrailMin: number | null;
}

/** Minutes from each source to each destination; null where OSRM can't route it. Null when the table fails. */
export type Matrix = (
  sources: readonly LatLon[],
  destinations: readonly LatLon[],
) => Promise<(number | null)[][] | null>;

/** Kilometres, flat-earth: enough to rank destinations a few dozen km away. */
const km = (a: LatLon, b: LatLon) =>
  Math.hypot((b[0] - a[0]) * 111.2, (b[1] - a[1]) * 111.32 * Math.cos((a[0] * Math.PI) / 180));

/** The `k` nearest of `list` to `from`, by straight line. */
export function nearest(from: LatLon, list: readonly LatLon[], k: number): LatLon[] {
  return list
    .map((ll) => ({ ll, d: km(from, ll) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, k)
    .map((x) => x.ll);
}

type Kind = "er" | "chain" | "other" | "airport" | "trailhead" | "trail";
const keyOf = (ll: LatLon) => `${ll[0]},${ll[1]}`;

/** What a point wants timed, by kind. */
function wants(p: LatLon, d: Destinations): Record<Kind, LatLon[]> {
  const n = K.nearest;
  // No chain anywhere near: the nearest stores of any kind stand in, as the screen's drives do.
  const chains = d.chains.length ? d.chains : d.otherGroceries;
  return {
    er: nearest(p, d.ers, n.er),
    chain: nearest(p, chains, n.groceryChain),
    other: d.chains.length ? nearest(p, d.otherGroceries, n.groceryAny) : [],
    airport: nearest(p, d.airports, n.airport),
    trailhead: nearest(p, d.trailheads, n.trailhead),
    trail: nearest(p, d.trailPoints, n.longTrail),
  };
}

/**
 * Batches of points whose sources plus the union of their wanted destinations fit in one table. Points go in their
 * given order, so neighbours (which share destinations) should come together.
 */
export function batches(
  points: readonly LatLon[],
  want: readonly Set<string>[],
  max: number = K.tableMaxCoords,
): number[][] {
  const out: number[][] = [];
  let cur: number[] = [];
  let dest = new Set<string>();
  points.forEach((_, i) => {
    const union = new Set([...dest, ...want[i]!]);
    if (cur.length && cur.length + 1 + union.size > max) {
      out.push(cur);
      cur = [];
      dest = new Set(want[i]);
    } else dest = union;
    cur.push(i);
  });
  if (cur.length) out.push(cur);
  return out;
}

/** The Town row's grocery drive (card.ts town; drive.ts CLOSER_GROCERY). */
export function groceryDrive(chainMin: number | null, otherMin: number | null): number | null {
  if (chainMin === null) return otherMin;
  if (otherMin !== null && chainMin - otherMin >= SCREEN_CONSTANTS.grocery.closerMinMin) return otherMin;
  return chainMin;
}

const minOf = (xs: (number | null)[]): number | null => {
  const ok = xs.filter((x): x is number => x !== null);
  return ok.length ? Math.min(...ok) : null;
};

/** Every point's drives. A table that fails leaves its points' drives null. */
export async function pointDrives(
  points: readonly LatLon[],
  d: Destinations,
  matrix: Matrix,
): Promise<PointDrives[]> {
  const w = points.map((p) => wants(p, d));
  const sets = w.map((x) => new Set(Object.values(x).flat().map(keyOf)));
  const out: PointDrives[] = points.map(() => ({
    erMin: null,
    groceryMin: null,
    airportMin: null,
    trailheadMin: null,
    longTrailMin: null,
  }));
  for (const batch of batches(points, sets)) {
    const destKeys = [...new Set(batch.flatMap((i) => [...sets[i]!]))];
    const dest = destKeys.map((k) => k.split(",").map(Number) as LatLon);
    const mins = await matrix(
      batch.map((i) => points[i]!),
      dest,
    );
    if (!mins) continue;
    batch.forEach((i, row) => {
      const t = (kind: Kind) =>
        minOf(w[i]![kind].map((ll) => mins[row]?.[destKeys.indexOf(keyOf(ll))] ?? null));
      out[i] = {
        erMin: t("er"),
        groceryMin: groceryDrive(t("chain"), t("other")),
        airportMin: t("airport"),
        trailheadMin: t("trailhead"),
        longTrailMin: t("trail"),
      };
    });
  }
  return out;
}

const at = (ll: LatLon) => `${ll[1]},${ll[0]}`;

/** OSRM's table service, many sources to many destinations, in minutes (drive.ts driveTable's arithmetic). */
export function osrmMatrix(deps: DriveDeps): Matrix {
  return async (sources, destinations) => {
    const url = tableUrl(deps.endpoints.osrm);
    if (!url || !sources.length || !destinations.length) return null;
    const s = sources.map((_, i) => i).join(";");
    const t = destinations.map((_, i) => sources.length + i).join(";");
    try {
      const r = await deps.http.fetch(
        `${url}/${[...sources, ...destinations].map(at).join(";")}?sources=${s}&destinations=${t}&annotations=duration`,
        { timeoutMs: SCREEN_CONSTANTS.drive.timeoutMs, ...(deps.signal ? { signal: deps.signal } : {}) },
      );
      if (!r.ok) return null;
      const j = (await r.json()) as { code?: string; durations?: (number | null)[][] };
      if (j.code !== "Ok" || j.durations?.length !== sources.length) return null;
      return j.durations.map((row) => row.map((sec) => (sec == null ? null : Math.round(sec / 60))));
    } catch (e) {
      if (e instanceof CancelledError) throw e;
      return null;
    }
  };
}
