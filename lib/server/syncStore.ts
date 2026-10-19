/**
 * The routes' store (step 5): Supabase in production and on previews, from the server-only `SUPABASE_URL` and
 * `SUPABASE_SECRET_KEY`; the memory store when `PS_SYNC_STORE=memory`, which only the e2e's production build sets, so
 * CI never touches the production database. Never `NEXT_PUBLIC_`: the secret key bypasses row-level security.
 */
import { MemorySyncStore, type SyncStore } from "../sync/store";
import { SupabaseSyncStore } from "./supabaseSyncStore";

let store: SyncStore | null = null;

/** The store, or null when the server has no database configured (the routes then answer 503). */
export function syncStore(env: NodeJS.ProcessEnv = process.env): SyncStore | null {
  if (store) return store;
  if (env.PS_SYNC_STORE === "memory") return (store = new MemorySyncStore());
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return (store = new SupabaseSyncStore(url, key));
}

/** A route's answer when there's no store. */
export const noStore = (): Response =>
  Response.json(
    { error: "sync isn't configured on this server" },
    { status: 503, headers: { "cache-control": "no-store" } },
  );
