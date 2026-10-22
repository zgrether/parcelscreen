import { describe, expect, it } from "vitest";
import { generateCode } from "../sync/code";
import { MemorySyncStore } from "../sync/store";
import { CODE_HEADER, MAX_BATCH_BYTES, type Changes, type SaveBatch } from "../sync/wire";
import { SCREEN_SCHEMA_VERSION } from "../screen/types";
import { handleChanges, handleCreateSpace, handleHealth, handleSave, handleScreen } from "./syncRoutes";

const BASE = "https://parcelscreen.test/api";
const headers = (code?: string): Record<string, string> =>
  code === undefined ? {} : { [CODE_HEADER]: code };
const post = (path: string, code?: string, body?: unknown) =>
  new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { ...headers(code), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const get = (path: string, code?: string) => new Request(`${BASE}${path}`, { headers: headers(code) });

async function start(store: MemorySyncStore): Promise<string> {
  const code = generateCode();
  expect((await handleCreateSpace(post("/sync/space", code), store)).status).toBe(201);
  return code;
}
const save = (store: MemorySyncStore, code: string, batch: Partial<SaveBatch>) =>
  handleSave(post("/sync/save", code, batch), store);
async function changes(store: MemorySyncStore, code: string, since?: string): Promise<Changes> {
  const r = await handleChanges(
    get(`/sync/changes${since ? `?since=${encodeURIComponent(since)}` : ""}`, code),
    store,
  );
  expect(r.status).toBe(200);
  return (await r.json()) as Changes;
}

const parcel = (key: string, name: string) => ({ key, profile: "p1", record: { key, name } });
const screen = (id: string, schemaVersion: number = SCREEN_SCHEMA_VERSION) => ({
  id,
  profile: "p1",
  schemaVersion,
  record: { id, result: { value: 1 } },
});

describe("the sync routes (step 5 §4), over the memory store", () => {
  it("a missing, malformed or unknown code gets 404 and nothing else, from every route", async () => {
    const store = new MemorySyncStore();
    const code = await start(store);
    await save(store, code, { parcels: [parcel("k1", "Ferney")] });
    const unknown = generateCode();
    for (const c of [undefined, "", "not-a-code", unknown]) {
      for (const r of [
        await handleChanges(get("/sync/changes", c), store),
        await handleSave(post("/sync/save", c, { parcels: [parcel("k1", "Mine now")] }), store),
        await handleScreen(get("/sync/screen?id=s1", c), store),
      ]) {
        expect(r.status).toBe(404);
        expect(await r.text()).toBe("");
      }
    }
    expect((await handleCreateSpace(post("/sync/space", undefined), store)).status).toBe(404);
    expect((await changes(store, code)).parcels.map((p) => p.record)).toEqual([
      { key: "k1", name: "Ferney" },
    ]);
  });

  it("a code is taken once: starting the same space again is refused", async () => {
    const store = new MemorySyncStore();
    const code = await start(store);
    expect((await handleCreateSpace(post("/sync/space", code), store)).status).toBe(409);
  });

  it("two spaces can't see each other's profiles, parcels or screens", async () => {
    const store = new MemorySyncStore();
    const a = await start(store);
    const b = await start(store);
    await save(store, a, {
      profiles: [{ id: "p1", record: { name: "Zach" } }],
      parcels: [parcel("k1", "Ferney")],
      screens: [screen("s1")],
    });
    const seen = await changes(store, b);
    expect(seen).toEqual({ profiles: [], parcels: [], screens: [], household: [], cursor: null });
    expect((await handleScreen(get("/sync/screen?id=s1", b), store)).status).toBe(404);
    expect((await handleScreen(get("/sync/screen?id=s1", a), store)).status).toBe(200);
  });

  it("two devices editing the same parcel end with the later save, whole", async () => {
    const store = new MemorySyncStore();
    const code = await start(store);
    await save(store, code, { parcels: [parcel("k1", "Ferney")] });
    await save(store, code, {
      parcels: [{ key: "k1", profile: "p1", record: { key: "k1", name: "Ferney A", notes: "x" } }],
    });
    await save(store, code, {
      parcels: [{ key: "k1", profile: "p1", record: { key: "k1", name: "Ferney B" } }],
    });
    const [p] = (await changes(store, code)).parcels;
    expect(p!.record).toEqual({ key: "k1", name: "Ferney B" }); // the later save, whole: A's notes are gone too
  });

  it("changes since a cursor: only what's newer, with deletions; the cursor moves to the newest", async () => {
    let now = Date.parse("2026-10-19T12:00:00Z");
    const store = new MemorySyncStore(() => now);
    const code = await start(store);
    await save(store, code, { parcels: [parcel("k1", "Ferney"), parcel("k2", "Macks")] });
    const first = await changes(store, code);
    expect(first.parcels).toHaveLength(2);
    expect(first.cursor).not.toBeNull();
    now += 60_000;
    await save(store, code, { parcels: [{ key: "k2", profile: "p1", record: null }] });
    const next = await changes(store, code, first.cursor!);
    expect(next.parcels).toEqual([expect.objectContaining({ key: "k2", deleted: true, record: null })]);
    expect(Date.parse(next.cursor!)).toBeGreaterThan(Date.parse(first.cursor!));
    expect((await changes(store, code, next.cursor!)).parcels).toEqual([]);
    const bad = await handleChanges(get("/sync/changes?since=yesterday", code), store);
    expect(bad.status).toBe(400);
  });

  it("a screen is inserted once: saved again with other content, it stays as it was first saved", async () => {
    const store = new MemorySyncStore();
    const code = await start(store);
    await save(store, code, { screens: [screen("s1")] });
    await save(store, code, { screens: [{ ...screen("s1"), record: { id: "s1", result: { value: 2 } } }] });
    const r = await handleScreen(get("/sync/screen?id=s1", code), store);
    expect(((await r.json()) as { record: unknown }).record).toEqual({ id: "s1", result: { value: 1 } });
  });

  it("lists only the current schema version's screens", async () => {
    const store = new MemorySyncStore();
    const code = await start(store);
    await save(store, code, { screens: [screen("old", SCREEN_SCHEMA_VERSION - 1), screen("new")] });
    expect((await changes(store, code)).screens).toEqual([{ id: "new", profile: "p1" }]);
  });

  it("deleting a profile marks it and its parcels deleted and drops its screens", async () => {
    const store = new MemorySyncStore();
    const code = await start(store);
    await save(store, code, {
      profiles: [{ id: "p1", record: { name: "Zach" } }],
      parcels: [parcel("k1", "Ferney")],
      screens: [screen("s1")],
    });
    await save(store, code, { profiles: [{ id: "p1", record: null }] });
    const c = await changes(store, code);
    expect(c.profiles).toEqual([expect.objectContaining({ id: "p1", deleted: true, record: null })]);
    expect(c.parcels).toEqual([expect.objectContaining({ key: "k1", deleted: true, record: null })]);
    expect(c.screens).toEqual([]);
    expect((await handleScreen(get("/sync/screen?id=s1", code), store)).status).toBe(404);
  });

  it("refuses a batch that isn't one, and one over the size limit", async () => {
    const store = new MemorySyncStore();
    const code = await start(store);
    const notJson = new Request(`${BASE}/sync/save`, { method: "POST", headers: headers(code), body: "{" });
    expect((await handleSave(notJson, store)).status).toBe(400);
    expect((await save(store, code, { parcels: [{ key: "", profile: "p1", record: {} }] })).status).toBe(400);
    const huge = { parcels: [parcel("k1", "x".repeat(MAX_BATCH_BYTES))] };
    expect((await save(store, code, huge)).status).toBe(413);
    expect((await changes(store, code)).parcels).toEqual([]);
  });

  it("health: { ok } with no code; 503 when the store can't be reached", async () => {
    const r = await handleHealth(new MemorySyncStore());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    const down = new MemorySyncStore();
    down.health = () => Promise.reject(new Error("paused"));
    expect((await handleHealth(down)).status).toBe(503);
  });

  it("every answer says not to cache it", async () => {
    const store = new MemorySyncStore();
    const code = await start(store);
    for (const r of [await handleChanges(get("/sync/changes", code), store), await handleHealth(store)])
      expect(r.headers.get("cache-control")).toBe("no-store");
  });
});

describe("the household's asks and takes (step 6), over the memory store", () => {
  it("save and fetch as whole records by kind and key; the later save wins; a null record deletes", async () => {
    const store = new MemorySyncStore();
    const code = await start(store);
    const ask = { key: "k1:julie", parcel: "k1", from: "zach", to: "julie", note: "Spring?", at: "t1" };
    const take = { key: "k1:julie", parcel: "k1", by: "julie", answer: "maybe", comment: "", at: "t2" };
    await save(store, code, {
      household: [
        { key: ask.key, kind: "ask", record: ask },
        { key: take.key, kind: "take", record: take },
      ],
    });
    let c = await changes(store, code);
    expect(c.household.map((h) => [h.kind, h.key])).toEqual([
      ["ask", "k1:julie"],
      ["take", "k1:julie"],
    ]);
    await save(store, code, {
      household: [{ key: take.key, kind: "take", record: { ...take, answer: "yes" } }],
    });
    c = await changes(store, code);
    expect(c.household.find((h) => h.kind === "take")!.record).toEqual({ ...take, answer: "yes" });
    await save(store, code, { household: [{ key: ask.key, kind: "ask", record: null }] });
    c = await changes(store, code);
    expect(c.household.find((h) => h.kind === "ask")).toMatchObject({ deleted: true, record: null });
    // Another space sees none of it.
    expect((await changes(store, await start(store))).household).toEqual([]);
  });
});

describe("the people's adjustments (step 12), over the memory store", () => {
  it("save and fetch as the household's adjust records; a null record deletes", async () => {
    const store = new MemorySyncStore();
    const code = await start(store);
    const adj = {
      key: "k1:zach:sky",
      parcel: "k1",
      by: "zach",
      factor: "sky",
      kind: "setAside",
      reason: "fine by us",
      was: "C",
      at: "t1",
    };
    await save(store, code, { household: [{ key: adj.key, kind: "adjust", record: adj }] });
    let c = await changes(store, code);
    expect(c.household).toMatchObject([{ kind: "adjust", key: "k1:zach:sky", record: adj }]);
    await save(store, code, { household: [{ key: adj.key, kind: "adjust", record: null }] });
    c = await changes(store, code);
    expect(c.household.find((h) => h.kind === "adjust")).toMatchObject({ deleted: true, record: null });
  });
});
