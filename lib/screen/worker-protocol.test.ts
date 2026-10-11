import { describe, expect, it } from "vitest";
import { differences } from "../../test/support/compare";
import { loadFixture } from "../../test/support/fixtures";
import { instantClock } from "../../test/support/pipeline";
import { createHttpClient } from "../http";
import { DEFAULT_USER_CONFIG } from "./config";
import { screen } from "./index";
import { arrayBytes, MAX_SESSIONS, ScreenWorkerCore, type FromWorker } from "./worker-protocol";

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

// Each test runs three or four full screens; under the whole suite's load they passed 30 s (Batch A A1).
describe("kept sessions (17e)", { timeout: 120_000 }, () => {
  const lastOf = (posted: FromWorker[], id: number) => posted.filter((m) => m.id === id).at(-1)!;

  it("keeps the last runs: an earlier run can still be re-evaluated after later ones", async () => {
    const { c, posted } = core();
    for (const id of [1, 2, 3]) await c.handle({ type: "run", id, input });
    expect(c.keptIds()).toEqual([1, 2, 3]);
    await c.handle({ type: "evaluateAt", id: 1, ll: fx.input.evaluateSite2!.ll, label: "site #2" });
    const upd = lastOf(posted, 1);
    expect(upd.type === "updated" && upd.result.focus?.label).toBe("site #2");
    expect(c.keptIds()).toEqual([2, 3, 1]); // used last
  });

  it("release drops a run's session; a later request for it says so", async () => {
    const { c, posted } = core();
    await c.handle({ type: "run", id: 4, input });
    await c.handle({ type: "release", id: 4 });
    expect(c.keptIds()).toEqual([]);
    await c.handle({ type: "activate", id: 4 });
    expect(lastOf(posted, 4)).toEqual({
      type: "error",
      id: 4,
      message: "That screen is no longer available; run it again.",
    });
  });

  it(`caps itself at ${MAX_SESSIONS}: a fourth run without a release drops the least recently used`, async () => {
    const { c } = core();
    for (const id of [1, 2, 3]) await c.handle({ type: "run", id, input });
    await c.handle({ type: "activate", id: 1 }); // 1 used last: 2 is now the oldest
    await c.handle({ type: "run", id: 4, input });
    expect(c.keptIds()).toEqual([3, 1, 4]);
  });

  it("activate reopens a run at its own point, dropping an unsaved re-evaluation, with no network", async () => {
    const { c, posted, replay } = core();
    await c.handle({ type: "run", id: 5, input });
    const done = lastOf(posted, 5);
    if (done.type !== "done") throw new Error("no done");
    await c.handle({ type: "evaluateAt", id: 5, ll: fx.input.evaluateSite2!.ll, label: "site #2" });
    await c.handle({ type: "run", id: 6, input });
    const asked = replay.requests.length;
    await c.handle({ type: "activate", id: 5 });
    const back = lastOf(posted, 5);
    expect(back.type).toBe("updated");
    if (back.type !== "updated") return;
    expect(back.result).toEqual(done.result); // the run's own point, not site #2
    expect(back.view.horizon).toEqual(done.view.horizon);
    expect(replay.requests.length).toBe(asked);
  });

  it("a house re-assessment becomes the run's own result: activate returns to it", async () => {
    const { c, posted } = core();
    await c.handle({ type: "run", id: 8, input });
    const site = (lastOf(posted, 8) as Extract<FromWorker, { type: "done" }>).result.sites![0]!.ll;
    await c.handle({ type: "setHouse", id: 8, ll: site });
    const housed = lastOf(posted, 8);
    await c.handle({ type: "evaluateAt", id: 8, ll: fx.input.evaluateSite2!.ll, label: "site #2" });
    await c.handle({ type: "activate", id: 8 });
    const back = lastOf(posted, 8);
    expect(back.type === "updated" && housed.type === "updated" && back.result).toEqual(
      housed.type === "updated" ? housed.result : null,
    );
  });

  it("reports each session's size; the page's view is part of the worker's session", async () => {
    const { c, posted } = core();
    await c.handle({ type: "run", id: 9, input });
    const done = lastOf(posted, 9);
    if (done.type !== "done") throw new Error("no done");
    expect(done.bytes.session).toBeGreaterThan(done.bytes.view);
    expect(done.bytes.view).toBeGreaterThan(0);
    expect(done.bytes.view).toBe(arrayBytes(done.view));
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
    // The first response takes 60 ms: the worker's event loop is free meanwhile, so it beats (every 5 ms here).
    const slow = (async (u: string, i?: RequestInit) => {
      if (first) {
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

describe("a restarted worker (17e)", () => {
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
