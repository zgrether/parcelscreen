/**
 * A full screen with the service worker installed and in control (step 18a; plan phase-0-18-acceptance.md
 * §1). It guards against 17c's startup bug: a precached Turbopack worker entry lost its `#params=` bootstrap
 * and the screen never started. Every other e2e blocks the service worker.
 */
import { expect, test, type Page } from "@playwright/test";
import {
  againstExpected,
  EXPECTED_MSG,
  expectAllDone,
  importParcel,
  openExplorer,
  postedResult,
  screenIt,
} from "./flow";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A";

test.use({ serviceWorkers: "allow" });

test("Ferney Creek 52-47A with the service worker in control: the screen runs and matches expected.json", async ({
  page: first,
  context,
}) => {
  const errors: string[] = [];
  context.on("weberror", (e) => errors.push(e.error().message));
  const net = await replayHar(context, FERNEY);
  await openExplorer(first, FERNEY);
  // expect.poll, not page.waitForFunction: waitForFunction doesn't await an async predicate (its Promise
  // counts as truthy at once), which once made this wait pass before the app had even registered.
  await expect
    .poll(() =>
      first.evaluate(
        async () => (await navigator.serviceWorker.getRegistration("/"))?.active?.state ?? "none",
      ),
    )
    .toBe("activated");

  // A relaunch: the app closed and opened again. The new tab's first load is served by the service worker.
  const page: Page = await context.newPage();
  await first.close();
  const nav = await page.goto("/explore");
  expect(nav?.fromServiceWorker(), "the relaunch served by the service worker").toBe(true);
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
  expect(againstExpected(await postedResult(page), FERNEY, "run"), EXPECTED_MSG).toEqual([]);

  expect(workerEntry, "the screen worker's entry was requested").not.toBeNull();
  expect(workerEntry!.fromSW, `${workerEntry!.url} served by the service worker`).toBe(false);
  expect(fromSW, "data requests served by the service worker").toEqual([]);
  expect(errors, "page errors").toEqual([]);
});
