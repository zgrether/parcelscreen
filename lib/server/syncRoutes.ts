/**
 * The sync routes (step 5, docs/plans/step-5-sync.md §4): the only path to the synced spaces. Each takes the code from
 * the `x-sync-code` header, never the URL, and works on the space keyed by the code's SHA-256. A missing code, a
 * malformed one, or one no space has, gets 404 and nothing else. There's no rate limiting: a 130-bit code can't be
 * guessed.
 *
 *   POST /api/sync/space            makes a space for a new code (409 if it's taken)
 *   GET  /api/sync/changes?since=   the profiles, parcels and screen ids changed since then
 *   POST /api/sync/save             a batch of whole records (lib/sync/wire.ts SaveBatch)
 *   GET  /api/sync/screen?id=       one kept screen
 *   GET  /api/health                one tiny read, for the keep-alive; no code
 */
import { z } from "zod";
import { normalizeCode, spaceKeyOf } from "../sync/code";
import type { SyncStore } from "../sync/store";
import { CODE_HEADER, MAX_BATCH_BYTES, SaveBatch } from "../sync/wire";
import { SCREEN_SCHEMA_VERSION } from "../screen/types";

const NO_STORE = { "cache-control": "no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });
const nothing = (status: number) => new Response(null, { status, headers: NO_STORE });

/** The space key for the request's code, or null when the header is missing or isn't a code. */
async function keyOf(req: Request): Promise<string | null> {
  const code = normalizeCode(req.headers.get(CODE_HEADER) ?? "");
  return code ? spaceKeyOf(code) : null;
}

/** The key of an existing space, or null: the caller answers 404 either way. */
async function existing(req: Request, store: SyncStore): Promise<string | null> {
  const key = await keyOf(req);
  return key && (await store.spaceExists(key)) ? key : null;
}

export async function handleCreateSpace(req: Request, store: SyncStore): Promise<Response> {
  const key = await keyOf(req);
  if (!key) return nothing(404);
  return (await store.createSpace(key)) ? nothing(201) : nothing(409);
}

const Since = z.iso.datetime({ offset: true }).nullable();

export async function handleChanges(req: Request, store: SyncStore): Promise<Response> {
  const key = await existing(req, store);
  if (!key) return nothing(404);
  const since = Since.safeParse(new URL(req.url).searchParams.get("since"));
  if (!since.success) return json({ error: "since is an ISO time" }, 400);
  return json(await store.changes(key, since.data, SCREEN_SCHEMA_VERSION));
}

export async function handleSave(req: Request, store: SyncStore): Promise<Response> {
  const key = await existing(req, store);
  if (!key) return nothing(404);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BATCH_BYTES) return nothing(413);
  const text = await req.text();
  if (text.length > MAX_BATCH_BYTES) return nothing(413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: "not JSON" }, 400);
  }
  const batch = SaveBatch.safeParse(body);
  if (!batch.success) return json({ error: "not a save batch" }, 400);
  await store.save(key, batch.data);
  return nothing(204);
}

export async function handleScreen(req: Request, store: SyncStore): Promise<Response> {
  const key = await existing(req, store);
  if (!key) return nothing(404);
  const id = new URL(req.url).searchParams.get("id");
  const screen = id ? await store.screen(key, id) : null;
  return screen ? json(screen) : nothing(404);
}

export async function handleHealth(store: SyncStore): Promise<Response> {
  try {
    await store.health();
    return json({ ok: true });
  } catch {
    return json({ ok: false }, 503);
  }
}
