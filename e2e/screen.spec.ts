/**
 * The in-browser screen vs the prototype's goldens (step 18a; plan phase-0-18-acceptance.md §1, phase-0.md
 * §7a.4): a production build, the result the Web Worker posts, the Node test's comparator and tolerances.
 * Each test starts from an empty profile and brings its parcel in through History import.
 */
import { expect, test, type Page } from "@playwright/test";
import type { ScreenResult } from "@/lib/screen/types";
import { loadFixture } from "../test/support/fixtures";
import {
  againstGolden,
  GOLDEN,
  expectAllDone,
  importParcel,
  keptScreenCount,
  openExplorer,
  screenIt,
  postedResult,
  waitForPosted,
} from "./flow";
import { replayHar, type ReplayLog } from "./replay";

const FERNEY = "ferney-creek-52-47A";
const MACKS = "macks-mountain-35-3";

/** Report sections every finished run shows (the panel's h2 headings), whatever the parcel. */
const SECTIONS = [
  "Verdict",
  "Terrain",
  "December sun",
  "Dark skies",
  "Where to build",
  "Driveway",
  "Where to garden",
  "Soils",
  "Floodplain",
  "Public land within a mile",
  "Getting there and getting out",
  "Still unknown",
];

let errors: string[] = [];
let net: ReplayLog;

test.beforeEach(({ page }) => {
  errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
});

test.afterEach(async ({}, info) => {
  // For the PR: what was replayed, and which hosts were aborted (tiles), never failed.
  const aborted = [...new Set(net.aborted.map((k) => new URL(k.split(" ")[1]!).host))].sort();
  await info.attach("network", {
    body: JSON.stringify({ replayed: net.served.length, abortedHosts: aborted }, null, 1),
    contentType: "application/json",
  });
});

/** The run is complete, replayed in full, and error-free. */
async function expectCleanRun(page: Page, steps: Record<string, string>): Promise<void> {
  expect(net.misses, "data requests the HAR doesn't have").toEqual([]);
  expectAllDone(steps);
  expect(errors, "page errors").toEqual([]);
  const headings = await page.locator(".block summary h2").allInnerTexts();
  for (const s of SECTIONS)
    expect(
      headings.some((h) => h.startsWith(s)),
      `section "${s}" in ${JSON.stringify(headings)}`,
    ).toBe(true);
}

test("Ferney Creek 52-47A: the plain run matches the golden; the ground viewer opens, day and night", async ({
  page,
  context,
}) => {
  net = await replayHar(context, FERNEY);
  await openExplorer(page, FERNEY);
  await importParcel(page, FERNEY);
  const steps = await screenIt(page);
  await expectCleanRun(page, steps);
  expect(againstGolden(await postedResult(page), loadFixture(FERNEY).goldens.run), GOLDEN).toEqual([]);

  // The ground viewer (step 17, in place of the 3D walkthrough): Stand here, by day, then by night.
  await page.locator(".stand-here").click();
  const viewer = page.getByRole("dialog", { name: /^Standing at/ });
  await expect(viewer).toBeVisible();
  await expect(viewer.locator("canvas").first()).toBeVisible();
  await viewer.getByRole("button", { name: "Night", exact: true }).click();
  await expect(viewer.getByRole("button", { name: "Night", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.waitForTimeout(500); // a frame of the night sky
  await viewer.getByRole("button", { name: "Close the viewer" }).click();
  await expect(viewer).toBeHidden();
  expect(errors, "page errors in the ground viewer").toEqual([]);
});

test("Ferney Creek 52-47A: with the house marked, the run matches the house golden", async ({
  page,
  context,
}) => {
  net = await replayHar(context, FERNEY);
  await openExplorer(page, FERNEY);
  await importParcel(page, FERNEY, loadFixture(FERNEY).input.house!.ll);
  const steps = await screenIt(page);
  await expectCleanRun(page, steps);
  await expect(page.locator(".block summary h2", { hasText: /^The existing house/ })).toBeVisible();
  expect(againstGolden(await postedResult(page), loadFixture(FERNEY).goldens.houseRun!), GOLDEN).toEqual([]);
});

test("Macks Mountain 35-3: the plain run and the re-evaluation at site #2 match their goldens", async ({
  page,
  context,
}) => {
  net = await replayHar(context, MACKS);
  await openExplorer(page, MACKS);
  await importParcel(page, MACKS);
  const steps = await screenIt(page);
  await expectCleanRun(page, steps);
  const fx = loadFixture(MACKS);
  expect(againstGolden(await postedResult(page), fx.goldens.run), GOLDEN).toEqual([]);

  // Tapping site #2's pin re-evaluates the sun, sky and driveway there (the worker's evaluateAt). Here site #2 is
  // the run's own point (the largest house site), so the panel keeps showing the run (15b); the worker still
  // posts the re-evaluation, labelled "site #2", and that is what the golden recorded.
  // The pin can sit under the desktop panel at this zoom: the click goes to the pin itself (this is about the
  // worker's re-evaluation, not the map's hit testing).
  await page.locator('[data-pin="site-2"]').dispatchEvent("click");
  await waitForPosted(page, "site #2");
  expect(againstGolden(await postedResult(page), fx.goldens.evaluateSite2!), GOLDEN).toEqual([]);
  expect(errors, "page errors").toEqual([]);
});

/** The sections a re-evaluation moves (sun, sky, driveway: ScreenIt's EVALUATED_SECTIONS), by data-key. */
const EVALUATED = ["december-sun", "dark-skies", "driveway"];

test("Ferney Creek 52-47A: a pin away from the run's point is an unsaved re-evaluation; the run's own site ends it", async ({
  page,
  context,
}) => {
  net = await replayHar(context, FERNEY);
  await openExplorer(page, FERNEY);
  await importParcel(page, FERNEY);
  const steps = await screenIt(page);
  await expectCleanRun(page, steps);

  // The run's own point (where its sun and sky were evaluated), and a site that isn't it.
  const run = (await postedResult(page)) as ScreenResult;
  const own = run.focus?.ll ?? run.point?.ll;
  const same = (a: readonly number[], b: readonly number[] | undefined) =>
    !!b && a[0] === b[0] && a[1] === b[1];
  const sites = run.sites ?? [];
  const ownSite = sites.find((s) => same(s.ll, own));
  const other = sites.find((s) => !same(s.ll, own));
  expect(ownSite, `a site at the run's own point ${JSON.stringify(own)}`).toBeDefined();
  expect(other, "a site away from the run's point").toBeDefined();
  const kept = await keptScreenCount(page);

  const label = `site #${other!.rank}`;
  await page.locator(`[data-pin="site-${other!.rank}"]`).dispatchEvent("click");
  await waitForPosted(page, label);
  // The note, on exactly the sun, sky and driveway sections.
  const note = `Evaluated at ${label} — not saved. Run again or move the house to keep it.`;
  for (const key of EVALUATED)
    await expect(page.locator(`details[data-key="${key}"] .eval-note`)).toHaveText(note);
  await expect(page.locator(".eval-note")).toHaveCount(EVALUATED.length);
  // Evaluated exactly at the site's stored point, and nothing kept.
  expect((await postedResult(page))!.focus!.ll).toStrictEqual(other!.ll);
  expect(await keptScreenCount(page), "kept screens").toBe(kept);

  // The run's own site ends the re-evaluation: the notes clear.
  await page.locator(`[data-pin="site-${ownSite!.rank}"]`).dispatchEvent("click");
  await waitForPosted(page, `site #${ownSite!.rank}`);
  await expect(page.locator(".eval-note")).toHaveCount(0);
  expect(await keptScreenCount(page), "kept screens").toBe(kept);
  expect(errors, "page errors").toEqual([]);
});
