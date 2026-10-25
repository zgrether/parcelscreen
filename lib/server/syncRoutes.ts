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
 *   POST /api/sync/invite           keeps a one-use invite to the space (UX part 2 PR 5b)
 *   POST /api/sync/invite/redeem    uses an invite, once: its sealed code (no code header: the invite is the key)
 */
import { z } from "zod";
import { normalizeCode, spaceKeyOf } from "../sync/code";
import type { SyncStore } from "../sync/store";
import { CODE_HEADER, InviteCreate, InviteRedeem, MAX_BATCH_BYTES, SaveBatch } from "../sync/wire";
import { INVITE_DAYS } from "../sync/invite";
import { SCREEN_SCHEMA_VERSION } from "../screen/types";
import { SyncConfigError } from "./syncConfig";

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

/** A small JSON body, parsed with its schema; null when it isn't one. */
async function small<T>(req: Request, schema: z.ZodType<T>): Promise<T | null> {
  const text = await req.text();
  if (text.length > 1000) return null;
  try {
    const r = schema.safeParse(JSON.parse(text));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export async function handleCreateInvite(req: Request, store: SyncStore): Promise<Response> {
  const key = await existing(req, store);
  if (!key) return nothing(404);
  const body = await small(req, InviteCreate);
  if (!body) return json({ error: "not an invite" }, 400);
  await store.createInvite(key, body.token, body.sealed);
  return nothing(201);
}

export async function handleRedeemInvite(req: Request, store: SyncStore): Promise<Response> {
  const body = await small(req, InviteRedeem);
  if (!body) return json({ error: "not an invite" }, 400);
  const sealed = await store.redeemInvite(body.token, INVITE_DAYS * 86_400_000);
  // Used, too old, or never made: the same answer, so a link says nothing about why.
  return sealed ? json({ sealed }) : nothing(410);
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
  } catch (e) {
    if (e instanceof SyncConfigError) throw e; // withStore answers it: { error: "server-config" }, 503
    console.error(`sync: health: ${e instanceof Error ? e.message : String(e)}`);
    return json({ ok: false }, 503);
  }
}
