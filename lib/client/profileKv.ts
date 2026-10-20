/**
 * The current profile's documents as a key-value store (step 1, PR 4): the prefs module reads and writes the
 * profile-scoped keys through it, synchronously, as it did localStorage. The values are hydrated from IndexedDB once,
 * before the app renders (components/Profile/ProfileGate.tsx), and every write goes to memory and then to storage,
 * best-effort. Each write's transaction starts at once, so a burst of writes is in flight together and a page unloaded
 * right after a click has the least to lose (IndexedDB runs same-store readwrite transactions in the order they were
 * created, so later writes still win). `flush` waits for every write in flight (the e2e flushes before a reload).
 */
import type { ProfileDoc, ProfileStorage } from "./profileStore";
import { syncHooks } from "./syncHooks";

/** The prefs that belong to a profile, not the device (lib/client/prefs.ts has both). */
export const PROFILE_KEYS: ReadonlySet<string> = new Set([
  "ps.current",
  "ps.cfg",
  "ps.rubricView",
  "ps.rubrics",
  "ps.interview",
  "ps.compare",
  "ps.library",
  "ps.recentMarks",
  "ps.namesFromNotes",
  "ps.seenTakes",
  "ps.history",
]);
export const isProfileKey = (key: string): boolean => PROFILE_KEYS.has(key);

/**
 * The household's shared documents (step 6, docs/plans/step-6-household.md §1): one list for every profile on the
 * device, and the asks and takes. They're kept under this reserved id in the same documents store, never a profile's.
 */
export const SPACE_ID = "_space";
export const SHARED_KEYS: ReadonlySet<string> = new Set(["ps.parcels", "ps.household"]);
export const isSharedKey = (key: string): boolean => SHARED_KEYS.has(key);

export interface KvHandle {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class ProfileKv implements KvHandle {
  private readonly data: Map<string, string>;
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    readonly profile: string,
    private readonly storage: ProfileStorage,
    docs: readonly ProfileDoc[],
  ) {
    this.data = new Map(docs.map((d) => [d.key, d.value]));
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
    this.track(this.storage.putDoc({ profile: this.profile, key, value }));
    syncHooks()?.docWritten(this.profile, key);
  }

  removeItem(key: string): void {
    this.data.delete(key);
    this.track(this.storage.deleteDoc(this.profile, key));
    syncHooks()?.docWritten(this.profile, key);
  }

  private track(write: Promise<void>): void {
    const settled: Promise<void> = write.catch(() => undefined).finally(() => this.inFlight.delete(settled));
    this.inFlight.add(settled);
  }

  /** Resolves once every write so far has reached storage (or failed). */
  flush(): Promise<void> {
    return Promise.all([...this.inFlight]).then(() => undefined);
  }

  /** Every key held, for tests and the export. */
  keys(): string[] {
    return [...this.data.keys()];
  }
}

let active: ProfileKv | null = null;
let shared: ProfileKv | null = null;

/** The shared documents (step 6); null before the boot (then they read as defaults). */
export const sharedKv = (): ProfileKv | null => shared;
export function setSharedKv(kv: ProfileKv | null): void {
  shared = kv;
}

/** The current profile's store; null before the profile is booted (then the profile-scoped prefs read as defaults). */
export const activeKv = (): ProfileKv | null => active;
export function setActiveKv(kv: ProfileKv | null): void {
  active = kv;
}
