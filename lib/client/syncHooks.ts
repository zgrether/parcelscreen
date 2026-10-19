/**
 * Where the device's storage tells the sync about its writes (step 5, docs/plans/step-5-sync.md §5). The profile
 * documents, the profiles and the screen store call these; on a joined device the sync engine (lib/sync/engine.ts)
 * registers itself, and on an unjoined one nothing is registered and every call does nothing, so the app works exactly
 * as it did.
 */
import type { ScreenRecord } from "./screenStore";

export interface SyncHooks {
  /** A profile document was written or removed (lib/client/profileKv.ts). */
  docWritten(profile: string, key: string): void;
  /** A profile was added or renamed. */
  profileChanged(id: string): void;
  profileDeleted(id: string): void;
  /** Screens kept on this device: a run's result, or an import's. */
  screensKept(records: readonly ScreenRecord[]): void;
  /** A screen this device doesn't have, from the space; null when the space hasn't it either, or can't be reached. */
  fetchScreen(id: string): Promise<ScreenRecord | null>;
}

let hooks: SyncHooks | null = null;

export function registerSyncHooks(h: SyncHooks | null): void {
  hooks = h;
}

export const syncHooks = (): SyncHooks | null => hooks;
