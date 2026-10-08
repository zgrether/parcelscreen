/**
 * The e2e's network (step 18a; plan phase-0-18-acceptance.md §1): the browser asks the real hosts, and this
 * answers from a reference parcel's recorded HAR, matched the way the Node replay matches
 * (test/support/replayFetch.ts requestKey: query parameters and form bodies order-insensitive). Playwright's
 * routeFromHAR matches them in recorded order, and the port doesn't send ArcGIS and SDA parameters in the
 * prototype's order.
 *
 * - localhost passes through (the app, its chunks, its own routes);
 * - a request found in the HAR is answered from it, repeats in recorded order (the last one repeats);
 * - a request to a host the HAR has data from, but not found in it, is a miss: aborted and listed, and the
 *   test fails on it, as ReplayMissError does in Node;
 * - anything else (basemap, ortho, parcel-line and terrain tiles) is aborted and listed, not failed.
 */
import type { BrowserContext, Route } from "@playwright/test";
import { requestKey, type HarEntry } from "../test/support/replayFetch";
import { DEFAULT_ENDPOINTS } from "../lib/screen/config";
import { loadFixture, type FixtureSlug } from "../test/support/fixtures";

/**
 * The state parcel services aren't screen data: the screen gets its boundary from History, and the map's
 * parcel-line tiles go to these hosts. (The HAR holds the prototype's own parcel lookup on VGIN.)
 */
const PARCEL_HOSTS = new Set(DEFAULT_ENDPOINTS.parcels.map((u) => new URL(u).host));

export interface ReplayLog {
  /** Requests answered from the HAR, by key. */
  served: string[];
  /** Data requests the HAR doesn't have: the test fails on any. */
  misses: string[];
  /** Other requests, aborted (tiles and the like): listed for the PR, not failed. */
  aborted: string[];
}

// Hop-by-hop or encoding headers that no longer describe the decoded body handed back.
const DROP_HEADERS = new Set(["content-encoding", "content-length", "transfer-encoding", "connection"]);

function entryKey(e: HarEntry): string {
  const pd = e.request.postData;
  const body =
    pd?.text ??
    (pd?.params ? new URLSearchParams(pd.params.map((p) => [p.name, p.value ?? ""])).toString() : null);
  return requestKey(e.request.method, e.request.url, body, pd?.mimeType);
}

function fulfil(route: Route, e: HarEntry, origin: string | undefined): Promise<void> {
  const { status, headers, content } = e.response;
  const h: Record<string, string> = {};
  for (const { name, value } of headers) {
    const n = name.toLowerCase();
    if (!DROP_HEADERS.has(n) && !n.startsWith("access-control-")) h[n] = value;
  }
  // CORS for this page: a recorded allow-origin names the recorder's own origin (http://127.0.0.1:<port>),
  // which the browser rejects here as "Failed to fetch".
  h["access-control-allow-origin"] = origin ?? "*";
  if (origin) h["access-control-allow-credentials"] = "true";
  const body =
    content.text == null
      ? Buffer.alloc(0)
      : content.encoding === "base64"
        ? Buffer.from(content.text, "base64")
        : Buffer.from(content.text, "utf8");
  return route.fulfill({ status, headers: h, body });
}

/** Routes every request in `context` through the parcels' HARs (one fixture, or several for switching). */
export async function replayHar(
  context: BrowserContext,
  slugs: FixtureSlug | readonly FixtureSlug[],
  /** Holds the first response whose key matches for `ms` (a slow service; the 17e watchdog test). */
  delayFirst?: { match: RegExp; ms: number },
): Promise<ReplayLog> {
  let delayed = false;
  const entries = (typeof slugs === "string" ? [slugs] : slugs).flatMap(
    (x) => loadFixture(x).har.log.entries,
  );
  const queues = new Map<string, HarEntry[]>();
  const dataHosts = new Set<string>();
  for (const e of entries) {
    if (e.response.status === 0) continue; // aborted during recording: never a real answer
    const k = entryKey(e);
    queues.set(k, [...(queues.get(k) ?? []), e]);
    const host = new URL(e.request.url).host;
    if (!PARCEL_HOSTS.has(host)) dataHosts.add(host);
  }
  const served = new Map<string, number>();
  const log: ReplayLog = { served: [], misses: [], aborted: [] };

  await context.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return route.continue();
    if (req.method() === "OPTIONS")
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST",
          "access-control-allow-headers": "*",
        },
      });
    const key = requestKey(req.method(), req.url(), req.postData(), req.headers()["content-type"]);
    const q = queues.get(key);
    if (q) {
      const n = served.get(key) ?? 0;
      served.set(key, n + 1);
      log.served.push(key);
      if (delayFirst && !delayed && delayFirst.match.test(key)) {
        delayed = true;
        await new Promise((r) => setTimeout(r, delayFirst.ms));
      }
      return fulfil(route, q[Math.min(n, q.length - 1)]!, req.headers()["origin"]);
    }
    (dataHosts.has(url.host) ? log.misses : log.aborted).push(key);
    return route.abort();
  });
  return log;
}
