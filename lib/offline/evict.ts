/**
 * Which cached map tiles to drop when the automatic cache is past its cap (step 14e, docs/plans/step-14e-offline.md
 * §3.3). Pure. The least recently used go first, until the unpinned total is under EVICT_TO of the cap; a tile pinned
 * by a parcel saved offline is never chosen, and doesn't count toward the cap.
 */
import { EVICT_TO } from "./config";

export interface CacheEntry {
  key: string;
  bytes: number;
  /** When it was last answered from the cache, or stored (ms since the epoch). */
  usedAt: number;
  /** The keys of the saved parcels that hold it; none for the automatic cache. */
  pins: readonly string[];
}

/** The unpinned bytes: what the cap counts. */
export const automaticBytes = (entries: readonly CacheEntry[]): number =>
  entries.reduce((n, e) => (e.pins.length ? n : n + e.bytes), 0);

/** The keys to delete, oldest first; none while the automatic cache is within its cap. */
export function chooseEvictions(entries: readonly CacheEntry[], capBytes: number): string[] {
  const total = automaticBytes(entries);
  if (total <= capBytes) return [];
  const goal = total - capBytes * EVICT_TO;
  const oldest = entries.filter((e) => !e.pins.length).sort((a, b) => a.usedAt - b.usedAt);
  const out: string[] = [];
  let freed = 0;
  for (const e of oldest) {
    if (freed >= goal) break;
    out.push(e.key);
    freed += e.bytes;
  }
  return out;
}
