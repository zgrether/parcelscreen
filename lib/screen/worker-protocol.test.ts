import { describe, expect, it } from "vitest";
import { differences } from "../../test/support/compare";
import { loadFixture } from "../../test/support/fixtures";
import { instantClock } from "../../test/support/pipeline";
import { createHttpClient } from "../http";
import { DEFAULT_USER_CONFIG } from "./config";
import { screen } from "./index";
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
    expect(progress).toHaveLength(22); // 11 steps × run + done
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
  });

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
