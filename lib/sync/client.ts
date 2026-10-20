/**
 * The device's calls to the sync routes (step 5, lib/server/syncRoutes.ts). Same origin, so not through lib/http.ts
 * (that's for the public data services). The code goes in the `x-sync-code` header, never the URL.
 */
import { CODE_HEADER, ChangesSchema, type Changes, type SaveBatch, type StoredScreen } from "./wire";

/** A save that takes longer than this counts as failed (plan §9: slow states). */
const SAVE_MS = 10_000;
const FETCH_MS = 15_000;

export type CreateResult = "created" | "taken";

export class SyncHttpError extends Error {
  /** `serverConfig`: the server's own sync setup is wrong (503, `{ error: "server-config" }`), not the connection. */
  constructor(
    readonly status: number,
    readonly serverConfig = false,
  ) {
    super(`sync: HTTP ${status}`);
  }
}

/** A failed answer as an error, telling the server's setup apart from everything else. */
async function failed(r: Response): Promise<SyncHttpError> {
  let config = false;
  if (r.status === 503) {
    try {
      config = ((await r.json()) as { error?: unknown } | null)?.error === "server-config";
    } catch {
      /* not JSON: a proxy's page, say */
    }
  }
  return new SyncHttpError(r.status, config);
}

/** Whether an error from a sync call is the server's setup. */
export const isServerConfig = (e: unknown): boolean => e instanceof SyncHttpError && e.serverConfig;

const call = (path: string, code: string, ms: number, init: RequestInit = {}) =>
  fetch(path, {
    ...init,
    cache: "no-store",
    headers: { ...(init.headers as Record<string, string> | undefined), [CODE_HEADER]: code },
    signal: AbortSignal.timeout(ms),
  });

export async function createSpace(code: string): Promise<CreateResult> {
  const r = await call("/api/sync/space", code, FETCH_MS, { method: "POST" });
  if (r.status === 201) return "created";
  if (r.status === 409) return "taken";
  throw await failed(r);
}

/** The space's changes since `since`, or null when no space has this code. */
export async function fetchChanges(code: string, since: string | null): Promise<Changes | null> {
  const qs = since ? `?since=${encodeURIComponent(since)}` : "";
  const r = await call(`/api/sync/changes${qs}`, code, FETCH_MS);
  if (r.status === 404) return null;
  if (!r.ok) throw await failed(r);
  return ChangesSchema.parse(await r.json());
}

export async function saveBatch(code: string, batch: SaveBatch): Promise<void> {
  const r = await call("/api/sync/save", code, SAVE_MS, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(batch),
  });
  if (!r.ok) throw await failed(r);
}

export async function fetchScreen(code: string, id: string): Promise<StoredScreen | null> {
  const r = await call(`/api/sync/screen?id=${encodeURIComponent(id)}`, code, FETCH_MS);
  if (r.status === 404) return null;
  if (!r.ok) throw await failed(r);
  return (await r.json()) as StoredScreen;
}
