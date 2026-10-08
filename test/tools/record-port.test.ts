/**
 * Records the requests only the port makes (Batch A, A2a): every scenario of every fixture is run against the
 * fixture's recordings, and each request they can't answer goes to the live service once, with a browser
 * User-Agent, and is kept in test/fixtures/<slug>/network-port.har. Tests then replay it with the prototype's
 * network.har (loadFixture's replayHar), offline as ever.
 *
 *   pnpm record:port            records what's missing (never re-records what's there), and drops what no
 *                               scenario asks for any more (a request the port has since changed)
 *
 * Run by hand, never in CI: it reaches the public services. The prototype's network.har is never touched.
 */
import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createHttpClient, realClock } from "@/lib/http";
import { FIXTURE_SLUGS, loadFixture } from "../support/fixtures";
import {
  createReplayFetch,
  loadHar,
  ReplayMissError,
  requestKey,
  type Har,
  type HarEntry,
} from "../support/replayFetch";
import { runScenario, SCENARIOS } from "../support/scenarios";

/** Some services (the TN parcel WAF, Overpass) refuse a non-browser User-Agent. */
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const DROP = new Set(["content-encoding", "content-length", "transfer-encoding", "connection"]);

const bodyOf = (b: BodyInit | null | undefined): string | null =>
  b == null ? null : typeof b === "string" ? b : b instanceof URLSearchParams ? b.toString() : null;

describe.runIf(import.meta.env.MODE === "record-port")("record the port's own requests", () => {
  it.each(FIXTURE_SLUGS)(
    "%s",
    async (slug) => {
      const live = (globalThis as unknown as Record<symbol, typeof fetch>)[
        Symbol.for("parcelscreen.liveFetch")
      ]!;
      const path = join(resolve(process.cwd(), "test", "fixtures"), slug, "network-port.har");
      const kept: HarEntry[] = existsSync(path) ? loadHar(path).log.entries : [];
      const added: HarEntry[] = [];
      const answers: { requests: readonly string[] }[] = [];
      const replay = () =>
        createReplayFetch({ log: { entries: [...loadFixture(slug).replayHar.log.entries, ...added] } });

      const asked = new Set<string>();
      const recording = (): typeof fetch => {
        const answer = replay();
        answers.push(answer);
        return (async (input: string | URL | Request, init?: RequestInit) => {
          try {
            return await answer(input, init);
          } catch (e) {
            if (!(e instanceof ReplayMissError)) throw e;
          }
          const url = String(input),
            method = init?.method ?? "GET",
            body = bodyOf(init?.body);
          const headers = new Headers(init?.headers);
          headers.set("User-Agent", BROWSER_UA);
          if (body && !headers.has("content-type"))
            headers.set("content-type", "application/x-www-form-urlencoded");
          const r = await live(url, {
            method,
            ...(body ? { body } : {}),
            headers,
            ...(init?.signal ? { signal: init.signal } : {}),
          });
          const bytes = Buffer.from(await r.arrayBuffer());
          const kept: [string, string][] = [...r.headers].filter(([n]) => !DROP.has(n.toLowerCase()));
          added.push({
            startedDateTime: new Date().toISOString(),
            request: {
              method,
              url,
              headers: [...headers].map(([name, value]) => ({ name, value })),
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
      };

      // Real time, so the per-host throttle really waits (1 request a second to the volunteer services).
      const deps = () => ({
        http: createHttpClient({ env: "node", fetchImpl: recording(), clock: realClock }),
      });
      for (const scenario of SCENARIOS[slug]) await runScenario(slug, scenario, deps);

      // Keep only what this run asked for: a request the port no longer makes is dropped.
      for (const a of answers) for (const k of a.requests) asked.add(k);
      const keyOf = (e: HarEntry) =>
        requestKey(
          e.request.method,
          e.request.url,
          e.request.postData?.text ?? null,
          e.request.postData?.mimeType,
        );
      const used = kept.filter((e) => asked.has(keyOf(e)));
      const dropped = kept.length - used.length;
      const har: Har = { log: { entries: [...used, ...added] } };
      writeFileSync(
        path,
        JSON.stringify({
          log: {
            version: "1.2",
            creator: { name: "pnpm record:port", version: "1" },
            entries: har.log.entries,
          },
        }),
      );
      console.log(
        `${slug}: ${added.length} new request(s) recorded, ${used.length} kept, ${dropped} dropped`,
      );
      expect(added.every((e) => e.response.status > 0)).toBe(true);
    },
    600_000,
  );
});
