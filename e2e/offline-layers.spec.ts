/**
 * Roadmap step 16 (docs/plans/step-16-public-lands.md §5, §10): Save offline on Mud Creek with Public land and
 * Motor-vehicle routes on; then, with no connection, a fresh page draws both layers' features around the parcel from
 * the device, and none of the saved tiles is asked of the network.
 */
import { expect, test } from "@playwright/test";
import { importParcels, openExplorer, openFromList, seedScreens, settled, visit } from "./flow";
import { loadFixture } from "../test/support/fixtures";
import { answerTiles, controlled } from "./offline";
import { greyPng } from "./png";
import { FOREST_AT, jump, PUBLIC_LAND, rendered, ROUTES } from "./publicLand";
import { replayHar } from "./replay";

const MUD = "grayson-mud-creek-6273";
const NAME = loadFixture(MUD).input.name;

test.use({ serviceWorkers: "allow" });

test("Save offline with both layers on, then offline the public land and the routes draw from the device", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  await replayHar(context, MUD);
  const tiles = await answerTiles(context, greyPng(256), { publicLand: PUBLIC_LAND, ...ROUTES });
  await openExplorer(page, MUD);
  await controlled(page);
  await importParcels(page, [MUD]);
  await seedScreens(page, [MUD], { current: true });
  await settled(page);
  await visit(page, "/library");
  await openFromList(page, NAME);

  await page.getByRole("button", { name: "Map layers" }).click();
  const panel = page.getByRole("region", { name: "Map layers" });
  await panel.getByRole("button", { name: "Public land", exact: true }).click();
  await panel.getByRole("button", { name: "Motor-vehicle routes", exact: true }).click();
  await page.getByRole("button", { name: "Close the map panel" }).click();

  await page.getByRole("button", { name: "More for this parcel" }).click();
  await page.getByRole("menuitem", { name: "Save offline" }).click();
  const sheet = page.getByRole("dialog", { name: /^Sav(e|ing|ed) offline/ });
  await sheet.getByRole("button", { name: "Save offline" }).click();
  await expect(sheet.getByRole("status")).toHaveText(/^Saved offline \(\d+ [KM]B\)$/, { timeout: 120_000 });
  await sheet.getByRole("button", { name: "Done" }).click();
  const saved = [...tiles.urls];
  expect(saved.some((u) => u.includes("Manager_Name_PADUS"))).toBe(true);
  expect(saved.some((u) => /EDW_MVUM_01\/MapServer\/1\//.test(u))).toBe(true);
  expect(saved.some((u) => /EDW_MVUM_01\/MapServer\/2\//.test(u))).toBe(true);

  // No connection: the app closed and opened again.
  tiles.cut = true;
  await context.setOffline(true);
  const fresh = await context.newPage();
  await page.close();
  await fresh.goto("/library");
  await openFromList(fresh, NAME);
  await fresh.waitForFunction(() => !!(window as unknown as { __psMap?: unknown }).__psMap);
  await jump(fresh, 14, FOREST_AT);
  await expect.poll(() => rendered(fresh, "public-land-fine-solid"), { timeout: 30_000 }).toBeGreaterThan(0);
  await expect.poll(() => rendered(fresh, "mvum-line"), { timeout: 30_000 }).toBeGreaterThan(0);
  // The saved tiles came from the device (the view at zoom 14 reaches past the saved box, and those ask the network).
  expect(tiles.cutUrls.filter((u) => saved.includes(u))).toEqual([]);
  // Offline, a tile outside the saved box isn't an error.
  await expect(fresh.locator(".map-hint", { hasText: "didn't load" })).toHaveCount(0);
});
