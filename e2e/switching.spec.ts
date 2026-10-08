/**
 * Parcel switching and live sessions (step 17e; plan phase-0-17e-switching.md §1): switching is immediate,
 * with "{parcel} kept in History — Back" when the parcel left had a screen; a screened parcel reopened while
 * its session is kept comes back with its overlays live and no network; nothing switches while a screen runs;
 * the × and Esc close the parcel with the same toast.
 */
import { expect, test, type Page } from "@playwright/test";
import { BUSY_TEXT } from "@/components/Explore/exploreState";
import { loadFixture } from "../test/support/fixtures";
import {
  againstGolden,
  expectAllDone,
  GOLDEN,
  importParcels,
  openExplorer,
  openFromHistory,
  postedResult,
  screenIt,
} from "./flow";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A";
const MACKS = "macks-mountain-35-3";

/** The open parcel's session is live: its overlays, the ground viewer and pin re-evaluation work. */
const live = (page: Page) =>
  page.evaluate(() => !!(window as unknown as { __psScreen: { view: unknown } }).__psScreen.view);
const toast = (page: Page) => page.locator(".switch-toast");

test("switching keeps screened parcels live: back to one with no re-run and no network", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const net = await replayHar(context, [FERNEY, MACKS]);
  await openExplorer(page, FERNEY);
  await importParcels(page, [FERNEY, MACKS]);

  await openFromHistory(page, "52-47A");
  expectAllDone(await screenIt(page));
  expect(await live(page)).toBe(true);

  // Another parcel: switches at once; the screened one is kept, with Back.
  await openFromHistory(page, "35-3");
  await expect(toast(page)).toContainText("52-47A kept in History");
  await page
    .locator("button", { hasText: /^Screen it$/ })
    .first()
    .click();
  // While it runs, no switching (and no cancel).
  await expect(page.locator("button", { hasText: /^Running…$/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page
    .locator(".menu-drawer li", { hasText: "52-47A" })
    .getByRole("button", { name: "Open", exact: true })
    .click();
  await expect(page.locator(".map-hint")).toHaveText(BUSY_TEXT);
  await expect(page.locator(".sh-name").first()).toHaveText("35-3");
  await expect(page.locator("button", { hasText: /^Run again$/ }).first()).toBeVisible({ timeout: 200_000 });
  expect(net.misses, "data requests the HAR doesn't have").toEqual([]);

  // Back to Ferney: its session is still kept, so it's live again with no request at all.
  const servedBefore = net.served.length;
  await openFromHistory(page, "52-47A");
  await expect(toast(page)).toContainText("35-3 kept in History");
  await expect.poll(() => live(page)).toBe(true);
  expect(againstGolden(await postedResult(page), loadFixture(FERNEY).goldens.run), GOLDEN).toEqual([]);
  // The toast's Back: Macks again, live, still nothing asked of the network.
  await toast(page).getByRole("button", { name: "Back" }).click();
  await expect(page.locator(".sh-name").first()).toHaveText("35-3");
  await expect.poll(() => live(page)).toBe(true);
  expect(againstGolden(await postedResult(page), loadFixture(MACKS).goldens.run), GOLDEN).toEqual([]);
  // Only map tiles may be asked for (aborted) as the map moves; no data request is answered from the HAR.
  expect(net.served.slice(servedBefore), "data requests after reopening kept sessions").toEqual([]);

  // The ×: closes the parcel with the same toast; Back reopens it.
  await page.getByRole("button", { name: "Close this parcel" }).first().click();
  await expect(page.locator(".sh-name")).toHaveCount(0);
  await expect(toast(page)).toContainText("35-3 kept in History");
  await toast(page).getByRole("button", { name: "Back" }).click();
  await expect(page.locator(".sh-name").first()).toHaveText("35-3");
  // Nothing else ran since: still the worker's current run, and live again for this new open (18b).
  await expect.poll(() => live(page)).toBe(true);

  // Esc (desktop) closes it too. Tapping empty map or the parcel itself no longer does (unit-tested).
  await page.locator("body").press("Escape");
  await expect(page.locator(".sh-name")).toHaveCount(0);
  expect(errors, "page errors").toEqual([]);
});
