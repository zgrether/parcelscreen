/**
 * Roadmap step 16: Map layers › Motor-vehicle routes (docs/plans/step-16-public-lands.md §10). Off at first; on, its key
 * and the MVUM's caution; the routes beside Mud Creek, the seasonal road dashed; a tap on the road opens its card and
 * leaves Mud Creek open; below zoom 11 the hint says to zoom in. The MVUM is answered from e2e/publicLand.ts's routes.
 */
import { expect, test } from "@playwright/test";
import { loadFixture } from "../test/support/fixtures";
import { importParcels, openExplorer, openFromList, seedScreens, settled, visit } from "./flow";
import { answerRoutes, FOREST_AT, jump, rendered, ROAD_AT, tapAt } from "./publicLand";
import { replayHar } from "./replay";

const MUD = "grayson-mud-creek-6273";

test("Motor-vehicle routes: off at first; its key; the seasonal road dashed; the road's card; the zoom hint", async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await replayHar(context, MUD);
  const mvum = await answerRoutes(context);
  await openExplorer(page, MUD);
  await importParcels(page, [MUD]);
  await seedScreens(page, [MUD], { current: true });
  await settled(page);
  await visit(page, "/library");
  const name = loadFixture(MUD).input.name;
  await openFromList(page, name);
  await page.waitForFunction(() => !!(window as unknown as { __psMap?: unknown }).__psMap);
  expect(await rendered(page, "mvum-line")).toBe(-1);
  expect(mvum.asked).toBe(0);

  await page.getByRole("button", { name: "Map layers" }).click();
  const panel = page.getByRole("region", { name: "Map layers" });
  const toggle = panel.getByRole("button", { name: "Motor-vehicle routes", exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(
    panel.getByRole("list", { name: "Motor-vehicle routes, by what's allowed" }).getByRole("listitem"),
  ).toHaveText([
    "All vehicles",
    "Highway-legal vehicles only",
    'ATVs and side-by-sides, 50" or narrower',
    "Motorcycles only",
    "Special designation (see the MVUM)",
    "Seasonal",
  ]);
  await expect(panel).toContainText(
    "On national forests, motor vehicles may use only designated routes. Check the current Motor Vehicle Use Map before driving.",
  );
  await expect(panel).toContainText("Dispersed-camping corridors aren't in the Forest Service's data");
  await page.getByRole("button", { name: "Close the map panel" }).click();

  // Zoom 14: the motorcycle trail solid, the seasonal road dashed.
  await jump(page, 14, FOREST_AT);
  await expect.poll(() => rendered(page, "mvum-line")).toBeGreaterThan(0);
  await expect.poll(() => rendered(page, "mvum-seasonal")).toBeGreaterThan(0);

  // A tap on the road: its card; Mud Creek stays open.
  await tapAt(page, ROAD_AT);
  const card = page.locator(".route-card");
  await expect(card).toBeVisible();
  await expect(card.locator("strong")).toHaveText("Bald Knob (FS 60061)");
  await expect(card).toContainText("Highway-legal vehicles only");
  await expect(card).toContainText("Open to passenger vehicles, high-clearance vehicles");
  await expect(card).toContainText("Seasonal: open Sep 12 – Jan 18");
  await expect(card).toContainText("Mount Rogers National Recreation Area");
  await expect(card).toContainText("Forest Service MVUM data, read 2026-10-28");
  await expect(page.getByRole("complementary")).toContainText(name);

  // Below zoom 11: the hint (the terrain's own hint may come first, and goes after a few seconds).
  await jump(page, 10, FOREST_AT);
  await expect(page.locator(".map-hint", { hasText: "Terrain tiles didn't load" })).toHaveCount(0, {
    timeout: 10_000,
  });
  await jump(page, 10.5, FOREST_AT);
  await expect(page.locator(".map-hint")).toHaveText("Zoom in to see motor-vehicle routes");
  expect(errors).toEqual([]);
});
