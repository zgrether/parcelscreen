import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FromWorker } from "@/lib/screen/worker-protocol";
import { HEARTBEAT_MS } from "@/lib/screen/worker-protocol";
import {
  ACTIVATE_MS,
  DIDNT_START,
  LONGEST_BLOCK_4X_MS,
  PING_MS,
  RUN_SILENCE_MS,
  START_MS,
  WorkerWatch,
} from "./workerWatch";

const progress = (id: number): FromWorker =>
  ({ type: "progress", id, event: { step: "dem", status: "run" } }) as FromWorker;

describe("the worker watch (17e): a healthy worker is never declared lost", () => {
  let lost: (string | undefined)[];
  let retries: number;
  let w: WorkerWatch;
  beforeEach(() => {
    vi.useFakeTimers();
    lost = [];
    retries = 0;
    w = new WorkerWatch((e) => lost.push(e));
  });
  afterEach(() => vi.useRealTimers());

  it("the start timer is met by the worker's immediate acknowledgement, not by a step finishing", () => {
    w.runSent(1, () => retries++);
    w.message({ type: "started", id: 1 });
    // The first step's response takes 30 s (a slow DEM): no message meanwhile, and nothing is lost.
    vi.advanceTimersByTime(30_000);
    expect([lost, retries]).toEqual([[], 0]);
    w.message(progress(1));
    w.message({ type: "done", id: 1 } as FromWorker);
    vi.advanceTimersByTime(RUN_SILENCE_MS * 2);
    expect([lost, retries]).toEqual([[], 0]);
  });

  it("with no acknowledgement, the run is retried once on a fresh worker; then it says it didn't start", () => {
    let again = 0;
    w.runSent(1, () => {
      again++;
      w.runSent(2, null);
    });
    vi.advanceTimersByTime(START_MS - 1);
    expect(lost).toEqual([]);
    vi.advanceTimersByTime(1);
    expect([lost, again]).toEqual([[undefined], 1]);
    vi.advanceTimersByTime(START_MS);
    expect(lost).toEqual([undefined, DIDNT_START]);
  });

  it("the in-run silence limit is max(60 s, 3 × the longest synchronous block at 4×): 60 s", () => {
    expect(LONGEST_BLOCK_4X_MS).toBe(15_680);
    expect(RUN_SILENCE_MS).toBe(60_000);
    expect(RUN_SILENCE_MS).toBeGreaterThan(3 * LONGEST_BLOCK_4X_MS);
  });

  it("heartbeats keep a run alive through any network wait; a long synchronous block is tolerated", () => {
    w.runSent(1, () => retries++);
    w.message({ type: "started", id: 1 });
    // A slow service: 5 minutes of waiting, the worker's heartbeat every 5 s all through it.
    for (let t = 0; t < 5 * 60_000; t += HEARTBEAT_MS) {
      vi.advanceTimersByTime(HEARTBEAT_MS);
      w.message({ type: "heartbeat", id: 1 });
    }
    // Then the longest synchronous computation, with a phone's margin: no message for 3 × 15.7 s.
    vi.advanceTimersByTime(3 * LONGEST_BLOCK_4X_MS);
    w.message(progress(1));
    expect([lost, retries]).toEqual([[], 0]);
  });

  it("a worker killed mid-run (heartbeats stop) is noticed after a minute of silence", () => {
    w.runSent(1, () => retries++);
    w.message({ type: "started", id: 1 });
    w.message({ type: "heartbeat", id: 1 });
    vi.advanceTimersByTime(RUN_SILENCE_MS - 1);
    expect(lost).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(lost).toEqual([undefined]);
  });

  it("no foreground ping while a run is going; when idle, the pong must come", () => {
    w.runSent(1, () => retries++);
    w.message({ type: "started", id: 1 });
    expect(w.visible(true)).toBe(false);
    vi.advanceTimersByTime(PING_MS * 10);
    expect(lost).toEqual([]);
    w.message({ type: "done", id: 1 } as FromWorker);
    expect(w.visible(true)).toBe(true);
    w.message({ type: "pong", id: 0 });
    vi.advanceTimersByTime(PING_MS * 10);
    expect(lost).toEqual([]);
    expect(w.visible(true)).toBe(true);
    vi.advanceTimersByTime(PING_MS);
    expect(lost).toEqual([undefined]);
    expect(w.visible(false)).toBe(false); // no worker yet: nothing to ping
  });

  it("a reactivation answered in time is fine; an unknown run, or no answer, is a lost worker", () => {
    w.activateSent(4);
    w.message({ type: "updated", id: 4 } as FromWorker);
    vi.advanceTimersByTime(ACTIVATE_MS * 2);
    expect(lost).toEqual([]);
    w.activateSent(5);
    expect(
      w.message({ type: "error", id: 5, message: "That screen is no longer available; run it again." }),
    ).toBe(false);
    expect(lost).toEqual([undefined]);
    w.activateSent(6);
    vi.advanceTimersByTime(ACTIVATE_MS);
    expect(lost).toEqual([undefined, undefined]);
  });
});
