/**
 * Which parcels keep a live screen session (step 17e; plan phase-0-17e-switching.md §1): up to SESSION_LIMIT,
 * most recently used last, evicting the least recently used while the total is over SESSION_BUDGET, and never
 * the current parcel. Pure, so it's Node-tested; useScreenIt holds one and tells the worker what to release.
 */

/** Up to this many parcels stay live (owner, 17e). */
export const SESSION_LIMIT = 3;
/** Above this total, the least recently used are released (owner, 17e: about 150 MB). */
export const SESSION_BUDGET = 150 * 1024 * 1024;

export interface SessionEntry<K> {
  /** The parcel's History key. */
  parcel: string;
  /** The worker's run id. */
  runId: number;
  /** The run's keys (what it was screened with), to know whether it still applies. */
  keys: K;
  /** The worker's session plus the view the page holds when it's open (lib/screen arrayBytes). */
  bytes: number;
}

export class SessionLru<K> {
  /** Least recently used first. */
  private entries: SessionEntry<K>[] = [];

  constructor(
    private readonly limit = SESSION_LIMIT,
    private readonly budget = SESSION_BUDGET,
  ) {}

  get(parcel: string): SessionEntry<K> | undefined {
    return this.entries.find((e) => e.parcel === parcel);
  }

  /** Marks a parcel's session as just used. */
  touch(parcel: string): void {
    const e = this.get(parcel);
    if (e) this.entries = [...this.entries.filter((x) => x !== e), e];
  }

  /**
   * Keeps (or replaces) a parcel's session as the most recently used, and returns the sessions to release:
   * a replaced run of the same parcel, then the least recently used while over the limit or the budget,
   * never `current` (the parcel open now).
   */
  put(entry: SessionEntry<K>, current: string | null): SessionEntry<K>[] {
    const released = this.entries.filter((e) => e.parcel === entry.parcel && e.runId !== entry.runId);
    this.entries = [...this.entries.filter((e) => e.parcel !== entry.parcel), entry];
    for (;;) {
      const over = this.entries.length > this.limit || this.total() > this.budget;
      const victim = over ? this.entries.find((e) => e.parcel !== current) : undefined;
      if (!victim) break;
      this.entries = this.entries.filter((e) => e !== victim);
      released.push(victim);
    }
    return released;
  }

  /** Forgets a parcel's session (it was removed, or the worker no longer has it). */
  remove(parcel: string): SessionEntry<K> | undefined {
    const e = this.get(parcel);
    if (e) this.entries = this.entries.filter((x) => x !== e);
    return e;
  }

  total(): number {
    return this.entries.reduce((n, e) => n + e.bytes, 0);
  }

  /** Parcel keys, least recently used first. */
  parcels(): string[] {
    return this.entries.map((e) => e.parcel);
  }
}
