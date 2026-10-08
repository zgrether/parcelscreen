/**
 * A lost screen worker (step 17e, owner's addition to #73): terminated while a phone app is in the background,
 * or crashed. The page notices, forgets every kept session, and a kept parcel reopened afterwards shows the usual
 * "Run again to restore…" note, with no error. A new run then works on a fresh worker.
 */
import { expect, test, type Page } from "@playwright/test";
import { expectAllDone, importParcels, openExplorer, openFromHistory, screenIt } from "./flow";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A";
const MACKS = "macks-mountain-35-3";
const NOTE = "Run again to restore the map overlays and horizon fan.";

const live = (page: Page) =>
  page.evaluate(() => !!(window as unknown as { __psScreen: { view: unknown } }).__psScreen.view);
/** The screen's Web Worker (MapLibre runs workers of its own). */
const screenWorker = (page: Page) => page.workers().find((w) => /turbopack-worker/.test(w.url()));

test("a terminated or crashed worker: kept parcels fall back to the re-run note, with no error", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await replayHar(context, [FERNEY, MACKS]);
  await openExplorer(page, FERNEY);
  await importParcels(page, [FERNEY, MACKS]);

  for (const how of ["terminated", "crashed"] as const) {
    // Ferney screened, then left for Macks: Ferney's session is kept.
    if (
      (await page.locator(".sh-name").count()) === 0 ||
      (await page.locator(".sh-name").first().innerText()) !== "52-47A"
    )
      await openFromHistory(page, "52-47A");
    expectAllDone(await screenIt(page));
    await expect.poll(() => live(page)).toBe(true);
    await openFromHistory(page, "35-3");

    // The worker goes: closed from inside (as the OS would, with no event) or by an uncaught error.
    const w = screenWorker(page);
    expect(w, "the screen worker").toBeDefined();
    if (how === "terminated") await w!.evaluate(() => (self as unknown as { close(): void }).close());
    else
      await w!.evaluate(() =>
        setTimeout(() => {
          throw new Error("worker crash (test)");
        }),
      );

    // Reopen the kept parcel: the page finds the worker gone and falls back, quietly.
    await openFromHistory(page, "52-47A");
    await expect(page.getByText(NOTE).first(), `the re-run note after the worker ${how}`).toBeVisible({
      timeout: 10_000,
    });
    expect(await live(page)).toBe(false);
    await expect(page.getByText(/no longer available|didn't start/i)).toHaveCount(0);
    expect(errors, `page errors after the worker ${how}`).toEqual([]);
  }

  // A new run works, on a fresh worker.
  expectAllDone(await screenIt(page));
  await expect.poll(() => live(page)).toBe(true);
  expect(errors, "page errors").toEqual([]);
});

test("a slow first step isn't a lost worker: the start is acknowledged at once, so no retry and no message", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // The first elevation response takes 30 s: beyond the 20 s start timer, inside the DEM's own 45 s limit.
  const net = await replayHar(context, FERNEY, {
    match: /3DEPElevation\/ImageServer\/exportImage/,
    ms: 30_000,
  });
  await openExplorer(page, FERNEY);
  await importParcels(page, [FERNEY]);
  await openFromHistory(page, "52-47A");
  const t0 = Date.now();
  expectAllDone(await screenIt(page));
  expect(Date.now() - t0, "the run waited for the slow response").toBeGreaterThan(30_000);
  // One worker did it all: the fine and the wide DEM were asked once each (a retry would ask again).
  expect(net.served.filter((k) => k.includes("/3DEPElevation/ImageServer/exportImage"))).toHaveLength(2);
  await expect(page.getByText(/didn't start|no longer available/i)).toHaveCount(0);
  expect(await live(page)).toBe(true);
  expect(errors, "page errors").toEqual([]);
});
