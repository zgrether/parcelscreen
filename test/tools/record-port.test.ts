/**
 * Records the requests only the port makes (Batch A, A2a): every scenario of every fixture is run against the
 * fixture's recordings, and each request they can't answer goes to the live service once, with a browser
 * User-Agent, and is kept in test/fixtures/<slug>/network-port.har. Tests then replay it with the prototype's
 * network.har (loadFixture's replayHar), offline as ever.
 *
 *   pnpm record:port            records what's missing (never re-records what's there), and drops what no
 *                               scenario (or PORT_RUNS run) asks for any more (a request the port has since changed)
 *   PORT_APPEND=<slug> pnpm record:port
 *                               that fixture only, and append only: every entry already there is kept as it is,
 *                               asked for or not (step 2: Mud Creek gains its TREC answers; owner, 2026-10-17)
 *
 * Run by hand, never in CI: it reaches the public services. The prototype's network.har is never touched.
 */
import { existsSync } from "node:fs";
import { setDefaultAutoSelectFamilyAttemptTimeout } from "node:net";
import { describe, expect, it } from "vitest";
import { createHttpClient, realClock } from "@/lib/http";
import { DEFAULT_ENDPOINTS } from "@/lib/screen/config";
import { fetchTile, tilesFor } from "@/lib/geo/parcelTiles";
import { searchParcelNumbers } from "@/lib/search/sources";
import { SERVER_USER_AGENT } from "@/lib/server/http";
import { FIXTURE_SLUGS, fixturePlaces, loadFixture, ROAN_SEARCH } from "../support/fixtures";
import {
  createReplayFetch,
  loadHar,
  ReplayMissError,
  requestKey,
  type Har,
  type HarEntry,
} from "../support/replayFetch";
import { portHarPath, writePortHar } from "../support/portHar";
import { redGate, toTheBoundary } from "../support/redGate";
import { runFixture, runScenario, SCENARIOS } from "../support/scenarios";
import { mudCountyParcel, mudPieceInputs } from "../support/splitScenario";
import { screen, type ScreenDeps } from "@/lib/screen";

/**
 * Runs besides the golden scenarios whose requests the tests replay (they have no expected.json entry). WF6 (#140
 * review): Grayson with the red-gate easement chosen as the driveway, so the drives timed from its road end (a moved
 * drive start: OSRM's table and route out, Overpass's parking) replay offline (lib/screen/reroute.test.ts).
 */
const PORT_RUNS: Partial<
  Record<(typeof FIXTURE_SLUGS)[number], ((deps: () => ScreenDeps) => Promise<unknown>)[]>
> = {
  "grayson-mud-creek-6273": [
    (deps) =>
      runFixture(
        "grayson-mud-creek-6273",
        { lines: [toTheBoundary(redGate)], drivewayLine: "red-gate" },
        deps(),
      ),
    // Step 14 PR 6 (e2e/split-scenario.spec.ts): the two pieces of Mud Creek's split, each its own screen, as the
    // app's Grade both pieces runs them.
    async (deps) => {
      for (const input of mudPieceInputs()) await screen(input, undefined, deps());
    },
    // Owner, after #312 (screenshots/after-312.spec.ts): the same split of the county record a tap opens, both parts.
    async (deps) => {
      for (const input of mudPieceInputs(await mudCountyParcel(deps().http)))
        await screen(input, undefined, deps());
    },
  ],
  // Step 2 (e2e/tennessee.spec.ts): the Tennessee parcel lines around Roan at zoom 15 and up, and its parcel-number
  // search, as the browser asks them, so the map's tap and search replay offline.
  "roan-hwy-143-099-046-02": [
    async (deps) => {
      const { point } = loadFixture("roan-hwy-143-099-046-02").input;
      const http = deps().http!;
      const d = 0.03;
      const box = { west: point.lon - d, east: point.lon + d, south: point.lat - d, north: point.lat + d };
      for (const tile of tilesFor(box)) await fetchTile(http, ROAN_PARCELS, tile, "fine");
      await searchParcelNumbers(http, new Map([[ROAN_PARCELS, new Set(["Carter"])]]), ROAN_SEARCH);
    },
  ],
};

/** Some services (the TN parcel WAF) refuse a non-browser User-Agent. */
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
/**
 * Overpass, the other way round (checked 2026-10-12): overpass-api.de answers a browser User-Agent from a script with
 * 406, and the app's own identifying one with the data. That's what the app's server route sends it in production.
 */
const uaFor = (url: string) =>
  DEFAULT_ENDPOINTS.overpass.some((u) => url.startsWith(u)) ? SERVER_USER_AGENT : BROWSER_UA;
const ROAN_PARCELS = DEFAULT_ENDPOINTS.parcels.find((u) => u.includes("Tennessee_Property_Boundaries"))!;

/**
 * Node gives each of a host's addresses 250 ms to connect, and the run's terrain work holds the event loop longer than
 * that: a request asked at the start (step 14's county) then failed with "fetch failed" (AggregateError) and was
 * never recorded. A connect attempt here has 5 s.
 */
setDefaultAutoSelectFamilyAttemptTimeout(5000);

/** PORT_APPEND=<slug>: record that fixture's missing requests only, keeping every entry already there. */
const APPEND = process.env.PORT_APPEND ?? "";
const DROP = new Set(["content-encoding", "content-length", "transfer-encoding", "connection"]);

const bodyOf = (b: BodyInit | null | undefined): string | null =>
  b == null ? null : typeof b === "string" ? b : b instanceof URLSearchParams ? b.toString() : null;

describe.runIf(import.meta.env.MODE === "record-port")("record the port's own requests", () => {
  it.each(APPEND ? FIXTURE_SLUGS.filter((s) => s === APPEND) : FIXTURE_SLUGS)(
    "%s",
    async (slug) => {
      const live = (globalThis as unknown as Record<symbol, typeof fetch>)[
        Symbol.for("parcelscreen.liveFetch")
      ]!;
      // The only file this tool writes (test/support/portHar.ts refuses any other).
      const path = portHarPath(slug);
      const kept: HarEntry[] = existsSync(path) ? loadHar(path).log.entries : [];
      const added: HarEntry[] = [];
      const answers: { requests: readonly string[] }[] = [];
      // The baked places come from the fixture's frozen copy, never live (step 14d plan §1).
      const replay = () =>
        createReplayFetch(
          { log: { entries: [...loadFixture(slug).replayHar.log.entries, ...added] } },
          fixturePlaces(slug),
        );

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
          headers.set("User-Agent", uaFor(url));
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
      for (const run of PORT_RUNS[slug] ?? []) await run(deps);

      // Keep only what this run asked for: a request the port no longer makes is dropped.
      for (const a of answers) for (const k of a.requests) asked.add(k);
      const keyOf = (e: HarEntry) =>
        requestKey(
          e.request.method,
          e.request.url,
          e.request.postData?.text ?? null,
          e.request.postData?.mimeType,
        );
      const used = APPEND ? kept : kept.filter((e) => asked.has(keyOf(e)));
      const dropped = kept.length - used.length;
      const har: Har = { log: { entries: [...used, ...added] } };
      writePortHar(path, har);
      console.log(
        `${slug}: ${added.length} new request(s) recorded, ${used.length} kept, ${dropped} dropped`,
      );
      expect(added.every((e) => e.response.status > 0)).toBe(true);
    },
    600_000,
  );
});
