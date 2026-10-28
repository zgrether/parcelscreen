/**
 * Roadmap step 16: Map layers › Public land (docs/plans/step-16-public-lands.md §10). Off at first; on, its key; the
 * land drawn beside Mud Creek; a tap on the forest opens its card with "Adjoins this parcel" and leaves Mud Creek open;
 * a game land with no recorded manager reads as one; remembered after a reload; below zoom 9 the hint says to zoom in.
 * PAD-US is answered from e2e/publicLand.ts's synthetic units.
 */
import { expect, test } from "@playwright/test";
import { loadFixture } from "../test/support/fixtures";
import { importParcels, openExplorer, openFromList, reload, seedScreens, settled, visit } from "./flow";
import { answerPublicLand, FOREST_AT, GAME_LAND_AT, jump, rendered, tapAt } from "./publicLand";
import { replayHar } from "./replay";

const MUD = "grayson-mud-creek-6273";

test("Public land: off at first; its key; the forest's card adjoins Mud Creek and leaves it open; a game land by its name; kept after a reload", async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await replayHar(context, MUD);
  const padus = await answerPublicLand(context);
  await openExplorer(page, MUD);
  await importParcels(page, [MUD]);
  await seedScreens(page, [MUD], { current: true });
  await settled(page);
  await visit(page, "/library");
  const name = loadFixture(MUD).input.name;
  await openFromList(page, name);
  await page.waitForFunction(() => !!(window as unknown as { __psMap?: unknown }).__psMap);
  expect(await rendered(page, "public-land-fine-solid")).toBe(-1); // off by default: nothing added
  expect(padus.asked).toBe(0);

  await page.getByRole("button", { name: "Map layers" }).click();
  const panel = page.getByRole("region", { name: "Map layers" });
  const toggle = panel.getByRole("button", { name: "Public land", exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(panel.getByRole("list", { name: "Public land, by manager" }).getByRole("listitem")).toHaveText(
    [
      "National forest",
      "National park (and the Blue Ridge Parkway)",
      "State parks and forests",
      "State game lands and WMAs",
      "Other public or conserved land",
      "Conservation easement (private land)",
    ],
  );
  await expect(panel.getByRole("list", { name: "Public access" }).getByRole("listitem")).toHaveText([
    "Open",
    "Restricted or not recorded",
    "Closed",
  ]);
  await expect(panel).toContainText("from USGS PAD-US 4.1");
  await page.getByRole("button", { name: "Close the map panel" }).click();

  // Zoom 14 beside Mud Creek: the forest and game land solid, the closed preserve outlined.
  await jump(page, 14, FOREST_AT);
  await expect.poll(() => rendered(page, "public-land-fine-solid")).toBeGreaterThan(0);
  await expect.poll(() => rendered(page, "public-land-fine-closed")).toBeGreaterThan(0);
  expect(padus.asked).toBeGreaterThan(0);

  // A tap on the forest: its card, adjoining Mud Creek, which stays open.
  await tapAt(page, FOREST_AT);
  const card = page.locator(".public-land-card");
  await expect(card).toBeVisible();
  await expect(card.locator("strong")).toHaveText("Jefferson National Forest");
  await expect(card).toContainText("U.S. Forest Service");
  await expect(card).toContainText("Open to the public");
  await expect(card).toContainText("National Forest");
  await expect(card).toContainText("PAD-US source date: 2024-10-06");
  await expect(card.locator(".pl-adjoins")).toHaveText("Adjoins this parcel");
  await expect(page.getByRole("button", { name: "Close this parcel" })).toBeVisible();
  await expect(page.getByRole("complementary")).toContainText(name);

  // The game land: its manager unknown, still a game land by its name; not adjoining.
  await tapAt(page, GAME_LAND_AT);
  await expect(card.locator("strong")).toHaveText("Pond Mountain Game Land");
  await expect(card).toContainText("Manager not recorded");
  await expect(card.locator(".pl-adjoins")).toHaveCount(0);

  // Kept after a reload.
  await reload(page);
  await page.waitForFunction(() => !!(window as unknown as { __psMap?: unknown }).__psMap);
  await jump(page, 14, FOREST_AT);
  await expect.poll(() => rendered(page, "public-land-fine-solid")).toBeGreaterThan(0);

  // Below zoom 9: the hint (the terrain's own hint may come first, and goes after a few seconds).
  await jump(page, 8, FOREST_AT);
  await expect(page.locator(".map-hint", { hasText: "Terrain tiles didn't load" })).toHaveCount(0, {
    timeout: 10_000,
  });
  await jump(page, 8.5, FOREST_AT);
  await expect(page.locator(".map-hint")).toHaveText("Zoom in to see public land");
  expect(errors).toEqual([]);
});
