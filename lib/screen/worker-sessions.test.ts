/** The worker's kept sessions (17e), split from worker-protocol.test.ts so CI can run the two files side by side. */
import { describe, expect, it } from "vitest";
import { loadFixture } from "../../test/support/fixtures";
import { instantClock } from "../../test/support/pipeline";
import { createHttpClient } from "../http";
import { DEFAULT_USER_CONFIG } from "./config";
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
