/**
 * The area profiler's runs outside the app (step 13, docs/plans/step-13-area-catalog.md §3.5, §10): the deps a live
 * or replayed run takes, the recorded Grayson Highlands run CI replays, and a fetch that answers from recordings first
 * and records what they lack.
 */
import { join, resolve } from "node:path";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { createHttpClient, type Clock } from "@/lib/http";
import { DEFAULT_ENDPOINTS } from "@/lib/screen/config";
import { DemCache } from "@/lib/screen/dem";
import { loadClimate } from "@/lib/screen/climate";
import { AtlasCache } from "@/lib/screen/sky";
import { SERVER_USER_AGENT } from "@/lib/server/http";
import { loadAirports, loadErList } from "@/lib/areas/data";
import type { ProfileDeps, ProfileScale } from "@/lib/areas/profile";
import { createReplayFetch, ReplayMissError, type Har, type HarEntry } from "./replayFetch";

/** The recorded run: Grayson Highlands, small (40 points, a 90 m DEM, land cover at a quarter of NLCD's 30 m). */
export const RECORDED = {
  id: "grayson-highlands",
  scale: { points: 40, demResM: 90, landCoverScale: 0.25 } satisfies ProfileScale,
  today: "2026-10-22",
};
export const AREA_HAR = resolve(process.cwd(), "test", "fixtures", "areas", RECORDED.id, "network.har");
/** Mud Creek's recording, replayed first: the requests the two share (the sky atlas's tile) aren't recorded twice. */
export const MUD_HAR = join(process.cwd(), "test", "fixtures", "grayson-mud-creek-6273", "network-port.har");

export async function profileDeps(
  fetchImpl: typeof fetch,
  clock: Clock,
  today: string,
): Promise<ProfileDeps> {
  return {
    http: createHttpClient({ env: "node", fetchImpl, clock, userAgent: SERVER_USER_AGENT }),
    endpoints: DEFAULT_ENDPOINTS,
    atlas: new AtlasCache(),
    dems: new DemCache(),
    climate: await loadClimate(),
    ers: await loadErList(),
    airports: await loadAirports(),
    today,
  };
}

const DROP = new Set(["content-encoding", "content-length", "transfer-encoding", "connection"]);
const bodyOf = (b: BodyInit | null | undefined): string | null =>
  b == null ? null : typeof b === "string" ? b : b instanceof URLSearchParams ? b.toString() : null;

/** Answers from `har` when it can; otherwise asks `live` and keeps the exchange in `added`. */
export function recordingFetch(har: Har, live: typeof fetch, added: HarEntry[]): typeof fetch {
  const replay = createReplayFetch(har);
  return (async (input: string | URL | Request, init?: RequestInit) => {
    try {
      return await replay(input, init);
    } catch (e) {
      if (!(e instanceof ReplayMissError)) throw e;
    }
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = bodyOf(init?.body);
    const headers = new Headers(init?.headers);
    if (body && !headers.has("content-type"))
      headers.set("content-type", "application/x-www-form-urlencoded");
    const r = await live(url, {
      method,
      ...(body ? { body } : {}),
      headers,
      ...(init?.signal ? { signal: init.signal } : {}),
    });
    const bytes = Buffer.from(await r.arrayBuffer());
    const kept: [string, string][] = [...r.headers].filter(([n]) => !DROP.has(n.toLowerCase()));
    added.push({
      startedDateTime: new Date().toISOString(),
      request: {
        method,
        url,
        headers: [...headers].map(([name, value]) => ({ name, value })),
        ...(body ? { postData: { mimeType: headers.get("content-type")!, text: body } } : {}),
      },
      response: {
        status: r.status,
        statusText: r.statusText,
        headers: kept.map(([name, value]) => ({ name, value })),
        content: {
          size: bytes.length,
          mimeType: r.headers.get("content-type") ?? "",
          text: bytes.toString("base64"),
          encoding: "base64",
        },
      },
    });
    return new Response(r.status === 204 || r.status === 304 ? null : bytes, {
      status: r.status,
      statusText: r.statusText,
      headers: kept,
    });
  }) as typeof fetch;
}

export type Outline = Feature<Polygon | MultiPolygon>;
