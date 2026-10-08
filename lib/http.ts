/**
 * The one HTTP client every external fetch goes through (CLAUDE.md "External fetches go through lib/http.ts";
 * docs/plans/phase-0.md §2c). Replaces the prototype's `xfetch` (proto L712–717).
 *
 * - Per-host queue: at most `maxConcurrent` requests in flight and at least `minIntervalMs` between request
 *   starts. Volunteer-run services (OSRM demo, Photon, Overpass mirrors) default to 1 request/second.
 * - 429 / 503: retried up to `maxRetries` times, honouring Retry-After (seconds or HTTP date), else 2 s, 5 s.
 * - Opt-in, per request: one retry with a longer limit after a timeout (`retryTimeoutMs`), and optionally
 *   after a network failure or another 5xx too (`retryTransient`).
 * - Every attempt has a timeout (TimeoutError, message "timed out"); an aborted caller signal rejects with
 *   CancelledError ("cancelled"). The messages match the prototype's, which the step list displays.
 * - env "browser": no custom headers (User-Agent can't be set from a page, and extra headers trigger CORS
 *   preflights some ArcGIS servers reject); the browser's own HTTP cache handles revalidation.
 *   env "node": identifying User-Agent, and GET responses carrying an ETag / Last-Modified are revalidated
 *   with conditional requests from an in-memory cache.
 *
 * Responses with any other status are returned as-is: connectors check `ok` themselves, because their
 * error messages (e.g. "3DEP 500", SDA's error text) are part of what the user sees.
 */

export class CancelledError extends Error {
  constructor() {
    super("cancelled");
    this.name = "CancelledError";
  }
}

export class TimeoutError extends Error {
  constructor(readonly url: string) {
    super("timed out");
    this.name = "TimeoutError";
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly host: string,
    message?: string,
  ) {
    super(message ?? `${host} HTTP ${status}`);
    this.name = "HttpError";
  }
}

export interface HostPolicy {
  maxConcurrent: number;
  minIntervalMs: number;
}

/** 1 request/second for the volunteer-run public services; everything else 4 at a time, unthrottled. */
const VOLUNTEER: HostPolicy = { maxConcurrent: 1, minIntervalMs: 1000 };
export const DEFAULT_POLICY: HostPolicy = { maxConcurrent: 4, minIntervalMs: 0 };
export const DEFAULT_HOST_POLICIES: Readonly<Record<string, HostPolicy>> = {
  "router.project-osrm.org": VOLUNTEER,
  "photon.komoot.io": VOLUNTEER,
  "overpass.kumi.systems": VOLUNTEER,
  "overpass.openstreetmap.fr": VOLUNTEER,
  "overpass-api.de": VOLUNTEER,
};

/** Time source and sleeper; injectable so tests run on a virtual clock. */
export interface Clock {
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new CancelledError());
      const t = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(t);
        reject(new CancelledError());
      };
      signal?.addEventListener("abort", onAbort, { once: true });
    }),
};

export interface HttpClientOptions {
  env: "browser" | "node";
  fetchImpl?: typeof fetch;
  /** Node only. */
  userAgent?: string;
  hostPolicies?: Readonly<Record<string, HostPolicy>>;
  defaultPolicy?: HostPolicy;
  /** Retries after a 429/503, on top of the first attempt. */
  maxRetries?: number;
  clock?: Clock;
}

export interface RequestOptions {
  method?: "GET" | "POST";
  body?: URLSearchParams | string;
  /** Per attempt. Default 30 s, as in the prototype. */
  timeoutMs?: number;
  /**
   * On a timeout, try once more with this longer limit (follow-up 22). Unset, a timeout is final. Only a
   * timeout is retried this way unless `retryTransient` is set; 429/503 keep `retries`.
   */
  retryTimeoutMs?: number;
  /**
   * With `retryTimeoutMs`: the one retry also follows a network failure (the fetch itself rejected: "Failed
   * to fetch", a connection reset) or a 5xx other than 503 (owner, after 18b). Still one retry in all, with
   * the longer limit; a 4xx is never retried.
   */
  retryTransient?: boolean;
  /**
   * Retries after a 429/503 for this request, in place of the client's `maxRetries`. 0 returns the first
   * answer, for callers with their own rule (the Overpass mirrors).
   */
  retries?: number;
  signal?: AbortSignal;
}

export interface HttpClient {
  fetch(url: string, opts?: RequestOptions): Promise<Response>;
}

export const DEFAULT_TIMEOUT_MS = 30_000;
const BACKOFF_MS = [2000, 5000];

/** Per-host gate: FIFO, `maxConcurrent` slots, start times spaced by `minIntervalMs`. */
class HostGate {
  private active = 0;
  private nextStart = 0;
  private readonly waiters: (() => void)[] = [];

  constructor(
    private readonly policy: HostPolicy,
    private readonly clock: Clock,
  ) {}

  async acquire(signal?: AbortSignal): Promise<void> {
    while (this.active >= this.policy.maxConcurrent) {
      await new Promise<void>((resolve, reject) => {
        const wake = () => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        };
        const onAbort = () => {
          const i = this.waiters.indexOf(wake);
          if (i >= 0) this.waiters.splice(i, 1);
          reject(new CancelledError());
        };
        if (signal?.aborted) return reject(new CancelledError());
        signal?.addEventListener("abort", onAbort, { once: true });
        this.waiters.push(wake);
      });
    }
    this.active++;
    const now = this.clock.now();
    const slot = Math.max(now, this.nextStart);
    this.nextStart = slot + this.policy.minIntervalMs;
    if (slot > now) {
      try {
        await this.clock.sleep(slot - now, signal);
      } catch (e) {
        this.release();
        throw e;
      }
    }
  }

  release(): void {
    this.active--;
    this.waiters.shift()?.();
  }
}

/** A response's Retry-After (seconds or an HTTP date) in ms from `now`; null when absent or unreadable. */
export function retryAfterHeaderMs(res: Response, now: number): number | null {
  const h = res.headers.get("retry-after");
  if (!h) return null;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(h);
  return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

function retryAfterMs(res: Response, attempt: number, clock: Clock): number {
  return retryAfterHeaderMs(res, clock.now()) ?? BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]!;
}

interface Cached {
  etag: string | null;
  lastModified: string | null;
  status: number;
  statusText: string;
  headers: [string, string][];
  body: ArrayBuffer;
}

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const clock = options.clock ?? realClock;
  const policies = options.hostPolicies ?? DEFAULT_HOST_POLICIES;
  const fallback = options.defaultPolicy ?? DEFAULT_POLICY;
  const maxRetries = options.maxRetries ?? 2;
  const node = options.env === "node";
  const gates = new Map<string, HostGate>();
  const cache = new Map<string, Cached>();

  const gateFor = (host: string): HostGate => {
    let g = gates.get(host);
    if (!g) gates.set(host, (g = new HostGate(policies[host] ?? fallback, clock)));
    return g;
  };

  async function attempt(url: string, opts: RequestOptions): Promise<Response> {
    // The caller may have aborted while this request waited in the host queue; an abort that already
    // fired won't fire again for the listener below.
    if (opts.signal?.aborted) throw new CancelledError();
    const ctl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctl.abort();
    }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const onAbort = () => ctl.abort();
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    const method = opts.method ?? "GET";
    const headers: Record<string, string> = {};
    const cached = node && method === "GET" ? cache.get(url) : undefined;
    if (node) {
      if (options.userAgent) headers["User-Agent"] = options.userAgent;
      if (cached?.etag) headers["If-None-Match"] = cached.etag;
      if (cached?.lastModified) headers["If-Modified-Since"] = cached.lastModified;
    }
    try {
      const res = await fetchImpl(url, {
        method,
        body: opts.body,
        signal: ctl.signal,
        ...(Object.keys(headers).length ? { headers } : {}),
      });
      if (node && method === "GET") {
        if (res.status === 304 && cached)
          return new Response(cached.body.slice(0), {
            status: cached.status,
            statusText: cached.statusText,
            headers: cached.headers,
          });
        const etag = res.headers.get("etag"),
          lastModified = res.headers.get("last-modified");
        if (res.ok && (etag || lastModified)) {
          const body = await res.arrayBuffer();
          cache.set(url, {
            etag,
            lastModified,
            status: res.status,
            statusText: res.statusText,
            headers: [...res.headers.entries()],
            body,
          });
          return new Response(body.slice(0), {
            status: res.status,
            statusText: res.statusText,
            headers: res.headers,
          });
        }
      }
      return res;
    } catch (e) {
      if (opts.signal?.aborted) throw new CancelledError();
      if (timedOut) throw new TimeoutError(url);
      throw e;
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
    }
  }

  return {
    async fetch(url, opts = {}) {
      if (opts.signal?.aborted) throw new CancelledError();
      const gate = gateFor(new URL(url).host);
      let timeoutMs = opts.timeoutMs,
        retried = false;
      const canRetry = () => opts.retryTimeoutMs !== undefined && !retried;
      for (let n = 0; ; n++) {
        await gate.acquire(opts.signal);
        let res: Response;
        try {
          res = await attempt(url, { ...opts, ...(timeoutMs !== undefined ? { timeoutMs } : {}) });
        } catch (e) {
          const transient =
            e instanceof TimeoutError || (opts.retryTransient === true && !(e instanceof CancelledError));
          if (!transient || !canRetry()) throw e;
          retried = true;
          timeoutMs = opts.retryTimeoutMs;
          n--; // the one retry isn't one of the 429/503 retries
          continue;
        } finally {
          gate.release();
        }
        if (opts.retryTransient && res.status >= 500 && res.status !== 503 && canRetry()) {
          await res.body?.cancel();
          retried = true;
          timeoutMs = opts.retryTimeoutMs;
          n--;
          continue;
        }
        if ((res.status !== 429 && res.status !== 503) || n >= (opts.retries ?? maxRetries)) return res;
        const wait = retryAfterMs(res, n, clock);
        await res.body?.cancel(); // discard the throttled response before waiting
        await clock.sleep(wait, opts.signal);
      }
    },
  };
}
