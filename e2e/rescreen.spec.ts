/**
 * Schema v3's clean break and the re-screen on open (B2a; owner, #101, 2026-10-11; docs/plans/b2.md §3, §12), and
 * the asking price (§4). A production build, the Ferney Creek HAR replayed.
 */
import { expect, test, type Page } from "@playwright/test";
import {
  ageKept,
  importParcel,
  keptScreenCount,
  openExplorer,
  openFromList,
  reload,
  screenIt,
  listRow,
} from "./flow";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A";

let errors: string[] = [];
test.beforeEach(({ page }) => {
  errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
});

/** The note a re-screened result carries (the approved replacement of the "earlier rules" note). */
const RESCREENED = (page: Page) =>
  page.locator(".report-note", { hasText: "Re-screened with the current rules." });

test("a v2 result is cleared at start-up, its parcel kept; the map says so, and the open parcel re-screens", async ({
  page,
  context,
}) => {
  await replayHar(context, FERNEY);
  await openExplorer(page, FERNEY);
  await importParcel(page, FERNEY);
  await screenIt(page);
  expect(await keptScreenCount(page)).toBe(1);

  await ageKept(page, "v2");
  await reload(page);
  // The open parcel (restored after the reload) is the parcel being opened: it re-screens, with no tap.
  await expect(RESCREENED(page)).toBeVisible({ timeout: 200_000 });
  expect(await keptScreenCount(page)).toBe(1); // the old one deleted, the new one kept

  // Said on the map once (step 4b: it was History's), and the parcel is still on Your list.
  await expect(page.locator(".cleared-note")).toContainText(
    "Saved results from an older version of Parcel Screen were cleared. Your parcels, notes and houses are kept; each re-screens when you open it.",
  );
  await page.locator(".cleared-note").getByRole("button", { name: "OK" }).click();
  await expect(page.locator(".cleared-note")).toHaveCount(0);
  await page.getByRole("link", { name: "Your list", exact: true }).click();
  await expect(listRow(page, "52-47A")).toBeVisible();
  expect(errors).toEqual([]);
});

test("offline, a parcel from earlier rules shows its result and waits; back online, it re-screens", async ({
  page,
  context,
}) => {
  await replayHar(context, FERNEY);
  await openExplorer(page, FERNEY);
  await importParcel(page, FERNEY);
  await screenIt(page);
  await ageKept(page, "earlier rules");
  await page.getByRole("button", { name: "Close this parcel" }).first().click();

  await page.getByRole("link", { name: "Your list", exact: true }).click();
  await expect(listRow(page, "52-47A")).toContainText("Needs a re-screen");

  await context.setOffline(true);
  await openFromList(page, "52-47A");
  await expect(page.locator(".rescreen-note")).toHaveText("Will re-screen when you're back online.");
  // Never a blank report: the kept result is shown while it waits.
  await expect(page.locator(".card-verdict")).toBeVisible();
  expect(await keptScreenCount(page)).toBe(1);

  await context.setOffline(false);
  await expect(RESCREENED(page)).toBeVisible({ timeout: 200_000 });
  await expect(page.locator(".rescreen-note")).toHaveCount(0);
  expect(await keptScreenCount(page)).toBe(2);
  expect(errors).toEqual([]);
});

test("the asking price: entered in the parcel sheet with its date, shown on Your list, kept after a reload", async ({
  page,
  context,
}) => {
  await replayHar(context, FERNEY);
  await openExplorer(page, FERNEY);
  await importParcel(page, FERNEY);
  await page.locator('button[aria-label$="acres: parcel details"]').first().click();
  const price = page.getByLabel("Asking price");
  await price.fill("185k");
  await price.press("Enter");
  await expect(page.locator(".ip-price")).toContainText(
    /asking \$185,000 as of [A-Z][a-z]{2} \d{1,2}, \d{4}/,
  );

  await reload(page);
  await page.getByRole("link", { name: "Your list", exact: true }).click();
  await expect(listRow(page, "52-47A")).toContainText("$185k");
  expect(errors).toEqual([]);
});

test("a cleared result opened offline: the card says it will re-screen, never blank; back online, it does", async ({
  page,
  context,
}) => {
  await replayHar(context, FERNEY);
  await openExplorer(page, FERNEY);
  await importParcel(page, FERNEY);
  await screenIt(page);
  await ageKept(page, "v2");
  await page.getByRole("button", { name: "Close this parcel" }).first().click();
  await reload(page);
  await expect.poll(() => keptScreenCount(page)).toBe(0);
  // Your list visited once while online, as it would be: the router keeps its page, so the tab opens offline too (the
  // e2e blocks the service worker, which would otherwise load the precached page).
  await page.getByRole("link", { name: "Your list", exact: true }).click();
  await expect(listRow(page, "52-47A")).toBeVisible();
  await page.getByRole("link", { name: "Map", exact: true }).click();

  await context.setOffline(true);
  await openFromList(page, "52-47A");
  // Nothing kept to show: the header, always on screen, says what will happen.
  await expect(page.locator(".rescreen-note")).toHaveText("Will re-screen when you're back online.");
  await context.setOffline(false);
  await expect(RESCREENED(page)).toBeVisible({ timeout: 200_000 });
  await expect(page.locator(".rescreen-note")).toHaveCount(0);
  expect(await keptScreenCount(page)).toBe(1);
  expect(errors).toEqual([]);
});
