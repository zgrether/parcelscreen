/**
 * Roadmap step 14d: Map layers › Places (docs/plans/step-14d-places.md §5, §10). Off at first; on, every kind is on;
 * Mud Creek's trailheads clustered at zoom 10 and apart at 13; a tap on Grayson Highlands State Park's trailhead shows
 * its card with the drive Mud Creek's grade timed; a kind turned off hides its points; a reload keeps both; below zoom
 * 8 the hint says to zoom in. Step 17: Climbing is a kind too, and a tap on Grayson Highlands' bouldering shows its type,
 * its access note, the drive Mud Creek's grade timed and its access page. The baked cells are the fixture's frozen copies (e2e/replay.ts); Mud Creek's screen is its
 * expected.json's, seeded current, so the card's minutes are its own.
 */
import { expect, test, type Page } from "@playwright/test";
import { loadFixture } from "../test/support/fixtures";
import { importParcels, openExplorer, openFromList, reload, seedScreens, settled, visit } from "./flow";
import { replayHar } from "./replay";

const MUD = "grayson-mud-creek-6273";
/** Grayson Highlands State Park's trailhead (VA's parks), 17 minutes from Mud Creek in its expected.json. */
const PARK: [number, number] = [36.612985, -81.481351];
/** Step 17: Grayson Highlands' bouldering, at the Massie Gap lot (lib/screen/data/crags.json), 27 minutes from Mud Creek. */
const BOULDERS: [number, number] = [36.63314, -81.50731];

type DebugMap = {
  jumpTo(o: object): void;
  getZoom(): number;
  isMoving(): boolean;
  areTilesLoaded(): boolean;
  getLayer(id: string): unknown;
  getLayoutProperty(id: string, p: string): string | undefined;
  queryRenderedFeatures(o: { layers: string[] }): unknown[];
  project(ll: [number, number]): { x: number; y: number };
  getContainer(): HTMLElement;
};

const jump = (page: Page, zoom: number, at: [number, number] = PARK) =>
  page.evaluate(
    ([z, lat, lon]) =>
      (window as unknown as { __psMap: DebugMap }).__psMap.jumpTo({ zoom: z, center: [lon, lat] }),
    [zoom, at[0], at[1]] as const,
  );
const settle = (page: Page) =>
  page.waitForFunction(() => {
    const m = (window as unknown as { __psMap: DebugMap }).__psMap;
    return !m.isMoving() && m.areTilesLoaded();
  });
const rendered = (page: Page, layer: string) =>
  page.evaluate((id) => {
    const m = (window as unknown as { __psMap: DebugMap }).__psMap;
    return m.getLayer(id) ? m.queryRenderedFeatures({ layers: [id] }).length : -1;
  }, layer);
const visibility = (page: Page, layer: string) =>
  page.evaluate(
    (id) => (window as unknown as { __psMap: DebugMap }).__psMap.getLayoutProperty(id, "visibility") ?? null,
    layer,
  );

test("Places: off at first; every kind on; clusters at zoom 10, apart at 13; a trailhead's card with Mud Creek's drive; a kind off; kept after a reload", async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await replayHar(context, MUD);
  await openExplorer(page, MUD);
  await importParcels(page, [MUD]);
  await seedScreens(page, [MUD], { current: true });
  await settled(page);
  await visit(page, "/library");
  await openFromList(page, loadFixture(MUD).input.name);
  await page.waitForFunction(() => !!(window as unknown as { __psMap?: unknown }).__psMap);
  expect(await rendered(page, "places-trailhead-point")).toBe(-1); // off by default: nothing added

  await page.getByRole("button", { name: "Map layers" }).click();
  const panel = page.getByRole("region", { name: "Map layers" });
  await panel.getByRole("button", { name: "Places", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Places", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const kinds = panel.getByRole("group", { name: "Places shown" }).getByRole("button");
  await expect(kinds).toHaveText([
    "ER hospitals",
    "Airports",
    "Trailheads",
    "Groceries",
    "Long-trail access",
    "Paddle launches",
    "Climbing",
  ]);
  await expect(panel).toContainText("Climbing: orange for rope (sport, trad), grey for bouldering.");
  for (const b of await kinds.all()) await expect(b).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Close the map panel" }).click();

  // Zoom 10: the park's trailheads in clusters; 13: apart, each its own icon.
  await jump(page, 10);
  await settle(page);
  await expect.poll(() => rendered(page, "places-trailhead-cluster")).toBeGreaterThan(0);
  await jump(page, 13);
  await settle(page);
  await expect.poll(() => rendered(page, "places-trailhead-point")).toBeGreaterThan(0);
  expect(await rendered(page, "places-trailhead-cluster")).toBe(0);

  // A tap on the park's trailhead: its card, with the minutes Mud Creek's grade timed (nothing fetched for it).
  await jump(page, 15);
  await settle(page);
  const at = await page.evaluate(([lat, lon]) => {
    const m = (window as unknown as { __psMap: DebugMap }).__psMap;
    const p = m.project([lon, lat]);
    const box = m.getContainer().getBoundingClientRect();
    return { x: box.left + p.x, y: box.top + p.y };
  }, PARK);
  await page.mouse.click(at.x, at.y);
  const card = page.locator(".place-tip");
  await expect(card).toBeVisible();
  await expect(card.locator("strong")).toHaveText("Grayson Highlands State Park");
  await expect(card).toContainText("Trailhead");
  await expect(card).toContainText("Virginia State Parks");
  await expect(card).toContainText(/Checked \d{4}-\d{2}-\d{2}/);
  await expect(card).toContainText("17 min from this parcel");

  // Trailheads off: their points go; the other kinds stay.
  await page.getByRole("button", { name: "Map layers" }).click();
  await panel
    .getByRole("group", { name: "Places shown" })
    .getByRole("button", { name: "Trailheads" })
    .click();
  expect(await visibility(page, "places-trailhead-point")).toBe("none");
  expect(await visibility(page, "places-launch-point")).toBe("visible");

  // Step 17: a tap on the park's bouldering (its trailheads off, so the tap is the climbing area's).
  await page.getByRole("button", { name: "Close the map panel" }).click();
  await jump(page, 15, BOULDERS);
  await settle(page);
  await expect.poll(() => rendered(page, "places-crag-point")).toBeGreaterThan(0);
  const crag = await page.evaluate(([lat, lon]) => {
    const m = (window as unknown as { __psMap: DebugMap }).__psMap;
    const p = m.project([lon, lat]);
    const box = m.getContainer().getBoundingClientRect();
    return { x: box.left + p.x, y: box.top + p.y };
  }, BOULDERS);
  await page.mouse.click(crag.x, crag.y);
  await expect(card.locator("strong")).toHaveText("Grayson Highlands State Park: Massie Gap");
  await expect(card).toContainText("Climbing: bouldering");
  await expect(card).toContainText("Bouldering only: no ropes, no chipping.");
  await expect(card).toContainText("27 min from this parcel");
  await expect(card.getByRole("link", { name: "The access page" })).toHaveAttribute(
    "href",
    /dcr\.virginia\.gov/,
  );

  // Kept after a reload: Places on, Trailheads off.
  await reload(page);
  await page.waitForFunction(() => !!(window as unknown as { __psMap?: unknown }).__psMap);
  await expect.poll(() => visibility(page, "places-launch-point").catch(() => null)).toBe("visible");
  expect(await visibility(page, "places-trailhead-point")).toBe("none");

  // Below zoom 8: the hint.
  // (The replay has no basemap tiles out there: the terrain's own hint may come first, and goes after a few seconds.)
  await jump(page, 7);
  await expect(page.locator(".map-hint", { hasText: "Terrain tiles didn't load" })).toHaveCount(0, {
    timeout: 10_000,
  });
  await jump(page, 7.5);
  await expect(page.locator(".map-hint")).toHaveText("Zoom in to see places");
  expect(errors).toEqual([]);
});
