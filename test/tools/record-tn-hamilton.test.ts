/**
 * Records Hamilton County's parcel answers for the unit tests (the Tennessee counties mission,
 * docs/plans/tn-counties.md): test/support/tnHamilton.ts hamiltonSamples run once against the live Live_Parcels layer,
 * every request kept in test/fixtures/tn-hamilton/parcels.har with owner and address fields scrubbed (scrubHar.ts).
 * Then the Three Gorges lot is graded live, and what the grade found goes to test-results/tn-hamilton-grade.md (the
 * job summary; nothing of it is kept in the repo).
 *
 *   pnpm record:tn-hamilton
 *
 * Run on CI's runners (tn-counties.yml), which reach the county's host; never in the test suite.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createHttpClient, realClock } from "@/lib/http";
import { parcelFacts } from "@/lib/geo/parcels";
import { screen } from "@/lib/screen";
import { DEFAULT_USER_CONFIG } from "@/lib/screen/config";
import type { ProgressEvent } from "@/lib/screen/types";
import type { HarEntry } from "../support/replayFetch";
import { scrubEntry } from "../support/scrubHar";
import {
  hamiltonSamples,
  HAMILTON_HAR,
  HAMILTON_HAR_DIR,
  THREE_GORGES_GISLINK,
  THREE_GORGES_TAX_CARD,
} from "../support/tnHamilton";

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

const live = () =>
  (globalThis as unknown as Record<symbol, typeof fetch>)[Symbol.for("parcelscreen.liveFetch")]!;

describe.runIf(import.meta.env.MODE === "record-tn-hamilton")(
  "record Hamilton County's parcel answers",
  () => {
    it("Three Gorges Farms, tract 1: recorded, then graded live", async () => {
      const entries: HarEntry[] = [];
      const recording = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input),
          method = init?.method ?? "GET",
          body = bodyOf(init?.body);
        const headers = new Headers(init?.headers);
        // The state's layer, asked first at the point, wants a browser's User-Agent (record-tn.test.ts).
        headers.set("User-Agent", BROWSER_UA);
        if (body && !headers.has("content-type"))
          headers.set("content-type", "application/x-www-form-urlencoded");
        const r = await live()(url, { method, ...(body ? { body } : {}), headers });
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

      const got = await hamiltonSamples(
        createHttpClient({ env: "node", fetchImpl: recording, clock: realClock }),
      );
      const scrubbed = entries.map((e) => scrubEntry(e).entry);
      mkdirSync(HAMILTON_HAR_DIR, { recursive: true });
      writeFileSync(HAMILTON_HAR, JSON.stringify({ log: { entries: scrubbed } }, null, 1) + "\n");

      const facts = parcelFacts(got.record.geo, got.record.props);
      const out: string[] = [
        "# Hamilton County: Three Gorges Farms, tract 1",
        "",
        `Recorded ${scrubbed.length} requests to ${HAMILTON_HAR}.`,
        "",
        `- Record: ${facts.parcelId}, GISLINK ${facts.keyId}, ${facts.county} County, ${facts.acres.toFixed(2)} ac` +
          `${got.record.multiPart ? ` (${got.record.parts?.length} parts)` : ""}; county record ${facts.countyRecordUrl}`,
        `- A point inside it (${got.inside.map((x) => x.toFixed(5)).join(", ")}) picks: ${got.picked.parcel?.source ?? "nothing"}` +
          ` (${got.picked.report.join("; ") || "first ask"})`,
        `- Its tile: ${got.lines.lines.length} outlines, complete ${got.lines.complete}, failed ${got.lines.failed}; count ${got.count}`,
        `- Search "48 45.24": ${got.search.map((h) => `${h.id} (${h.county})`).join(", ") || "nothing"}`,
        "",
      ];

      // The grade, live, on the record's boundary.
      const steps = new Map<string, string>();
      const t0 = performance.now();
      const { result } = await screen(
        { polygon: got.record.geo.geometry, config: DEFAULT_USER_CONFIG },
        (e: ProgressEvent) => {
          if (e.status !== "run") steps.set(e.step, e.status);
        },
        {
          http: createHttpClient({
            env: "node",
            fetchImpl: live(),
            userAgent: "ParcelScreen/1.0 (Hamilton check)",
          }),
        } as Parameters<typeof screen>[2],
      );
      out.push(
        `## The grade, live (${((performance.now() - t0) / 1000).toFixed(0)} s)`,
        "",
        `- Steps: ${[...steps].map(([s, st]) => `${s} ${st}`).join(", ")}`,
        `- Failed: ${JSON.stringify(result.failed)}; no response: ${JSON.stringify(result.noResponse)}`,
        `- ${result.acres.toFixed(2)} ac; county ${JSON.stringify(result.county)}; house sites ${result.sites?.length ?? 0}, benches ${result.benches?.length ?? 0}`,
        "",
      );
      mkdirSync("test-results", { recursive: true });
      writeFileSync("test-results/tn-hamilton-grade.md", out.join("\n") + "\n");
      console.log(out.join("\n"));

      // What the tests rely on, checked after writing so a surprise can be read in the file and the summary.
      expect(facts.parcelId).toBe(THREE_GORGES_TAX_CARD);
      expect(facts.keyId).toBe(THREE_GORGES_GISLINK);
      expect(got.picked.parcel?.props.OBJECTID).toBe(got.record.props.OBJECTID);
      expect(got.search.map((h) => h.id)).toContain(THREE_GORGES_TAX_CARD);
    }, 900_000);
  },
);
