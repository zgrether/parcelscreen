/**
 * Boulder potential's screenshots (docs/plans/boulders.md §4 PR 4), desktop (1280 × 800) then phone (375 × 812):
 * Macks's Boulders line in Uses, opened; Macks with Map layers' Boulder ground on, and its key; the Favorites grid with
 * the Boulder ground column added (desktop: the phone's list is cards); and Where to look sorted by Most boulder
 * ground. Taken by boulders.yml on CI's runners (the live basemaps), into test-results/screenshots/boulders/. The
 * fixtures' data is their recordings; the area files are the committed ones.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { loadFixture, type FixtureSlug } from "../test/support/fixtures";
import {
  importParcels,
  openExplorer,
  openFromList,
  screenIt,
  seedScreens,
  settled,
  visit,
} from "../e2e/flow";
import { replayHar } from "../e2e/replay";
import { AREA_WORDS } from "../lib/areas/words";

const OUT = "test-results/screenshots/boulders";
const MACKS = "macks-mountain-35-3" satisfies FixtureSlug;
const SLUGS: readonly FixtureSlug[] = [MACKS, "grayson-mud-creek-6273", "ferney-creek-52-47A"];

/** The basemaps and terrain live (the replay aborts them). */
const liveImagery = (page: Page) =>
  page
    .context()
    .route(
      /basemap\.nationalmap\.gov|arcgisonline\.com|vginmaps\.vdem\.virginia\.gov|services\.nconemap\.gov\/.*Orthoimagery|tiles\.mapterhorn\.com|elevation-tiles-prod/,
      (r) => r.continue(),
    );

const settle = async (page: Page) => {
  await page
    .waitForFunction(
      () => {
        const m = (window as unknown as { __psMap?: { isMoving(): boolean; areTilesLoaded(): boolean } })
          .__psMap;
        return !!m && !m.isMoving() && m.areTilesLoaded();
      },
      undefined,
      { timeout: 20_000 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(1200);
};

/** A phone's sheet down to its lowest step, so the map shows (tapping its handle steps it through its heights). */
async function low(page: Page, phone: boolean): Promise<void> {
  if (!phone) return;
  const handle = page.locator("[title='Drag or tap to resize']").first();
  for (let i = 0; i < 4; i++) {
    const y = (await handle.boundingBox())?.y ?? 0;
    if (y > 600) return;
    await handle.click();
    await page.waitForTimeout(400);
  }
}

async function tall(page: Page, phone: boolean): Promise<void> {
  if (!phone) return;
  const handle = page.locator("[title='Drag or tap to resize']").first();
  for (let i = 0; i < 3 && !(await page.locator(".explore.sheet-tall").count()); i++) {
    await handle.click();
    await page.waitForTimeout(400);
  }
}

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(device, () => {
    test.use(
      phone
        ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );

    test("Boulders in Uses, Boulder ground on the map, the grid's column, Where to look's sort", async ({
      page,
      context,
    }) => {
      test.setTimeout(600_000);
      await replayHar(context, [...SLUGS]);
      await liveImagery(page);
      await openExplorer(page, MACKS);

      // Where to look on the map, nothing open (a phone's is under its search box), sorted by Most boulder ground.
      if (phone) await page.getByRole("button", { name: "Search", exact: true }).click();
      const box = page.getByRole("region", { name: AREA_WORDS.onTheMap });
      await box
        .getByRole("group", { name: AREA_WORDS.sortBy })
        .getByRole("button", { name: AREA_WORDS.sortBoulders })
        .click();
      await expect(box.locator(".ac-boulders").first()).toBeVisible();
      await box.locator(".area-sort").evaluate((el) => el.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${device}-where-to-look.png` });
      if (phone) await page.keyboard.press("Escape");
      await importParcels(page, SLUGS);
      await seedScreens(page, SLUGS, { current: true });
      await settled(page);

      // Uses on Macks: the Boulders line, opened.
      await visit(page, "/library");
      await openFromList(page, loadFixture(MACKS).input.name);
      const tilt = page.locator(".tilt-hint button");
      if (await tilt.count()) await tilt.first().click();
      // Graded here first, so the overlay reads as current and no "Grade again" shows.
      await screenIt(page).catch(() => undefined);
      await page.getByRole("tab", { name: "Uses" }).click();
      const line = page.locator(".uses .boulders-row");
      await expect(line).toContainText("Possible boulder ground");
      await tall(page, phone);
      await line.click();
      await page.locator(".boulders-detail").evaluate((el) => el.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/${device}-uses-boulders.png` });

      // Map layers › Boulder ground on Macks, its key, then the map, with the shading off so the fill reads.
      await page.getByRole("tab", { name: "Grade" }).click();
      await low(page, phone);
      await page.getByRole("button", { name: "Map layers" }).click();
      const panel = page.getByRole("region", { name: "Map layers" });
      // A phone's tall sheet and map controls overlap the panel's lower rows: clicked as the button itself would be.
      const press = (l: ReturnType<Page["locator"]>) => l.evaluate((el) => (el as HTMLElement).click());
      await press(
        panel.getByRole("group", { name: "On the map" }).getByRole("button", { name: "Boulder ground" }),
      );
      await press(panel.getByRole("radiogroup", { name: "Shading" }).getByRole("radio", { name: "Off" }));
      await press(page.locator(".mp-key summary"));
      await page.locator(".mp-key").getByText("Rough lidar texture").scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${device}-boulder-ground-key.png` });
      await press(page.getByRole("button", { name: "Close the map panel" }));
      await low(page, phone);
      await settle(page);
      await page.screenshot({ path: `${OUT}/${device}-boulder-ground-map.png` });

      // The Favorites grid with Boulder ground added, sorted most first (a desktop's grid).
      if (!phone) {
        await visit(page, "/library");
        await page.getByRole("tab", { name: "Shortlist" }).click();
        await page.getByRole("button", { name: "Columns ▾" }).click();
        await page
          .getByRole("group", { name: "Columns" })
          .getByLabel(/^Boulder ground/)
          .check();
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${OUT}/${device}-grid-columns.png` });
        await page.getByRole("button", { name: "Columns ▾" }).click();
        await page
          .locator(".lib-grid thead th")
          .filter({ hasText: "Boulder ground" })
          .getByRole("button")
          .click();
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${OUT}/${device}-grid-boulders.png` });
      }
    });
  });
}
