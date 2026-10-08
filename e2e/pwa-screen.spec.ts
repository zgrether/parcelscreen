/**
 * A full screen with the service worker installed and in control (step 18a; plan phase-0-18-acceptance.md
 * §1). It guards against 17c's startup bug: a precached Turbopack worker entry lost its `#params=` bootstrap
 * and the screen never started. Every other e2e blocks the service worker.
 */
import { expect, test, type Page } from "@playwright/test";
import { loadFixture } from "../test/support/fixtures";
import {
  againstGolden,
  GOLDEN,
  expectAllDone,
  importParcel,
  openExplorer,
  postedResult,
  screenIt,
} from "./flow";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A";

test.use({ serviceWorkers: "allow" });

test("Ferney Creek 52-47A with the service worker in control: the screen runs and matches the golden", async ({
  page: first,
  context,
}) => {
  const errors: string[] = [];
  context.on("weberror", (e) => errors.push(e.error().message));
  const net = await replayHar(context, FERNEY);
  await openExplorer(first, FERNEY);
  await first.waitForFunction(
    async () => (await navigator.serviceWorker.getRegistration("/"))?.active?.state === "activated",
  );

  // Relaunch in new tabs until one is controlled. The first tab stays open meanwhile: closing the only client
  // right after activation lost the registration here, and the next tabs started over (installing).
  let page: Page = first;
  for (let i = 0; i < 8 && !(await page.evaluate(() => !!navigator.serviceWorker.controller)); i++) {
    if (page !== first) await page.close();
    page = await context.newPage();
    await page.goto("/explore");
    await page.waitForTimeout(500);
  }
  await first.close();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller), "page controlled").toBe(true);

  const fromSW: string[] = [];
  let workerEntry: { url: string; fromSW: boolean } | null = null;
  context.on("response", (r) => {
    if (/\/turbopack-worker-[^/]*\.js/.test(r.url()))
      workerEntry = { url: r.url(), fromSW: r.fromServiceWorker() };
    else if (!r.url().startsWith("http://localhost") && r.fromServiceWorker()) fromSW.push(r.url());
  });

  await importParcel(page, FERNEY);
  const steps = await screenIt(page);
  expect(net.misses, "data requests the HAR doesn't have").toEqual([]);
  // Routed, not live: the screen's elevation request was answered from the HAR with the service worker in control.
  expect(
    net.served.some((k) => k.includes("/3DEPElevation/ImageServer/exportImage")),
    "3DEP replayed",
  ).toBe(true);
  expectAllDone(steps);
  expect(againstGolden(await postedResult(page), loadFixture(FERNEY).goldens.run), GOLDEN).toEqual([]);

  expect(workerEntry, "the screen worker's entry was requested").not.toBeNull();
  expect(workerEntry!.fromSW, `${workerEntry!.url} served by the service worker`).toBe(false);
  expect(fromSW, "data requests served by the service worker").toEqual([]);
  expect(errors, "page errors").toEqual([]);
});
