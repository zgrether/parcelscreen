/**
 * When the page should take its screen worker as lost (step 17e), and never a healthy one (owner, #73 review).
 * Pure apart from the timers it's given, so it's Node-tested with fake timers; useScreen feeds it events.
 *
 * - A run: the worker acknowledges it at once (`started`, before any step). No acknowledgement within
 *   START_MS: lost, and the run is retried once on a fresh worker (then it says the screen didn't start).
 * - During a run, every message from it is liveness: its steps, and a heartbeat every 5 s (HEARTBEAT_MS; its
 *   event loop is free while it waits on the network, however slow a service is). So only its synchronous
 *   computation can keep it quiet, and silence beyond RUN_SILENCE_MS counts as lost: a worker killed mid-run is
 *   noticed in about a minute. There's no foreground ping during a run.
 * - Reopening a kept run (`activate`): answered (`updated`) within ACTIVATE_MS, or lost. An `error` answer
 *   means the worker doesn't know the run: it was restarted, so it's lost too.
 * - Back in the foreground with no run going: a ping answered within PING_MS, or lost.
 */
import type { FromWorker } from "@/lib/screen/worker-protocol";

export const START_MS = 20_000;
/**
 * The longest synchronous computation in a run, measured in Chromium on the reference parcels (18b; the gap
 * in a 20 ms timer inside the worker): Ferney Creek 1.48 s, Macks Mountain 3.92 s, both at the end of the run.
 * Chromium can't throttle a dedicated worker's CPU ("Operation is only supported for pages, not workers"), so
 * the 4× phone allowance is the measurement × 4: 15.7 s. The owner's rule: max(60 s, 3 × that) = 60 s. Bigger
 * parcels compute longer, but the DEM's 2.4 M-cell cap (Macks is near it) keeps them within about 2× Macks.
 */
export const LONGEST_BLOCK_4X_MS = 4 * 3_920;
export const RUN_SILENCE_MS = Math.max(60_000, 3 * LONGEST_BLOCK_4X_MS);
export const ACTIVATE_MS = 4_000;
export const PING_MS = 3_000;
export const DIDNT_START = "The screen didn't start. Run it again.";

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

type Kind = "start" | "silence" | "activate" | "ping";

export class WorkerWatch {
  private readonly handles = new Map<Kind, unknown>();
  private running: { id: number; retry: (() => void) | null } | null = null;
  private activating: number | null = null;

  /**
   * @param lose  the worker is lost (the caller drops it; `error` only when there's something to say)
   */
  constructor(
    private readonly lose: (error?: string) => void,
    private readonly timers: Timers = realTimers,
  ) {}

  private arm(kind: Kind, ms: number, fire: () => void): void {
    this.disarm(kind);
    this.handles.set(
      kind,
      this.timers.set(() => {
        this.handles.delete(kind);
        fire();
      }, ms),
    );
  }

  private disarm(kind: Kind): void {
    const h = this.handles.get(kind);
    if (h !== undefined) this.timers.clear(h);
    this.handles.delete(kind);
  }

  private lost(error?: string): void {
    this.reset();
    this.lose(error);
  }

  /** A run was sent. `retry` re-sends it on a fresh worker; null when this is already the retry. */
  runSent(id: number, retry: (() => void) | null): void {
    this.running = { id, retry };
    this.arm("start", START_MS, () => {
      const again = this.running?.retry ?? null;
      if (!again) return this.lost(DIDNT_START);
      this.lost();
      again();
    });
  }

  /** A reactivation was sent (17e). */
  activateSent(id: number): void {
    this.activating = id;
    this.arm("activate", ACTIVATE_MS, () => this.lost());
  }

  /**
   * Back in the foreground: whether to ping the worker now. Not during a run (its messages say it's alive);
   * otherwise the pong must come within PING_MS.
   */
  visible(hasWorker: boolean): boolean {
    if (!hasWorker || this.running) return false;
    this.arm("ping", PING_MS, () => this.lost());
    return true;
  }

  /**
   * A message from the worker. Returns false when the message means the worker is lost (the caller then
   * ignores it: `lose` has already been called).
   */
  message(m: FromWorker): boolean {
    if (m.type === "pong") this.disarm("ping");
    if (
      this.activating !== null &&
      m.id === this.activating &&
      (m.type === "updated" || m.type === "error")
    ) {
      this.activating = null;
      this.disarm("activate");
      if (m.type === "error") {
        this.lost();
        return false;
      }
    }
    if (this.running && m.id === this.running.id) {
      this.disarm("start");
      if (m.type === "done" || m.type === "error") {
        this.running = null;
        this.disarm("silence");
      } else this.arm("silence", RUN_SILENCE_MS, () => this.lost());
    }
    return true;
  }

  /** The run was dropped by the page (cancelled and done, or superseded): stop watching it. */
  reset(): void {
    for (const k of [...this.handles.keys()]) this.disarm(k);
    this.running = null;
    this.activating = null;
  }

  /** Whether a run is being watched (for tests). */
  isRunning(): boolean {
    return this.running !== null;
  }
}
