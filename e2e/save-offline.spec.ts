/**
 * Step 14e (plan step-14e-offline.md §10, e2e 2 and 3): ⋯ › Save offline on a graded parcel shows a size, downloads
 * with progress and lists the parcel in Settings › Offline; then, with no connection, a fresh launch opens it from Your
 * list with its grade and its map (no tile request leaves the device), and Grade says it needs a connection. Delete
 * frees it.
 */
import { expect, test } from "@playwright/test";
import { importParcels, openExplorer, openFromList, openYourData, seedScreens, settled, visit } from "./flow";
import { loadFixture } from "../test/support/fixtures";
import { answerTiles, controlled, stored, tilesLoaded } from "./offline";
import { greyPng } from "./png";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A";
const NAME = loadFixture(FERNEY).input.name;

test.use({ serviceWorkers: "allow" });

test("Save offline, then the parcel opens with no connection, with its map and grade", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  await replayHar(context, FERNEY);
  const tiles = await answerTiles(context, greyPng(256));
  await openExplorer(page, FERNEY);
  await controlled(page);
  await importParcels(page, [FERNEY]);
  await seedScreens(page, [FERNEY], { current: true });
  await settled(page);
  await visit(page, "/library");
  await openFromList(page, NAME);

  await page.getByRole("button", { name: "More for this parcel" }).click();
  await page.getByRole("menuitem", { name: "Save offline" }).click();
  const sheet = page.getByRole("dialog", { name: "Save offline?" });
  await expect(sheet.getByText(/^About \d+ MB$/)).toBeVisible();
  await expect(sheet).toContainText("Esri's maps aren't included");
  await sheet.getByRole("button", { name: "Save offline" }).click();
  await expect(sheet.getByRole("status")).toHaveText(/^Saved offline \(\d+ [KM]B\)$/, { timeout: 120_000 });
  await sheet.getByRole("button", { name: "Done" }).click();
  // Pinned to the parcel: tiles of the map around it, at zooms up to 18.
  expect((await stored(page)).filter((s) => s.pins.length).length).toBeGreaterThan(100);

  await page.getByRole("button", { name: "More for this parcel" }).click();
  await expect(page.getByRole("menuitem", { name: "Update offline copy" })).toBeVisible();
  await page.keyboard.press("Escape");
  await openYourData(page);
  await expect(page.locator(".offline-saved")).toContainText(NAME);
  await page.keyboard.press("Escape");
  await settled(page);

  // No connection: the app closed and opened again.
  tiles.cut = true;
  await context.setOffline(true);
  const fresh = await context.newPage();
  await page.close();
  await fresh.goto("/library");
  await openFromList(fresh, NAME);
  await expect(fresh.locator(".card-verdict")).toBeVisible();
  await tilesLoaded(fresh);
  expect(tiles.cutOff, "tile requests that left the device").toBe(0);
  await fresh.locator(".grade-btn:enabled, .grade-again-link:enabled").first().click();
  await expect(fresh.getByText("You're offline — grading needs a connection.")).toBeVisible();

  // Delete in Settings frees its pins.
  await context.setOffline(false);
  await openYourData(fresh);
  await fresh.locator(".offline-saved li", { hasText: NAME }).getByRole("button", { name: "Delete" }).click();
  await expect(fresh.getByText("No parcels saved offline.", { exact: false })).toBeVisible();
  await expect.poll(async () => (await stored(fresh)).filter((s) => s.pins.length).length).toBe(0);
});
