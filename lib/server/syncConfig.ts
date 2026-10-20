/**
 * The sync server's configuration (after step 6: production's sync failed with every call answering "Invalid path
 * specified in request URL", because `SUPABASE_URL` held a path, `/rest/v1/`, which supabase-js appends again).
 *
 * `SUPABASE_URL` is cut to its origin before the client is made, and anything that isn't `https://<project>.supabase.co`
 * is refused with a plain message. A store error that can only come from the server's own setup (a wrong path, a wrong
 * key) is a SyncConfigError too, so the routes say so instead of looking like a dropped connection.
 */

/** The server's sync setup is wrong: the routes answer 503 with `{ error: "server-config" }`. */
export class SyncConfigError extends Error {}

/** The routes' error code for a setup problem; the device shows "The sync server isn't set up correctly." */
export const SERVER_CONFIG = "server-config";

const EXPECTED = "expected https://<project>.supabase.co";

/** `SUPABASE_URL` as the client needs it: the origin alone, with no path or trailing slash. */
export function supabaseOrigin(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new SyncConfigError(`SUPABASE_URL isn't a URL; ${EXPECTED}.`);
  }
  if (url.protocol !== "https:" || url.port !== "" || !/^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname))
    throw new SyncConfigError(`SUPABASE_URL is ${url.origin}; ${EXPECTED}.`);
  return url.origin;
}

/**
 * Whether a Supabase error comes from the server's setup rather than the request: a path the API doesn't have
 * (PGRST125), a key it refuses (PGRST301, "Invalid API key").
 */
export function isConfigError(error: { code?: string; message: string }): boolean {
  return error.code === "PGRST125" || error.code === "PGRST301" || /invalid api key/i.test(error.message);
}
