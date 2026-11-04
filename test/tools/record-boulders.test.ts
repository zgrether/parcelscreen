/**
 * Records Boulder potential's sanity test (docs/plans/boulders.md §1): Grayson Highlands' boulder field read live
 * (test/support/bouldersGrayson.ts), every request kept in test/fixtures/boulders-grayson/network.har, and what the
 * reading found written to test-results/boulders-grayson.md (the job summary): the soils flagged, the rough patches,
 * and the roughness's spread over the field, so a threshold can be judged from the summary alone.
 *
 *   pnpm record:boulders
 *
 * Run on CI's runners (boulders.yml), which reach 3DEP and NRCS; never in the test suite. It writes the recording
 * whatever the reading found: the unit test then says whether the field reads (and the recording lets the thresholds
 * be tried offline).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createHttpClient, realClock } from "@/lib/http";
import { cliffs, roughness } from "@/lib/screen/boulders";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import type { Har, HarEntry } from "../support/replayFetch";
import { scrubHar } from "../support/scrubHar";
import { BOULDERS_HAR, BOULDERS_HAR_DIR, readGraysonBoulders } from "../support/bouldersGrayson";

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

const live = () =>
  (globalThis as unknown as Record<symbol, typeof fetch>)[Symbol.for("parcelscreen.liveFetch")]!;

/** The value below which a share `q` of the sorted values fall. */
const quantile = (sorted: number[], q: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;

describe.runIf(import.meta.env.MODE === "record-boulders")("record Grayson Highlands' boulder field", () => {
  it("reads it live, records it, and reports what it found", async () => {
    const entries: HarEntry[] = [];
    const recording = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input),
        method = init?.method ?? "GET",
        body = bodyOf(init?.body);
      const headers = new Headers(init?.headers);
      if (body && !headers.has("content-type"))
        headers.set("content-type", "application/x-www-form-urlencoded");
      const r = await live()(url, {
        method,
        ...(body ? { body } : {}),
        headers,
        ...(init?.signal ? { signal: init.signal } : {}),
      });
      // The elevation is a TIFF: kept as base64, as record:port keeps it.
      const bytes = Buffer.from(await r.arrayBuffer());
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
          content: {
            size: bytes.length,
            mimeType: r.headers.get("content-type") ?? "",
            text: bytes.toString("base64"),
            encoding: "base64",
          },
        },
      });
      return new Response(r.status === 204 || r.status === 304 ? null : bytes, {
        status: r.status,
        statusText: r.statusText,
        headers: kept,
      });
    }) as typeof fetch;

    const t0 = performance.now();
    const { d, slope, inside, units, boulders } = await readGraysonBoulders(
      createHttpClient({ env: "node", fetchImpl: recording, clock: realClock }),
    );
    const har: Har = scrubHar({ log: { entries } }).har;
    mkdirSync(BOULDERS_HAR_DIR, { recursive: true });
    writeFileSync(BOULDERS_HAR, JSON.stringify({ log: { entries: har.log.entries } }) + "\n");

    // The roughness's spread inside the field, and how much of it the cliff rule takes.
    const rough = roughness(d),
      cliff = cliffs(d, slope);
    const vals: number[] = [];
    let cliffCells = 0,
      cells = 0;
    for (let i = 0; i < inside.length; i++) {
      if (!inside[i]) continue;
      cells++;
      if (cliff[i]) cliffCells++;
      if (!Number.isNaN(rough[i]!)) vals.push(rough[i]!);
    }
    vals.sort((a, b) => a - b);
    const K = SCREEN_CONSTANTS.boulders;
    const share = (m: number) =>
      ((100 * vals.filter((v) => v >= m).length) / Math.max(1, vals.length)).toFixed(1);
    const out = [
      "# Boulder potential: Grayson Highlands' boulder field",
      "",
      `Recorded ${entries.length} requests to ${BOULDERS_HAR} in ${((performance.now() - t0) / 1000).toFixed(0)} s.`,
      "",
      `- Elevation: ${d.source}, ${d.w} × ${d.h} cells at ${d.res.toFixed(2)} m; ${cells} cells in the field`,
      `- Roughness (m) in the field: median ${quantile(vals, 0.5).toFixed(3)}, 90th ${quantile(vals, 0.9).toFixed(3)}, ` +
        `99th ${quantile(vals, 0.99).toFixed(3)}, max ${vals.at(-1)?.toFixed(3)}`,
      `- Share at or over: 0.2 m ${share(0.2)}%, 0.25 m ${share(0.25)}%, ${K.roughM} m ${share(K.roughM)}%, 0.4 m ${share(0.4)}%, 0.5 m ${share(0.5)}%`,
      `- Cliff cells (a band over ${K.cliffDeg}°, ${K.cliffLenM} m long): ${((100 * cliffCells) / Math.max(1, cells)).toFixed(1)}%`,
      "",
      `## The reading: ${boulders.acres.toFixed(2)} ac of possible boulder ground`,
      "",
      `- Map units on the field: ${units.map((u) => `${u.muname} (${u.acres.toFixed(1)} ac)`).join("; ") || "none"}`,
      `- Flagged soils (${boulders.soilAcres.toFixed(1)} ac): ${boulders.soils.map((s) => `${s.name}, ${s.acres.toFixed(1)} ac [${s.terms.join(", ")}]`).join("; ") || "none"}`,
      `- Rough patches (${boulders.rough?.acres.toFixed(2) ?? "no grid"} ac): ${
        boulders.rough?.patches
          .map((p) => `${p.acres.toFixed(2)} ac at ${p.ll.map((x) => x.toFixed(5)).join(", ")}`)
          .join("; ") || "none"
      }`,
      "",
    ];
    mkdirSync("test-results", { recursive: true });
    writeFileSync("test-results/boulders-grayson.md", out.join("\n") + "\n");
    console.log(out.join("\n"));

    expect(d.source).toBe("USGS 3DEP");
    expect(entries.every((e) => e.response.status === 200)).toBe(true);
  }, 600_000);
});
