/**
 * The sync server's settings (after step 6: production's `SUPABASE_URL` held `/rest/v1/`, and every call answered
 * "Invalid path specified in request URL"). The URL is cut to its origin; anything else is refused; health is a real
 * read through the routes' store and answers 503 when the database refuses it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as health } from "@/app/api/health/route";
import { handleHealth } from "./syncRoutes";
import { SupabaseSyncStore } from "./supabaseSyncStore";
import { isConfigError, supabaseOrigin, SyncConfigError } from "./syncConfig";
import { resetSyncStoreForTests, syncStore } from "./syncStore";

describe("SUPABASE_URL, cut to its origin", () => {
  it("keeps a bare origin, and drops a trailing slash or a path such as /rest/v1/", () => {
    expect(supabaseOrigin("https://abc123.supabase.co")).toBe("https://abc123.supabase.co");
    expect(supabaseOrigin("https://abc123.supabase.co/")).toBe("https://abc123.supabase.co");
    expect(supabaseOrigin("https://abc123.supabase.co/rest/v1/")).toBe("https://abc123.supabase.co");
    expect(supabaseOrigin("  https://abc123.supabase.co/rest/v1  ")).toBe("https://abc123.supabase.co");
  });

  it("refuses anything that isn't https://<project>.supabase.co, saying what it expected", () => {
    for (const bad of [
      "https://example.com",
      "https://abc123.supabase.co.example.com",
      "http://abc123.supabase.co",
      "https://abc123.supabase.co:8443",
      "abc123.supabase.co",
      "",
    ]) {
      expect(() => supabaseOrigin(bad)).toThrow(SyncConfigError);
      expect(() => supabaseOrigin(bad)).toThrow(/expected https:\/\/<project>\.supabase\.co/);
    }
  });

  it("the store refuses a bad URL, or a missing setting, as the server's setup", () => {
    resetSyncStoreForTests();
    expect(() => syncStore({ SUPABASE_URL: "https://example.com", SUPABASE_SECRET_KEY: "k" })).toThrow(
      SyncConfigError,
    );
    resetSyncStoreForTests();
    expect(() => syncStore({ SUPABASE_URL: "https://abc123.supabase.co" })).toThrow(SyncConfigError);
    resetSyncStoreForTests();
  });

  it("a wrong path or a refused key is the server's setup; anything else isn't", () => {
    expect(isConfigError({ code: "PGRST125", message: "Invalid path specified in request URL" })).toBe(true);
    expect(isConfigError({ message: "Invalid API key" })).toBe(true);
    expect(isConfigError({ code: "23505", message: "duplicate key value" })).toBe(false);
  });
});

describe("/api/health: a real read through the routes' store", () => {
  /** Supabase's gateway as it answered production: the doubled path is refused, the right one reads. */
  function gateway(refuseAll = false): string[] {
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      seen.push(url);
      return refuseAll || url.includes("/rest/v1/rest/v1/")
        ? Response.json(
            { code: "PGRST125", details: null, hint: null, message: "Invalid path specified in request URL" },
            { status: 404 },
          )
        : Response.json([], { status: 200 });
    });
    return seen;
  }
  const configure = (url: string) => {
    vi.stubEnv("PS_SYNC_STORE", "");
    vi.stubEnv("SUPABASE_URL", url);
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
    resetSyncStoreForTests();
  };
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    resetSyncStoreForTests();
  });

  it("production's bad value: the client used as given doubles the path, and health's read fails with it", async () => {
    const seen = gateway();
    const raw = new SupabaseSyncStore("https://abc123.supabase.co/rest/v1/", "sb_secret_test");
    await expect(handleHealth(raw)).rejects.toBeInstanceOf(SyncConfigError);
    expect(seen[0]).toContain("https://abc123.supabase.co/rest/v1/rest/v1/sync_spaces");
  });

  it("the same value through the routes' store: cut to its origin, the read goes to /rest/v1/ and health is ok", async () => {
    const seen = gateway();
    configure("https://abc123.supabase.co/rest/v1/");
    const r = await health();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(seen[0]).toMatch(/^https:\/\/abc123\.supabase\.co\/rest\/v1\/sync_spaces\?/);
  });

  it("when the database refuses the server's path or key, health answers 503, which fails the keep-alive's curl --fail", async () => {
    gateway(true);
    configure("https://abc123.supabase.co");
    const r = await health();
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: "server-config" });
  });

  it("a URL that isn't a Supabase project's, or none at all: 503 with server-config, before any request", async () => {
    const seen = gateway();
    configure("https://example.com/rest/v1/");
    expect((await health()).status).toBe(503);
    vi.stubEnv("SUPABASE_URL", "");
    resetSyncStoreForTests();
    const r = await health();
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: "server-config" });
    expect(seen).toEqual([]);
  });
});
