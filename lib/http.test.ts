import { describe, expect, it } from "vitest";
import { CancelledError, createHttpClient, DEFAULT_HOST_POLICIES, TimeoutError, type Clock } from "./http";

/** A virtual clock: sleeping advances time instantly, and every sleep is recorded. */
function fakeClock(): Clock & { sleeps: number[] } {
  let t = 0;
  const sleeps: number[] = [];
  return {
    sleeps,
    now: () => t,
    sleep: async (ms, signal) => {
      if (signal?.aborted) throw new CancelledError();
      sleeps.push(ms);
      t += ms;
    },
  };
}

const ok = (body = "{}", init: ResponseInit = {}) => new Response(body, { status: 200, ...init });

describe("per-host queue", () => {
  it("spaces the volunteer services one request per second", async () => {
    const clock = fakeClock();
    const starts: number[] = [];
    const http = createHttpClient({
      env: "browser",
      clock,
      fetchImpl: async () => {
        starts.push(clock.now());
        return ok();
      },
    });
    await Promise.all(
      [1, 2, 3].map((i) => http.fetch(`https://router.project-osrm.org/route/v1/driving/${i}`)),
    );
    expect(starts).toEqual([0, 1000, 2000]);
    expect(DEFAULT_HOST_POLICIES["photon.komoot.io"]).toEqual({ maxConcurrent: 1, minIntervalMs: 1000 });
  });

  it("leaves other hosts unthrottled but caps concurrency per host", async () => {
    let inFlight = 0,
      peak = 0;
    const release: (() => void)[] = [];
    const http = createHttpClient({
      env: "browser",
      clock: fakeClock(),
      defaultPolicy: { maxConcurrent: 2, minIntervalMs: 0 },
      fetchImpl: () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        return new Promise<Response>((resolve) =>
          release.push(() => {
            inFlight--;
            resolve(ok());
          }),
        );
      },
    });
    const all = Promise.all([1, 2, 3, 4].map((i) => http.fetch(`https://hazards.fema.gov/q${i}`)));
    // Drain: release whatever is in flight until all four have run.
    for (let done = 0; done < 4;) {
      await new Promise((r) => setTimeout(r, 0));
      const batch = release.splice(0);
      batch.forEach((f) => f());
      done += batch.length;
    }
    await all;
    expect(peak).toBe(2);
  });

  it("queues each host separately", async () => {
    const clock = fakeClock();
    const starts: string[] = [];
    const http = createHttpClient({
      env: "browser",
      clock,
      fetchImpl: async (u) => {
        starts.push(`${new URL(String(u)).host}@${clock.now()}`);
        return ok();
      },
    });
    await Promise.all([
      http.fetch("https://photon.komoot.io/a"),
      http.fetch("https://router.project-osrm.org/a"),
      http.fetch("https://photon.komoot.io/b"),
    ]);
    expect(starts).toContain("router.project-osrm.org@0");
    expect(starts).toContain("photon.komoot.io@0");
    expect(starts.filter((s) => s.startsWith("photon"))).toHaveLength(2);
  });
});

describe("429 / 503 backoff", () => {
  it("honours Retry-After in seconds and returns the eventual success", async () => {
    const clock = fakeClock();
    const responses = [new Response("", { status: 429, headers: { "Retry-After": "3" } }), ok("fine")];
    const http = createHttpClient({ env: "browser", clock, fetchImpl: async () => responses.shift()! });
    const r = await http.fetch("https://overpass-api.de/api/interpreter");
    expect(await r.text()).toBe("fine");
    expect(clock.sleeps).toContain(3000);
  });

  it("backs off 2 s then 5 s without Retry-After, then gives up and returns the last response", async () => {
    const clock = fakeClock();
    let calls = 0;
    const http = createHttpClient({
      env: "browser",
      clock,
      fetchImpl: async () => {
        calls++;
        return new Response("busy", { status: 503 });
      },
    });
    const r = await http.fetch("https://elevation.nationalmap.gov/x");
    expect(r.status).toBe(503);
    expect(calls).toBe(3); // first attempt + 2 retries
    expect(clock.sleeps).toEqual([2000, 5000]);
  });

  it("a request's own retries replace the client's: 0 returns the first 429 at once", async () => {
    const clock = fakeClock();
    let calls = 0;
    const http = createHttpClient({
      env: "node",
      clock,
      fetchImpl: async () => {
        calls++;
        return new Response("", { status: 429, headers: { "Retry-After": "3" } });
      },
    });
    const r = await http.fetch("https://overpass-api.de/api/interpreter", { retries: 0 });
    expect(r.status).toBe(429);
    expect(calls).toBe(1);
    expect(clock.sleeps).toEqual([]);
  });

  it("returns other error statuses untouched, for the connector to report", async () => {
    const http = createHttpClient({
      env: "browser",
      fetchImpl: async () => new Response("nope", { status: 500 }),
    });
    const r = await http.fetch("https://hazards.fema.gov/x");
    expect(r.status).toBe(500);
    expect(await r.text()).toBe("nope");
  });
});

describe("timeouts and cancellation", () => {
  // A fetch that only settles when its signal aborts, like a hung server.
  const hang = (_u: unknown, init?: RequestInit) =>
    new Promise<Response>((_, reject) =>
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))),
    );

  it("times out with the prototype's message", async () => {
    const http = createHttpClient({ env: "browser", fetchImpl: hang });
    const p = http.fetch("https://elevation.nationalmap.gov/slow", { timeoutMs: 20 });
    await expect(p).rejects.toBeInstanceOf(TimeoutError);
    await expect(p).rejects.toThrow("timed out");
  });

  it("rejects with CancelledError when the caller aborts mid-request", async () => {
    const ctl = new AbortController();
    const http = createHttpClient({ env: "browser", fetchImpl: hang });
    const p = http.fetch("https://elevation.nationalmap.gov/slow", { signal: ctl.signal });
    ctl.abort();
    await expect(p).rejects.toBeInstanceOf(CancelledError);
    await expect(p).rejects.toThrow("cancelled");
  });

  it("doesn't call fetch at all when already cancelled", async () => {
    let called = false;
    const ctl = new AbortController();
    ctl.abort();
    const http = createHttpClient({
      env: "browser",
      fetchImpl: async () => {
        called = true;
        return ok();
      },
    });
    await expect(http.fetch("https://x.test/", { signal: ctl.signal })).rejects.toBeInstanceOf(
      CancelledError,
    );
    expect(called).toBe(false);
  });

  it("cancels a request still waiting in the host queue", async () => {
    const clock: Clock = {
      now: () => 0,
      // Never wakes on its own; only the abort ends the wait.
      sleep: (_ms, signal) =>
        new Promise((_, reject) => signal?.addEventListener("abort", () => reject(new CancelledError()))),
    };
    const http = createHttpClient({ env: "browser", clock, fetchImpl: async () => ok() });
    await http.fetch("https://photon.komoot.io/first");
    const ctl = new AbortController();
    const second = http.fetch("https://photon.komoot.io/second", { signal: ctl.signal });
    ctl.abort();
    await expect(second).rejects.toBeInstanceOf(CancelledError);
  });
});

describe("environment differences", () => {
  it("browser: sends no custom headers (no CORS preflight)", async () => {
    let seen: RequestInit | undefined;
    const http = createHttpClient({
      env: "browser",
      userAgent: "ignored",
      fetchImpl: async (_u, init) => {
        seen = init;
        return ok();
      },
    });
    await http.fetch("https://hazards.fema.gov/x");
    expect(seen?.headers).toBeUndefined();
  });

  it("node: identifies itself and revalidates with the ETag, serving the cached body on 304", async () => {
    const seen: Record<string, string>[] = [];
    let n = 0;
    const http = createHttpClient({
      env: "node",
      userAgent: "ParcelScreen/0 (+test)",
      fetchImpl: async (_u, init) => {
        seen.push((init?.headers as Record<string, string>) ?? {});
        return n++ === 0
          ? ok("tile-bytes", { headers: { ETag: '"v1"' } })
          : new Response(null, { status: 304 });
      },
    });
    const first = await http.fetch("https://djlorenz.github.io/astronomy/binary_tiles/2025/t.dat.gz");
    expect(await first.text()).toBe("tile-bytes");
    const second = await http.fetch("https://djlorenz.github.io/astronomy/binary_tiles/2025/t.dat.gz");
    expect(second.status).toBe(200);
    expect(await second.text()).toBe("tile-bytes");
    expect(seen[0]).toEqual({ "User-Agent": "ParcelScreen/0 (+test)" });
    expect(seen[1]).toEqual({ "User-Agent": "ParcelScreen/0 (+test)", "If-None-Match": '"v1"' });
  });

  it("node: never revalidates POSTs", async () => {
    const seen: Record<string, string>[] = [];
    const http = createHttpClient({
      env: "node",
      fetchImpl: async (_u, init) => {
        seen.push((init?.headers as Record<string, string>) ?? {});
        return ok("{}", { headers: { ETag: '"x"' } });
      },
    });
    await http.fetch("https://hazards.fema.gov/q", {
      method: "POST",
      body: new URLSearchParams({ f: "json" }),
    });
    await http.fetch("https://hazards.fema.gov/q", {
      method: "POST",
      body: new URLSearchParams({ f: "json" }),
    });
    expect(seen[1]).toEqual({});
  });
});
