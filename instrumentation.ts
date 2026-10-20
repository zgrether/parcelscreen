/**
 * Runs once as each server instance starts (Next.js instrumentation): checks the sync's settings, so a wrong
 * `SUPABASE_URL` is in the logs at once, not only when someone first tries to sync.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { checkSyncConfig } = await import("./lib/server/syncStore");
  checkSyncConfig();
}
