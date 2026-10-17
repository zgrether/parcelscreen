/**
 * Records Tennessee's parcel answers for the unit tests (step 2, PR 2): test/support/tnCarter.ts carterSamples run
 * once against the live public-use layer, every request kept in test/fixtures/tn-carter/parcels.har with owner and
 * address fields scrubbed (scrubHar.ts).
 *
 *   pnpm record:tn        re-records the whole file
 *
 * Run by hand, never in CI: it reaches the Comptroller's service, with the desktop browser User-Agent its WAF wants.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createHttpClient, realClock } from "@/lib/http";
import type { HarEntry } from "../support/replayFetch";
import { scrubEntry } from "../support/scrubHar";
import { carterSamples, TN_HAR, TN_HAR_DIR } from "../support/tnCarter";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const DROP = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
  "date",
  "etag",
]);

const bodyOf = (b: BodyInit | null | undefined): string | null =>
  b == null ? null : typeof b === "string" ? b : b instanceof URLSearchParams ? b.toString() : null;

describe.runIf(import.meta.env.MODE === "record-tn")("record Tennessee's parcel answers", () => {
  it("Carter County", async () => {
    const live = (globalThis as unknown as Record<symbol, typeof fetch>)[
      Symbol.for("parcelscreen.liveFetch")
    ]!;
    const entries: HarEntry[] = [];
    const recording = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input),
        method = init?.method ?? "GET",
        body = bodyOf(init?.body);
      const headers = new Headers(init?.headers);
      headers.set("User-Agent", BROWSER_UA);
      if (body && !headers.has("content-type"))
        headers.set("content-type", "application/x-www-form-urlencoded");
      const r = await live(url, { method, ...(body ? { body } : {}), headers });
      const text = await r.text();
      const kept = [...r.headers].filter(([n]) => !DROP.has(n.toLowerCase()));
      entries.push({
        startedDateTime: new Date().toISOString(),
        request: {
          method,
          url,
          headers: [],
          ...(body ? { postData: { mimeType: headers.get("content-type")!, text: body } } : {}),
        },
        response: {
          status: r.status,
          statusText: r.statusText,
          headers: kept.map(([name, value]) => ({ name, value })),
          content: { size: text.length, mimeType: r.headers.get("content-type") ?? "", text },
        },
      });
      return new Response(text, { status: r.status, statusText: r.statusText, headers: kept });
    }) as typeof fetch;

    const http = createHttpClient({ env: "node", fetchImpl: recording, clock: realClock });
    const got = await carterSamples(http);
    const scrubbed = entries.map((e) => scrubEntry(e).entry);
    mkdirSync(TN_HAR_DIR, { recursive: true });
    writeFileSync(TN_HAR, JSON.stringify({ log: { entries: scrubbed } }, null, 1) + "\n");
    console.log(`wrote ${TN_HAR}: ${scrubbed.length} requests`);
    // What the tests rely on, checked after writing so a surprise can be read in the file.
    expect(got.conflict.props.boundary_conflict).toBe(true);
    expect(got.twoPiece.parts).toHaveLength(2);
  });
});
