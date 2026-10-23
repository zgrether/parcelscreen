/**
 * Drive times by the public OSRM router: the nearest of the top three emergency departments (CMS's list with the
 * hand-checked additions, §9.69) and big-name groceries, then each anchor. Ported from the prototype (proto L883–889, L1138–1144), plus a
 * nearer non-chain grocery when there is one (owner, #81; CLOSER_GROCERY).
 *
 * Follow-up 54 (owner, #123): the drives start where the scored driveway meets the road (driveStart), and the nearest
 * trailheads are driven to as well, to their parking where it's tagged. Every destination is timed in one request to
 * OSRM's table service; when that fails, one route request each, sequential as the prototype's were, which lib/http
 * spaces one per second for the volunteer-run demo server.
 */
import { distance } from "@turf/turf";
import { CancelledError, type HttpClient } from "../http";
import { SCREEN_CONSTANTS } from "./config";
import { CLOSER_GROCERY, NEAREST_HOSPITAL, REAL_GROCERY, type DriveEntry } from "./driveList";
import type { HospitalCandidate } from "./hospitals";
import type { Anchor, DrawnInput, DriveFrom, Endpoints, ScreenResult } from "./types";
import type { LatLon } from "./util";

const K = SCREEN_CONSTANTS.drive;
const M_PER_MI = 1609.34;

export interface DriveDeps {
  http: HttpClient;
  endpoints: Endpoints;
  signal?: AbortSignal;
}

type Leg = { min: number; mi: number };
const leg = (seconds: number, metres: number): Leg => ({
  min: Math.round(seconds / 60),
  mi: +(metres / M_PER_MI).toFixed(1),
});
const at = (ll: LatLon) => `${ll[1]},${ll[0]}`;

/** Minutes and miles by road, or null when OSRM can't route it (or is down). */
export async function drive(from: LatLon, to: LatLon, deps: DriveDeps): Promise<Leg | null> {
  try {
    const r = await deps.http.fetch(`${deps.endpoints.osrm}/${at(from)};${at(to)}?overview=false`, {
      timeoutMs: K.timeoutMs,
      ...(deps.signal ? { signal: deps.signal } : {}),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { routes?: { duration: number; distance: number }[] };
    const rt = j.routes && j.routes[0];
    if (!rt) return null;
    return leg(rt.duration, rt.distance);
  } catch (e) {
    if (e instanceof CancelledError) throw e;
    return null;
  }
}

/** OSRM's table service for the route URL in Settings; null when that isn't OSRM's /route/v1/ form. */
export const tableUrl = (routeUrl: string): string | null =>
  routeUrl.includes("/route/v1/") ? routeUrl.replace("/route/v1/", "/table/v1/") : null;

/**
 * Every destination timed in one request (OSRM's table service, follow-up 54): a leg each, null where OSRM can't route
 * it, and how far OSRM moved the start to its nearest road. Null when the table doesn't answer.
 */
export async function driveTable(
  from: LatLon,
  to: readonly LatLon[],
  deps: DriveDeps,
): Promise<{ legs: (Leg | null)[]; snapM: number | null } | null> {
  const url = tableUrl(deps.endpoints.osrm);
  if (!url || !to.length) return null;
  try {
    const coords = [from, ...to].map(at).join(";");
    const dest = to.map((_, i) => i + 1).join(";");
    const r = await deps.http.fetch(
      `${url}/${coords}?sources=0&destinations=${dest}&annotations=duration,distance`,
      { timeoutMs: K.timeoutMs, ...(deps.signal ? { signal: deps.signal } : {}) },
    );
    if (!r.ok) return null;
    const j = (await r.json()) as {
      code?: string;
      durations?: (number | null)[][];
      distances?: (number | null)[][];
      sources?: { distance?: number }[];
    };
    const d = j.durations?.[0],
      m = j.distances?.[0];
    if (j.code !== "Ok" || !d || !m || d.length !== to.length || m.length !== to.length) return null;
    return {
      legs: to.map((_, i) => (d[i] != null && m[i] != null ? leg(d[i]!, m[i]!) : null)),
      snapM: typeof j.sources?.[0]?.distance === "number" ? j.sources[0].distance : null,
    };
  } catch (e) {
    if (e instanceof CancelledError) throw e;
    return null;
  }
}

/** A step of OSRM's route, as far as the track reading needs it. */
interface RouteStep {
  name?: string;
  ref?: string;
  distance: number;
  duration: number;
}

/**
 * The route out's first miles on unnamed or track ways (owner, #123: "the first 5.7 mi on unnamed tracks"): the
 * leading steps that have neither a name nor a route number, or no route number and no more than drive.trackMph. OSRM
 * gives no road class, so a track is read from its speed: its car profile drives Macks's at about 6 mph.
 */
export function leadingTrackMi(steps: readonly RouteStep[]): number {
  let m = 0;
  for (const s of steps) {
    if (s.distance <= 0) continue;
    const mph = s.duration > 0 ? s.distance / M_PER_MI / (s.duration / 3600) : Infinity;
    const track = !s.ref && (!s.name || mph <= K.trackMph);
    if (!track) break;
    m += s.distance;
  }
  return +(m / M_PER_MI).toFixed(1);
}

/** One route request with its steps, to read the route out's first miles (leadingTrackMi); null when it can't. */
async function trackLead(
  from: LatLon,
  to: LatLon,
  deps: DriveDeps,
): Promise<{ mi: number; snapM: number | null } | null> {
  try {
    const r = await deps.http.fetch(
      `${deps.endpoints.osrm}/${at(from)};${at(to)}?overview=false&steps=true`,
      {
        timeoutMs: K.timeoutMs,
        ...(deps.signal ? { signal: deps.signal } : {}),
      },
    );
    if (!r.ok) return null;
    const j = (await r.json()) as {
      routes?: { legs?: { steps?: RouteStep[] }[] }[];
      waypoints?: { distance?: number }[];
    };
    const steps = j.routes?.[0]?.legs?.[0]?.steps;
    if (!steps) return null;
    const snap = j.waypoints?.[0]?.distance;
    return { mi: leadingTrackMi(steps), snapM: typeof snap === "number" ? snap : null };
  } catch (e) {
    if (e instanceof CancelledError) throw e;
    return null;
  }
}

type Place = { name: string; ll: LatLon };

/** The near step's session-only lists, wider than what the result stores. Each defaults to the stored one. */
export interface DrivePools {
  /**
   * Every non-chain supermarket found, nearest first, beyond the six the report lists (owner, #81: Macks's
   * Slaughters' is the tenth nearest).
   */
  otherGrocers?: readonly Place[];
  /** Every candidate hospital, nearest first: the ERs within near.hospitalKm (§9.69). */
  hospitals?: readonly HospitalCandidate[];
}

/** A trailhead to drive to (follow-up 54): its index in near.trailheads, and where the drive ends. */
export interface TrailTarget {
  index: number;
  ll: LatLon;
  /** Its parking (trailheadParking.ts), or null: the drive ends at the point. */
  parkingLl: LatLon | null;
}

type TrailDrive = NonNullable<NonNullable<ScreenResult["near"]>["trailheads"][number]["drive"]>;

export interface Drives {
  drives: NonNullable<ScreenResult["drives"]>;
  closerGrocery: DriveEntry | null;
  /** By near.trailheads index, for the targets OSRM routed. */
  trailDrives: Map<number, TrailDrive>;
  snapM: number | null;
  trackMi: number | null;
}

/**
 * The trailheads to drive to (follow-up 54): the nearest drive.trailheadCandidates by straight line from where the
 * drives start, by index into near.trailheads.
 */
export function trailCandidates(
  trailheads: readonly { ll: LatLon }[],
  from: LatLon,
): { index: number; ll: LatLon; km: number }[] {
  return trailheads
    .map((t, index) => ({
      index,
      ll: t.ll,
      km: distance([from[1], from[0]], [t.ll[1], t.ll[0]], { units: "kilometers" }),
    }))
    .sort((a, b) => a.km - b.km)
    .slice(0, K.trailheadCandidates);
}

/** The 'drive' step. Throws when nothing could be routed at all. */
export async function driveTimes(
  from: LatLon,
  near: ScreenResult["near"] | undefined,
  anchors: Anchor[],
  deps: DriveDeps,
  pools: DrivePools = {},
  trails: readonly TrailTarget[] = [],
): Promise<Drives> {
  const hospitals: readonly HospitalCandidate[] = near ? (pools.hospitals ?? near.hospitals) : [];
  const er = hospitals.filter((h) => h.er === true);
  const hospitalList = (er.length ? er : hospitals).slice(0, K.candidates);
  const big = near ? near.grocers.filter((g) => g.big) : [];
  const groceryList = near ? (big.length ? big : near.grocers).slice(0, K.candidates) : [];
  const otherList =
    near && big.length
      ? (pools.otherGrocers ?? near.grocers.filter((g) => !g.big)).slice(0, K.candidates)
      : [];
  const anchorLl = anchors.map((a): LatLon => [a.lat, a.lon]);
  const trailEnds = trails.map((t) => t.parkingLl ?? t.ll);

  // One table request for every destination; when it fails, a route request each, as asked.
  const all = [...hospitalList, ...groceryList, ...otherList].map((p) => p.ll).concat(anchorLl, trailEnds);
  const keys = [...new Set(all.map(at))];
  const table = await driveTable(
    from,
    keys.map((k) => {
      const [lon, lat] = k.split(",").map(Number);
      return [lat!, lon!] as LatLon;
    }),
    deps,
  );
  const known = new Map<string, Leg | null>(table ? keys.map((k, i) => [k, table.legs[i]!]) : []);
  const timeTo = async (ll: LatLon): Promise<Leg | null> => {
    const k = at(ll);
    if (!known.has(k)) known.set(k, await drive(from, ll, deps));
    return known.get(k)!;
  };

  const drives: NonNullable<ScreenResult["drives"]> = [];
  let firstLl: LatLon | null = null;
  const quickest = async <P extends Place>(list: readonly P[]) => {
    let bestD: (Leg & { name: string; place: P }) | null = null;
    for (const x of list) {
      const d = await timeTo(x.ll);
      if (d && (!bestD || d.min < bestD.min)) bestD = { ...d, name: x.name, place: x };
    }
    return bestD;
  };
  let closer: DriveEntry | null = null;
  if (near) {
    // A2c (owner, 2026-10-09): prefer hospitals with an emergency department, as the grocery rule prefers chains.
    // Since §9.69 every candidate is one (CMS's list and the additions); "not-listed" and "unknown" are kept for
    // results stored before it, and for a pool given without the status.
    const h = await quickest(hospitalList);
    if (h) {
      firstLl ??= h.place.ll;
      drives.push({
        label: NEAREST_HOSPITAL,
        name: h.name,
        min: h.min,
        mi: h.mi,
        er: h.place.er === true ? "yes" : h.place.er === false ? "not-listed" : "unknown",
      });
    }
    const chain = await quickest(groceryList);
    if (chain) {
      firstLl ??= chain.place.ll;
      drives.push({ label: REAL_GROCERY, name: chain.name, min: chain.min, mi: chain.mi, er: null });
    }
    // Owner, #81: the chain rule stands; a non-chain grocery that's clearly nearer by road is added after it.
    if (chain && big.length) {
      const other = await quickest(otherList);
      if (other && chain.min - other.min >= SCREEN_CONSTANTS.grocery.closerMinMin)
        closer = { label: CLOSER_GROCERY, name: other.name, min: other.min, mi: other.mi, er: null };
    }
  }
  for (const [i, a] of anchors.entries()) {
    const d = await timeTo(anchorLl[i]!);
    if (d) {
      firstLl ??= anchorLl[i]!;
      drives.push({ label: a.name, name: "", ...d, er: null });
    }
  }
  const trailDrives = new Map<number, TrailDrive>();
  for (const [i, t] of trails.entries()) {
    const d = await timeTo(trailEnds[i]!);
    if (!d) continue;
    firstLl ??= trailEnds[i]!;
    trailDrives.set(t.index, {
      ...d,
      km: distance([from[1], from[0]], [t.ll[1], t.ll[0]], { units: "kilometers" }),
      to: t.parkingLl ? "parking" : "point",
      parkingLl: t.parkingLl,
    });
  }
  if (!drives.length && !trailDrives.size) throw new Error("OSRM routing unavailable — straight-line only");
  // The route out, read once (follow-up 54): its first miles on tracks, and the snap when the table didn't give it.
  const lead = firstLl ? await trackLead(from, firstLl, deps) : null;
  return {
    drives,
    // The report shows the closer grocery with the grocery's row, not as its own.
    closerGrocery: closer,
    trailDrives,
    snapM: table?.snapM ?? lead?.snapM ?? null,
    trackMi: lead && lead.mi >= K.trackMinMi ? lead.mi : null,
  };
}

/**
 * Where the drives start (follow-up 54; owner, #123): the scored route's road entrance; a drawn line's road end (its
 * entrance is the end away from the road); the nearest road point when there's no frontage; the parcel's centre when
 * no driveway was routed. With a line chosen as the driveway (WF6), its route's: the line's road end.
 */
export function driveStart(
  driveway: ScreenResult["driveway"] | undefined,
  lines: readonly DrawnInput[],
  centre: LatLon,
  chosenLine: string | null = null,
): Omit<DriveFrom, "snapM" | "trackMi" | "kept"> {
  const chosenAt = chosenLine ? lines.findIndex((l) => l.id === chosenLine) : -1;
  const mine =
    chosenAt >= 0
      ? driveway?.routes.find((r) => {
          const e = driveway.entrances[r.entranceIndex];
          return e?.source === "drawn" && e.line === chosenAt;
        })
      : undefined;
  const rt = mine ?? driveway?.routes[0];
  const e = rt ? driveway!.entrances[rt.entranceIndex] : undefined;
  if (!e) return { ll: centre, kind: "centre", road: null, line: null, gapFt: null };
  if (e.source === "drawn" && e.line != null && lines[e.line]) {
    const l = lines[e.line]!;
    const a = l.line[0]!,
      b = l.line[l.line.length - 1]!;
    const far = (p: LatLon) => distance([p[1], p[0]], [e.ll[1], e.ll[0]], { units: "meters" });
    return { ll: far(a) >= far(b) ? a : b, kind: "drawn", road: null, line: l.kind, gapFt: null };
  }
  if (e.fallback) return { ll: e.ll, kind: "nearestRoad", road: e.name, line: null, gapFt: e.gapFt ?? null };
  return { ll: e.ll, kind: "entrance", road: e.name, line: null, gapFt: null };
}
