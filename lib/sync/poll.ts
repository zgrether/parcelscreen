/**
 * Polling on a joined device (step 6b): while the app is visible and online, fetch the space's changes every 30 s, so a
 * take or an edit from another device arrives without a tab switch. The timer is all this module holds; the engine
 * (engine.ts) does the fetching, and tells it each time a fetch ends, whatever started it (open, focus, a tab switch,
 * or a poll), so a poll never follows another fetch closely.
 *
 * - **Visible and online only:** hidden or offline, no poll is waiting; shown or back online, the next is a full
 *   interval away (the engine fetches on return to the front anyway).
 * - **Backing off:** after 3 failed fetches in a row, the interval is 2 minutes until one succeeds. A failure shows
 *   nothing: "Not saved" is about saving, and is unchanged.
 */

export const POLL_MS = 30_000;
export const BACKOFF_MS = 120_000;
export const FAILS_BEFORE_BACKOFF = 3;

/** What the poller reads from the page and how it keeps time: the real ones in the app, fakes in the tests. */
export interface PollEnv {
  visible(): boolean;
  online(): boolean;
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(timer: unknown): void;
}

export const browserPollEnv: PollEnv = {
  visible: () => document.visibilityState === "visible",
  online: () => navigator.onLine,
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};

export class Poller {
  private timer: unknown = undefined;
  private fails = 0;
  private running = false;

  constructor(
    /** Fetches the changes: the engine's own fetch, which reports back through `fetched`. */
    private readonly poll: () => void,
    private readonly env: PollEnv = browserPollEnv,
  ) {}

  start(): void {
    this.running = true;
    this.schedule();
  }

  stop(): void {
    this.running = false;
    this.clear();
  }

  /** A fetch ended, from any trigger: count a failure (or clear the count), and wait a full interval from now. */
  fetched(ok: boolean): void {
    this.fails = ok ? 0 : this.fails + 1;
    this.schedule();
  }

  /** The page was shown or hidden, or went on- or offline: a poll waits only while it's visible and online. */
  changed(): void {
    this.schedule();
  }

  /** The interval now: 30 s, or 2 minutes after 3 failures in a row. */
  interval(): number {
    return this.fails >= FAILS_BEFORE_BACKOFF ? BACKOFF_MS : POLL_MS;
  }

  /** Whether a poll is waiting (for the tests). */
  waiting(): boolean {
    return this.timer !== undefined;
  }

  private schedule(): void {
    this.clear();
    if (!this.running || !this.env.visible() || !this.env.online()) return;
    this.timer = this.env.setTimeout(() => {
      this.timer = undefined;
      if (this.running && this.env.visible() && this.env.online()) this.poll();
    }, this.interval());
  }

  private clear(): void {
    if (this.timer !== undefined) this.env.clearTimeout(this.timer);
    this.timer = undefined;
  }
}
