/**
 * The in-browser screen vs the port's expected.json (step 18a, then Batch A §1; plan phase-0-18-acceptance.md
 * §1, phase-0.md §7a.4): a production build, the result the Web Worker posts, the Node test's comparator with
 * the measured browser tolerances (EXPECTED_BROWSER).
 * Each test starts from an empty profile and brings its parcel in through History import.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { ScreenResult } from "@/lib/screen/types";
import { loadFixture } from "../test/support/fixtures";
import {
  againstExpected,
  EVERY_PIN,
  EXPECTED_MSG,
  expectAllDone,
  importParcel,
  keptScreenCount,
  openExplorer,
  screenIt,
  postedResult,
  waitForPosted,
} from "./flow";
import { replayHar, type ReplayLog } from "./replay";
import { sitePinLabel } from "../test/support/scenarios";

const FERNEY = "ferney-creek-52-47A";
const MACKS = "macks-mountain-35-3";

/** Report sections every finished run shows (the panel's h2 headings), whatever the parcel. */
const SECTIONS = [
  "Verdict",
  "Terrain",
  "December sun",
  "Night sky",
  "Where to build",
  "Driveway",
  "Where to garden",
  "Soils",
  "Floodplain",
  "Public land within a mile",
  "Getting there and getting out",
  "Questions for the agent",
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
  const headings = await panelHeadings(page);
  for (const s of SECTIONS)
    expect(
      headings.some((h) => h.startsWith(s)),
      `section "${s}" in ${JSON.stringify(headings)}`,
    ).toBe(true);
}

/** The report card's line opening a panel: the verdict, a Must (step 7: a row of its own) or a row (VR5). */
const cardLine = (page: Page, name: string) =>
  page.locator(".card .card-verdict, .card .card-row").filter({ hasText: name }).first();

/** Opens a card panel, runs `check` on it, and closes it again. */
async function inPanel(page: Page, line: string, check: (panel: Locator) => Promise<void>): Promise<void> {
  await cardLine(page, line).click();
  const panel = page.locator(".card-panel");
  await expect(panel).toBeVisible();
  await check(panel);
  await panel.getByRole("button", { name: "Close" }).click();
  await expect(panel).toBeHidden();
}

/** Every panel the card opens, in turn: the report sections now under "From the report" (VR5). */
async function panelHeadings(page: Page): Promise<string[]> {
  const out: string[] = [];
  const lines = page.locator(".card .card-verdict, .card .card-row");
  const n = await lines.count();
  // Step 10: the verdict, Cost to enjoy's two lines (the pending row went), 4 Musts and 7 rows.
  expect(n, "the card's lines").toBe(14);
  for (let i = 0; i < n; i++) {
    await lines.nth(i).click();
    const panel = page.locator(".card-panel");
    await expect(panel).toBeVisible();
    out.push(...(await panel.locator(".panel-block h3").allInnerTexts()));
    await panel.getByRole("button", { name: "Close" }).click();
    await expect(panel).toBeHidden();
  }
  return out;
}

test("Ferney Creek 52-47A: the plain run matches expected.json; the ground viewer opens, day and night", async ({
  page,
  context,
}) => {
  net = await replayHar(context, FERNEY);
  await openExplorer(page, FERNEY);
  await importParcel(page, FERNEY);
  const steps = await screenIt(page);
  await expectCleanRun(page, steps);
  expect(againstExpected(await postedResult(page), FERNEY, "run"), EXPECTED_MSG).toEqual([]);

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

test("Ferney Creek 52-47A: with the house marked, the run matches expected.json", async ({
  page,
  context,
}) => {
  net = await replayHar(context, FERNEY);
  await openExplorer(page, FERNEY);
  await importParcel(page, FERNEY, loadFixture(FERNEY).input.house!.ll);
  const steps = await screenIt(page);
  await expectCleanRun(page, steps);
  await inPanel(page, "Best homesite", async (panel) => {
    await expect(panel.locator(".panel-block h3", { hasText: /^The existing house/ })).toBeVisible();
  });
  expect(againstExpected(await postedResult(page), FERNEY, "houseRun"), EXPECTED_MSG).toEqual([]);
});

test("Macks Mountain 35-3: the plain run and the re-evaluation at site #2 match expected.json", async ({
  page,
  context,
}) => {
  net = await replayHar(context, MACKS);
  await openExplorer(page, MACKS, EVERY_PIN); // it taps a site's pin
  await importParcel(page, MACKS);
  const steps = await screenIt(page);
  await expectCleanRun(page, steps);
  expect(againstExpected(await postedResult(page), MACKS, "run"), EXPECTED_MSG).toEqual([]);

  // Tapping the pin at the prototype's recorded site #2 re-evaluates the sun, sky and driveway there (the worker's
  // evaluateAt). That bench is the run's own point (the largest house site), so the panel keeps showing the run
  // (15b); the worker still posts the re-evaluation, labelled as its pin, and that is what expected.json holds.
  // Since A3's re-ranking the bench is site #1 here, so the pin is found by position, not by rank.
  // The pin can sit under the desktop panel at this zoom: the click goes to the pin itself (this is about the
  // worker's re-evaluation, not the map's hit testing).
  const at = loadFixture(MACKS).input.evaluateSite2!.ll;
  const label = sitePinLabel((await postedResult(page)) as ScreenResult, at)!;
  await page.locator(`[data-pin="site-${label.replace("site #", "")}"]`).dispatchEvent("click");
  await waitForPosted(page, label);
  expect(againstExpected(await postedResult(page), MACKS, "evaluateSite2"), EXPECTED_MSG).toEqual([]);
  expect(errors, "page errors").toEqual([]);
});

/** The sections a re-evaluation moves (sun, sky, driveway: ScreenIt's EVALUATED_SECTIONS), by data-key, and the card line whose panel holds each. */
const EVALUATED = [
  ["december-sun", "Best homesite"],
  ["dark-skies", "Night sky"],
  ["driveway", "Driveway on your land"], // the Must row's priorities-page title (owner, #216)
] as const;

test("Ferney Creek 52-47A: a pin away from the run's point is an unsaved re-evaluation; the run's own site ends it", async ({
  page,
  context,
}) => {
  net = await replayHar(context, FERNEY);
  await openExplorer(page, FERNEY, EVERY_PIN); // it taps other sites' pins
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
  for (const [key, line] of EVALUATED)
    await inPanel(page, line, async (panel) => {
      await expect(panel.locator(`.panel-block[data-key="${key}"] .eval-note`)).toHaveText(note);
      await expect(panel.locator(".eval-note")).toHaveCount(1);
    });
  // Not on the sections it doesn't move.
  await inPanel(page, "Room to build", async (panel) => {
    await expect(panel.locator(".panel-block")).not.toHaveCount(0);
    await expect(panel.locator(".eval-note")).toHaveCount(0);
  });
  // Evaluated exactly at the site's stored point, and nothing kept.
  expect((await postedResult(page))!.focus!.ll).toStrictEqual(other!.ll);
  expect(await keptScreenCount(page), "kept screens").toBe(kept);

  // The run's own site ends the re-evaluation: the notes clear.
  await page.locator(`[data-pin="site-${ownSite!.rank}"]`).dispatchEvent("click");
  await waitForPosted(page, `site #${ownSite!.rank}`);
  await inPanel(page, "Night sky", async (panel) => {
    await expect(panel.locator(".panel-block")).not.toHaveCount(0);
    await expect(panel.locator(".eval-note")).toHaveCount(0);
  });
  expect(await keptScreenCount(page), "kept screens").toBe(kept);
  expect(errors, "page errors").toEqual([]);
});
