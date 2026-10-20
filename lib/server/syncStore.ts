/**
 * The routes' store (step 5): Supabase in production and on previews, from the server-only `SUPABASE_URL` and
 * `SUPABASE_SECRET_KEY`; the memory store when `PS_SYNC_STORE=memory`, which only the e2e's production build sets, so
 * CI never touches the production database. Never `NEXT_PUBLIC_`: the secret key bypasses row-level security.
 *
 * A setup problem (a setting missing, `SUPABASE_URL` not a Supabase project's address, or the database refusing the
 * server's path or key) is a SyncConfigError. It's logged as the server starts (instrumentation.ts) and on each call,
 * and every route answers 503 with `{ error: "server-config" }`, which the device shows as a server problem.
 */
import { MemorySyncStore, type SyncStore } from "../sync/store";
import { SupabaseSyncStore } from "./supabaseSyncStore";
import { SERVER_CONFIG, supabaseOrigin, SyncConfigError } from "./syncConfig";

let store: SyncStore | null = null;

/** The store; a SyncConfigError when the server's settings can't make one. */
export function syncStore(env: Readonly<Record<string, string | undefined>> = process.env): SyncStore {
  if (store) return store;
  if (env.PS_SYNC_STORE === "memory") return (store = new MemorySyncStore());
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;
  if (!url || !key)
    throw new SyncConfigError(
      "sync isn't configured on this server: set SUPABASE_URL and SUPABASE_SECRET_KEY.",
    );
  return (store = new SupabaseSyncStore(supabaseOrigin(url), key));
}

/** For tests: forget the store, so the next call reads the settings again. */
export function resetSyncStoreForTests(): void {
  store = null;
}

/** As the server starts: a wrong setting shows in the logs at once, before anyone tries to sync. */
export function checkSyncConfig(env: Readonly<Record<string, string | undefined>> = process.env): void {
  try {
    syncStore(env);
  } catch (e) {
    if (!(e instanceof SyncConfigError)) throw e;
    console.error(`sync: ${e.message}`);
  }
}

/** A route's answer when the server's sync setup is wrong. */
export const serverConfig = (): Response =>
  Response.json({ error: SERVER_CONFIG }, { status: 503, headers: { "cache-control": "no-store" } });

/** Runs a route with the store. A setup problem, found now or by the store's call, answers serverConfig(). */
export async function withStore(handle: (store: SyncStore) => Promise<Response>): Promise<Response> {
  try {
    return await handle(syncStore());
  } catch (e) {
    if (!(e instanceof SyncConfigError)) throw e;
    console.error(`sync: ${e.message}`);
    return serverConfig();
  }
}
