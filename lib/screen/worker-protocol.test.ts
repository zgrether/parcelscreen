import { describe, expect, it } from "vitest";
import { differences } from "../../test/support/compare";
import { loadFixture } from "../../test/support/fixtures";
import { instantClock } from "../../test/support/pipeline";
import { createHttpClient } from "../http";
import { DEFAULT_USER_CONFIG } from "./config";
import { centroid } from "@turf/turf";
import { screen, setHouse } from "./index";
import type { ScreenResult } from "./types";
import type { LatLon } from "./util";
import { ScreenWorkerCore, type FromWorker } from "./worker-protocol";

const fx = loadFixture("macks-mountain-35-3");
const input = { polygon: fx.input.polygon.geometry, config: DEFAULT_USER_CONFIG };

function core() {
  const posted: FromWorker[] = [];
  const replay = fx.replayFetch();
  const c = new ScreenWorkerCore((m) => posted.push(m), {
    http: createHttpClient({ env: "node", fetchImpl: replay, clock: instantClock() }),
    sleep: async () => {},
  });
  return { c, posted, replay };
}

describe("ScreenWorkerCore", () => {
  it("runs a screen: progress for every step, then the same result screen() gives, plus a session view", async () => {
    const { c, posted } = core();
    await c.handle({ type: "run", id: 1, input });
    const progress = posted.filter((m) => m.type === "progress");
    // 11 steps × run + done, and the driveway step's count of route searches while it runs (A4b PR B).
    const counts = progress.filter((m) => m.event.status === "run" && m.event.message);
    expect(counts.length).toBeGreaterThan(0);
    expect(
      counts.every(
        (m) => m.event.step === "driveway" && /^\d+ route search(es)? done$/.test(m.event.message!),
      ),
    ).toBe(true);
    expect(progress.length - counts.length).toBe(22);
    const done = posted.at(-1)!;
    expect(done.type).toBe("done");
    if (done.type !== "done") return;
    const direct = await screen(input, undefined, {
      http: createHttpClient({ env: "node", fetchImpl: fx.replayFetch(), clock: instantClock() }),
      sleep: async () => {},
    });
    expect(differences(done.result, direct.result, { ignore: ["runAt"] })).toEqual([]);
    // The view carries what the map and 3D need, and nothing that can't cross postMessage.
    expect(done.view.dFine?.z).toBeInstanceOf(Float32Array);
    expect(done.view.labels?.house).toBeInstanceOf(Int32Array);
    expect(done.view.horizon).toHaveLength(72);
    expect(structuredClone(done.view).bestId).toBe(done.view.bestId);
  }, 90_000); // two whole screens of Macks Mountain; since A3 each routes all 8 ranked sites (~4.5 s)

  it("re-evaluates the run it holds (evaluateAt, setHouse) and refuses unknown runs", async () => {
    const { c, posted } = core();
    await c.handle({ type: "run", id: 7, input });
    await c.handle({ type: "evaluateAt", id: 7, ll: fx.input.evaluateSite2!.ll, label: "site #2" });
    const upd = posted.at(-1)!;
    expect(upd.type === "updated" && upd.result.focus).toEqual({
      ll: fx.input.evaluateSite2!.ll,
      label: "site #2",
    });
    await c.handle({ type: "setHouse", id: 7, ll: null });
    const cleared = posted.at(-1)!;
    expect(cleared.type === "updated" && cleared.result.house).toBeNull();
    await c.handle({ type: "evaluateAt", id: 99, ll: [36.9, -80.6], label: "x" });
    expect(posted.at(-1)).toEqual({
      type: "error",
      id: 99,
      message: "That screen is no longer available; run it again.",
    });
  });

  it("cancel stops the run: remaining steps are skipped and the result says so", async () => {
    const { c, posted } = core();
    const running = c.handle({ type: "run", id: 3, input });
    await c.handle({ type: "cancel", id: 3 });
    await running;
    const done = posted.at(-1)!;
    expect(done.type === "done" && done.result.cancelled).toBe(true);
    expect(posted.some((m) => m.type === "progress" && m.event.status === "skip")).toBe(true);
  });

  it("a new run supersedes the old one: nothing more is posted for the old id", async () => {
    const { c, posted } = core();
    const first = c.handle({ type: "run", id: 1, input });
    const second = c.handle({ type: "run", id: 2, input });
    await Promise.all([first, second]);
    const ids = posted.map((m) => m.id);
    const firstOfSecond = ids.indexOf(2);
    expect(firstOfSecond).toBeGreaterThan(-1);
    expect(ids.slice(firstOfSecond)).not.toContain(1); // once run 2 starts, run 1 never posts again
    expect(posted.filter((m) => m.id === 1 && m.type === "done")).toHaveLength(0);
    expect(posted.at(-1)!.type).toBe("done");
    expect(posted.at(-1)!.id).toBe(2);
  });
});

describe("ping", () => {
  it("answers pong without any network", async () => {
    const posted: FromWorker[] = [];
    const c = new ScreenWorkerCore((m) => posted.push(m), {
      http: { fetch: () => Promise.reject(new Error("no network expected")) },
    });
    await c.handle({ type: "ping", id: 0 });
    expect(posted).toEqual([{ type: "pong", id: 0 }]);
  });
});

describe("the start acknowledgement (17e)", () => {
  it("acknowledges a run at once, before any step and before any request", async () => {
    const replay = fx.replayFetch();
    const seen: { type: string; requests: number }[] = [];
    const c = new ScreenWorkerCore((m) => seen.push({ type: m.type, requests: replay.requests.length }), {
      http: createHttpClient({ env: "node", fetchImpl: replay, clock: instantClock() }),
      sleep: async () => {},
    });
    await c.handle({ type: "run", id: 1, input });
    expect(seen[0]).toEqual({ type: "started", requests: 0 });
    expect(seen.filter((m) => m.type === "started")).toHaveLength(1);
  });
});

describe("heartbeats (18b)", () => {
  it("beat while a run waits on the network, and stop when it ends", async () => {
    const replay = fx.replayFetch();
    let first = true;
    // The first elevation response takes 60 ms: the worker's event loop is free meanwhile, so it beats (every 5 ms
    // here). The elevation, not the first request: since step 14 the land cover, streams and county are asked first,
    // and they answer while the terrain work holds the loop.
    const slow = (async (u: string, i?: RequestInit) => {
      if (first && u.includes("3DEPElevation")) {
        first = false;
        await new Promise((r) => setTimeout(r, 60));
      }
      return replay(u, i);
    }) as typeof fetch;
    const posted: FromWorker[] = [];
    const c = new ScreenWorkerCore((m) => posted.push(m), {
      http: createHttpClient({ env: "node", fetchImpl: slow, clock: instantClock() }),
      sleep: async () => {},
      heartbeatMs: 5,
    });
    await c.handle({ type: "run", id: 1, input });
    const types = posted.map((m) => m.type);
    expect(types.filter((t) => t === "heartbeat").length).toBeGreaterThan(3);
    expect(types.indexOf("heartbeat")).toBeGreaterThan(types.indexOf("started"));
    const done = types.lastIndexOf("done");
    await new Promise((r) => setTimeout(r, 40));
    expect(posted.slice(done + 1)).toEqual([]); // nothing after the run ends
  });
});

// Two whole screens of Macks Mountain (~14 s each locally since the "no practical drive" rule routes Macks #4's
// alternatives): over the 30 s default on CI, as the kept-session tests above.
describe("a restarted worker (17e)", { timeout: 120_000 }, () => {
  it("knows none of the runs the page kept: reactivating one says it's gone, which the page takes as a lost worker", async () => {
    const first = core();
    for (const id of [1, 2]) await first.c.handle({ type: "run", id, input });
    expect(first.c.keptIds()).toEqual([1, 2]);
    // The browser terminated it; the page's next request makes a fresh worker.
    const { c, posted, replay } = core();
    expect(c.keptIds()).toEqual([]);
    for (const id of [1, 2]) await c.handle({ type: "activate", id });
    expect(posted).toEqual(
      [1, 2].map((id) => ({
        type: "error",
        id,
        message: "That screen is no longer available; run it again.",
      })),
    );
    expect(replay.requests).toEqual([]); // and asked nothing of the network
  });
});

describe("session sizes (for the 17e PR)", () => {
  it.each(["ferney-creek-52-47A", "macks-mountain-35-3"] as const)("%s", async (slug) => {
    const f = loadFixture(slug);
    const posted: FromWorker[] = [];
    const c = new ScreenWorkerCore((m) => posted.push(m), {
      http: createHttpClient({ env: "node", fetchImpl: f.replayFetch(), clock: instantClock() }),
      sleep: async () => {},
    });
    await c.handle({
      type: "run",
      id: 1,
      input: { polygon: f.input.polygon.geometry, config: DEFAULT_USER_CONFIG },
    });
    const done = posted.at(-1)!;
    if (done.type !== "done") throw new Error("no done");
    const mb = (n: number) => (n / 1048576).toFixed(1);
    console.log(`${slug}: worker session ${mb(done.bytes.session)} MB, page view ${mb(done.bytes.view)} MB`);
  });
});

describe("reroute (WF6; docs/plans/wf6-reroute.md §6.3, §6.6)", { timeout: 240_000 }, () => {
  /** A 60 m track through Macks's middle. */
  const track = (id: string, dLon = 0) => {
    const [lon, lat] = centroid(fx.input.polygon).geometry.coordinates as [number, number];
    return {
      id,
      kind: "track" as const,
      line: [
        [lat - 0.0002, lon - 0.0003 + dLon],
        [lat + 0.0002, lon + 0.0003 + dLon],
      ] as LatLon[],
      widthFt: null,
    };
  };
  const plain = (r: ScreenResult) => JSON.parse(JSON.stringify({ ...r, runAt: "" })) as unknown;
  const direct = (lines: ReturnType<typeof track>[]) =>
    screen({ ...input, lines }, undefined, {
      http: createHttpClient({ env: "node", fetchImpl: fx.replayFetch(), clock: instantClock() }),
      sleep: async () => {},
    });

  it("move the house, then reroute: the house is re-applied after it, as the run and the move with those lines give", async () => {
    const { c, posted } = core();
    const h = fx.input.evaluateSite2!.ll;
    await c.handle({ type: "run", id: 1, input });
    await c.handle({ type: "setHouse", id: 1, ll: h });
    await c.handle({ type: "reroute", id: 1, lines: [track("a")], drivewayLine: null });
    const upd = posted.at(-1)!;
    expect(upd.type).toBe("updated");
    if (upd.type !== "updated") return;
    const expected = await setHouse(await direct([track("a")]), h);
    expect(plain(upd.result)).toEqual(plain(expected.result));
  });

  it("two reroutes in quick succession: the first is superseded, and only the latest is posted", async () => {
    const { c, posted } = core();
    await c.handle({ type: "run", id: 2, input });
    const from = posted.length;
    const first = c.handle({ type: "reroute", id: 2, lines: [track("first")], drivewayLine: null });
    const second = c.handle({ type: "reroute", id: 2, lines: [track("second", 0.0001)], drivewayLine: null });
    await Promise.all([first, second]);
    const answers = posted.slice(from).filter((m) => m.type === "updated" || m.type === "error");
    expect(answers).toHaveLength(1);
    const [only] = answers;
    expect(only!.type === "updated" && only!.result.lines.map((l) => l.id)).toEqual(["second"]);
    if (only!.type === "updated")
      expect(plain(only!.result)).toEqual(plain((await direct([track("second", 0.0001)])).result));
  });
});
