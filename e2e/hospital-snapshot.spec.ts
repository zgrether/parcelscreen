/**
 * The hospital snapshot (A2c) loads only in the screen worker, lazily at screen time (owner, #82): not with the
 * page, not in the main thread, and not in the service worker's precache.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { HOSPITAL_SNAPSHOT_MARKER } from "@/lib/screen/hospitalsMarker";
import { expectAllDone, importParcel, openExplorer, screenIt } from "./flow";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A";

/** The built chunk that holds hospitals.json, found by its source line. */
function snapshotChunk(): string {
  const dir = join(".next", "static", "chunks");
  const hits = readdirSync(dir).filter(
    (f) => f.endsWith(".js") && readFileSync(join(dir, f), "utf8").includes(HOSPITAL_SNAPSHOT_MARKER),
  );
  expect(hits, "exactly one chunk holds the snapshot").toHaveLength(1);
  return `/_next/static/chunks/${hits[0]}`;
}

test("the hospital snapshot: not with the page, fetched by the screen worker at screen time, never precached", async ({
  page,
  context,
}) => {
  const chunk = snapshotChunk();
  const fetched: string[] = [];
  context.on("request", (r) => {
    if (new URL(r.url()).pathname === chunk) fetched.push(r.url());
  });
  const net = await replayHar(context, FERNEY);
  await openExplorer(page, FERNEY);
  await page.waitForLoadState("networkidle");
  expect(fetched, "loaded with the page").toEqual([]);

  await importParcel(page, FERNEY);
  expectAllDone(await screenIt(page));
  expect(net.misses).toEqual([]);
  expect(fetched, "fetched once, when the screen ran").toHaveLength(1);
  // Not by the main thread: its resource timeline never saw it (a worker's loads are in the worker's own).
  const mainThread = await page.evaluate(
    (c) => performance.getEntriesByType("resource").some((e) => new URL(e.name).pathname === c),
    chunk,
  );
  expect(mainThread, "loaded by the main thread").toBe(false);

  // Not in the service worker's precache manifest (other chunks are).
  const sw = await (await page.request.get("/serwist/sw.js")).text();
  expect(sw).toContain("/_next/static/chunks/");
  expect(sw).not.toContain(chunk);
});
