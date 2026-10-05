/**
 * Drive times from the parcel centroid by the public OSRM router: the nearest of the top three hospitals
 * and big-name groceries, then each anchor. Ported verbatim (proto L883–889, L1138–1144). Requests stay
 * sequential, as in the prototype; lib/http spaces them one per second for the volunteer-run demo server.
 */
import { CancelledError, type HttpClient } from "../http";
import { SCREEN_CONSTANTS } from "./config";
import type { Anchor, Endpoints, ScreenResult } from "./types";
import type { LatLon } from "./util";

const K = SCREEN_CONSTANTS.drive;

export interface DriveDeps {
  http: HttpClient;
  endpoints: Endpoints;
  signal?: AbortSignal;
}

/** Minutes and miles by road, or null when OSRM can't route it (or is down). */
export async function drive(
  from: LatLon,
  to: LatLon,
  deps: DriveDeps,
): Promise<{ min: number; mi: number } | null> {
  try {
    const r = await deps.http.fetch(
      `${deps.endpoints.osrm}/${from[1]},${from[0]};${to[1]},${to[0]}?overview=false`,
      {
        timeoutMs: K.timeoutMs,
        ...(deps.signal ? { signal: deps.signal } : {}),
      },
    );
    if (!r.ok) return null;
    const j = (await r.json()) as { routes?: { duration: number; distance: number }[] };
    const rt = j.routes && j.routes[0];
    if (!rt) return null;
    return { min: Math.round(rt.duration / 60), mi: +(rt.distance / 1609.34).toFixed(1) };
  } catch (e) {
    if (e instanceof CancelledError) throw e;
    return null;
  }
}

type Place = { name: string; ll: LatLon };

/** The 'drive' step. Throws when nothing could be routed at all. */
export async function driveTimes(
  from: LatLon,
  near: ScreenResult["near"] | undefined,
  anchors: Anchor[],
  deps: DriveDeps,
): Promise<NonNullable<ScreenResult["drives"]>> {
  const drives: NonNullable<ScreenResult["drives"]> = [];
  const tryN = async (list: Place[], label: string, n: number) => {
    let bestD: { min: number; mi: number; name: string } | null = null;
    for (const x of list.slice(0, n)) {
      const d = await drive(from, x.ll, deps);
      if (d && (!bestD || d.min < bestD.min)) bestD = { ...d, name: x.name };
    }
    if (bestD) drives.push({ label, ...bestD });
  };
  if (near) {
    await tryN(near.hospitals, "Nearest hospital", K.candidates);
    const big = near.grocers.filter((g) => g.big);
    await tryN(big.length ? big : near.grocers, "Nearest real grocery", K.candidates);
  }
  for (const a of anchors) {
    const d = await drive(from, [a.lat, a.lon], deps);
    if (d) drives.push({ label: a.name, name: "", ...d });
  }
  if (!drives.length) throw new Error("OSRM routing unavailable — straight-line only");
  return drives;
}
