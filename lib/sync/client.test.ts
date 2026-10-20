/** The device's sync calls tell the server's own setup apart from a dropped connection (after step 6). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSpace, isServerConfig, SyncHttpError } from "./client";

const answer = (status: number, body?: unknown) =>
  vi.stubGlobal("fetch", async () =>
    body === undefined ? new Response("down", { status }) : Response.json(body, { status }),
  );

async function failure(): Promise<unknown> {
  try {
    await createSpace("ABCDEFGHJKMNPQRSTVWXYZ0123");
  } catch (e) {
    return e;
  }
  throw new Error("expected createSpace to fail");
}

describe("a failed sync call", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("503 with server-config is the server's setup", async () => {
    answer(503, { error: "server-config" });
    const e = await failure();
    expect(e).toBeInstanceOf(SyncHttpError);
    expect(isServerConfig(e)).toBe(true);
  });

  it("anything else isn't: another 503, a 500, a page that isn't JSON, a network error", async () => {
    answer(503, { error: "busy" });
    expect(isServerConfig(await failure())).toBe(false);
    answer(500, { error: "server-config" });
    expect(isServerConfig(await failure())).toBe(false);
    answer(503);
    expect(isServerConfig(await failure())).toBe(false);
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    expect(isServerConfig(await failure())).toBe(false);
  });
});
