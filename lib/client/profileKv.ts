/**
 * The current profile's documents as a key-value store (step 1, PR 4): the prefs module reads and writes the
 * profile-scoped keys through it, synchronously, as it did localStorage. The values are hydrated from IndexedDB once,
 * before the app renders (components/Profile/ProfileGate.tsx), and every write goes to memory and then to storage,
 * best-effort and in order. `flush` waits for the writes so far (the e2e seeds a store and reloads).
 */
import type { ProfileDoc, ProfileStorage } from "./profileStore";

/** The prefs that belong to a profile, not the device (lib/client/prefs.ts has both). */
export const PROFILE_KEYS: ReadonlySet<string> = new Set([
  "ps.parcels",
  "ps.current",
  "ps.cfg",
  "ps.person",
  "ps.compare",
  "ps.library",
  "ps.recentMarks",
  "ps.namesFromNotes",
]);
export const isProfileKey = (key: string): boolean => PROFILE_KEYS.has(key);

export interface KvHandle {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class ProfileKv implements KvHandle {
  private readonly data: Map<string, string>;
  private pending: Promise<unknown> = Promise.resolve();

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
    const doc: ProfileDoc = { profile: this.profile, key, value };
    this.pending = this.pending.then(() => this.storage.putDoc(doc)).catch(() => undefined);
  }

  removeItem(key: string): void {
    this.data.delete(key);
    this.pending = this.pending.then(() => this.storage.deleteDoc(this.profile, key)).catch(() => undefined);
  }

  /** Resolves once every write so far has reached storage (or failed). */
  flush(): Promise<void> {
    return this.pending.then(() => undefined);
  }

  /** Every key held, for tests and the export. */
  keys(): string[] {
    return [...this.data.keys()];
  }
}

let active: ProfileKv | null = null;

/** The current profile's store; null before the profile is booted (then the profile-scoped prefs read as defaults). */
export const activeKv = (): ProfileKv | null => active;
export function setActiveKv(kv: ProfileKv | null): void {
  active = kv;
}
