import { describe, expect, it } from "vitest";
import { createReplayFetch, ReplayMissError, requestKey, type Har, type HarEntry } from "./replayFetch";

function entry(
  method: string,
  url: string,
  res: { status?: number; text: string; encoding?: string; mimeType?: string },
  form?: string,
): HarEntry {
  return {
    startedDateTime: "2026-10-04T00:00:00Z",
    request: {
      method,
      url,
      headers: [],
      ...(form ? { postData: { mimeType: "application/x-www-form-urlencoded", text: form } } : {}),
    },
    response: {
      status: res.status ?? 200,
      statusText: "OK",
      headers: [{ name: "Content-Type", value: res.mimeType ?? "application/json" }],
      content: {
        size: res.text.length,
        mimeType: res.mimeType ?? "application/json",
        text: res.text,
        encoding: res.encoding,
      },
    },
  };
}

const har: Har = {
  log: {
    entries: [
      entry("GET", "https://example.test/q?b=2&a=1", { text: '{"ok":1}' }),
      entry(
        "POST",
        "https://example.test/query",
        { text: '{"ok":"form"}' },
        "f=geojson&where=1%3D1&outFields=*",
      ),
      entry("GET", "https://example.test/tile.bin", {
        text: Buffer.from([0, 1, 2, 250]).toString("base64"),
        encoding: "base64",
        mimeType: "application/octet-stream",
      }),
      entry("GET", "https://example.test/flaky", { status: 500, text: "boom" }),
      entry("GET", "https://example.test/flaky", { text: "fine" }),
      entry("GET", "https://example.test/aborted", { status: 0, text: "" }),
    ],
  },
};

describe("replayFetch", () => {
  it("matches GET query parameters regardless of order", async () => {
    const f = createReplayFetch(har);
    const r = await f("https://example.test/q?a=1&b=2");
    expect(await r.json()).toEqual({ ok: 1 });
  });

  it("matches form-encoded POST bodies regardless of parameter order", async () => {
    const f = createReplayFetch(har);
    const body = new URLSearchParams({ outFields: "*", f: "geojson", where: "1=1" });
    const r = await f("https://example.test/query", { method: "POST", body });
    expect(await r.json()).toEqual({ ok: "form" });
  });

  it("returns base64-recorded bodies as the original bytes", async () => {
    const f = createReplayFetch(har);
    const buf = new Uint8Array(await (await f("https://example.test/tile.bin")).arrayBuffer());
    expect([...buf]).toEqual([0, 1, 2, 250]);
  });

  it("replays repeated requests in recorded order, then repeats the last", async () => {
    const f = createReplayFetch(har);
    expect((await f("https://example.test/flaky")).status).toBe(500);
    expect(await (await f("https://example.test/flaky")).text()).toBe("fine");
    expect(await (await f("https://example.test/flaky")).text()).toBe("fine");
  });

  it("throws ReplayMissError for anything not recorded, including aborted entries", async () => {
    const f = createReplayFetch(har);
    await expect(f("https://example.test/q?a=1&b=3")).rejects.toBeInstanceOf(ReplayMissError);
    await expect(f("https://example.test/aborted")).rejects.toThrow(
      /No recorded response for GET https:\/\/example.test\/aborted/,
    );
  });

  it("records the keys it was asked for", async () => {
    const f = createReplayFetch(har);
    await f("https://example.test/q?b=2&a=1");
    expect(f.requests).toEqual([requestKey("GET", "https://example.test/q?a=1&b=2")]);
  });

  it("leaves the real network blocked (test/setup.ts)", async () => {
    await expect(fetch("https://example.test/anything")).rejects.toThrow(
      /Network access in tests is not allowed/,
    );
  });
});
