/**
 * What a joined device remembers (step 5): `ps.sync` in localStorage, a device key, not a profile document. The code
 * (it works like a password), the last fetch's cursor, and the records changed here that weren't saved when the page
 * last stored them: the next open says so once, with Try again and Discard (owner, 10/19, plan §11 Q2). It's not a
 * queue: nothing is retried by itself.
 */
import { z } from "zod";
import { normalizeCode } from "./code";

export const SYNC_KEY = "ps.sync";

export interface Unsaved {
  profiles: string[];
  parcels: { key: string; profile: string }[];
  screens: string[];
  /** Asks and takes (step 6), by "<kind>:<key>". */
  household: string[];
}
export const NO_UNSAVED: Unsaved = { profiles: [], parcels: [], screens: [], household: [] };

export interface SyncState {
  code: string;
  cursor: string | null;
  unsaved: Unsaved;
}

const Schema = z.object({
  code: z.string().transform((c, ctx) => normalizeCode(c) ?? (ctx.addIssue({ code: "custom" }), z.NEVER)),
  cursor: z.string().nullable().default(null),
  unsaved: z
    .object({
      profiles: z.array(z.string()).default([]),
      parcels: z.array(z.object({ key: z.string(), profile: z.string() })).default([]),
      screens: z.array(z.string()).default([]),
      household: z.array(z.string()).default([]),
    })
    .default(NO_UNSAVED),
});

function ls(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** This device's sync, or null when it isn't joined. */
export function readSyncState(): SyncState | null {
  try {
    const raw = ls()?.getItem(SYNC_KEY);
    if (!raw) return null;
    const r = Schema.safeParse(JSON.parse(raw));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export function writeSyncState(s: SyncState | null): void {
  try {
    if (s) ls()?.setItem(SYNC_KEY, JSON.stringify(s));
    else ls()?.removeItem(SYNC_KEY);
  } catch {
    /* storage refused: the device won't stay joined after this page */
  }
}

export const isJoined = (): boolean => readSyncState() !== null;
export const hasUnsaved = (u: Unsaved): boolean =>
  u.profiles.length + u.parcels.length + u.screens.length + u.household.length > 0;
