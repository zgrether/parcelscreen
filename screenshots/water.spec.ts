/**
 * Water on the land's screenshots (docs/plans/water.md §4 PR 4), desktop (1280 × 800) then phone (375 × 812): Macks's
 * Water on the land in Uses, opened, and its garden's water; Map layers' Water on the land and its key; the map with it
 * on, over the imagery; Shading › Wetness; and Mud Creek's watershed on the USGS topo map (the brief's sanity check).
 * Taken by water.yml on CI's runners (the live basemaps), into test-results/screenshots/water/. The fixtures' data is
 * their recordings.
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

const OUT = "test-results/screenshots/water";
const MACKS = "macks-mountain-35-3" satisfies FixtureSlug;
const MUD_CREEK = "grayson-mud-creek-6273" satisfies FixtureSlug;
const ROAN = "roan-hwy-143-099-046-02" satisfies FixtureSlug;
const SLUGS: readonly FixtureSlug[] = [MACKS, MUD_CREEK];

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

/** A phone's tall sheet and map controls overlap the panel's lower rows: clicked as the button itself would be. */
const press = (l: ReturnType<Page["locator"]>) => l.evaluate((el) => (el as HTMLElement).click());

/** Opens a saved parcel and grades it here, so the overlays and the wetness are the live session's. */
async function openGraded(page: Page, slug: FixtureSlug): Promise<void> {
  await visit(page, "/library");
  await openFromList(page, loadFixture(slug).input.name);
  const tilt = page.locator(".tilt-hint button");
  if (await tilt.count()) await tilt.first().click();
  await screenIt(page).catch(() => undefined);
}

/** Map layers open, with the shading set and the basemap picked. */
async function layers(
  page: Page,
  /** No shading for a saved grade: it needs a live run (the row says "grade again to show"). */
  o: { shading?: string; basemap?: string },
): Promise<ReturnType<Page["getByRole"]>> {
  await page.getByRole("button", { name: "Map layers" }).click();
  const panel = page.getByRole("region", { name: "Map layers" });
  if (o.shading)
    await press(panel.getByRole("radiogroup", { name: "Shading" }).getByRole("radio", { name: o.shading }));
  if (o.basemap)
    await press(page.getByRole("radiogroup", { name: "Basemap" }).getByRole("radio", { name: o.basemap }));
  return panel;
}

const closeLayers = (page: Page) => press(page.getByRole("button", { name: "Close the map panel" }));

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(device, () => {
    test.use(
      phone
        ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );

    test("Water in Uses and the garden, the map's layer and key, Wetness, Mud Creek on the topo map", async ({
      page,
      context,
    }) => {
      test.setTimeout(600_000);
      await replayHar(context, [...SLUGS]);
      await liveImagery(page);
      await openExplorer(page, MACKS);
      await importParcels(page, SLUGS);
      // Macks is graded here (Wetness is the live session's); Mud Creek shows its saved grade, settings and all, since
      // grading it again would ask for the county boundary's data, which the recording (the fixture's) doesn't hold.
      await seedScreens(page, [MACKS], { current: true });
      await seedScreens(page, [MUD_CREEK], { current: true, settings: true });
      await settled(page);

      // Uses on Macks: Water on the land, opened; then Garden, orchard, animals, opened to its water.
      await openGraded(page, MACKS);
      await page.getByRole("tab", { name: "Uses" }).click();
      const uses = page.getByRole("region", { name: "Uses" });
      const line = uses.locator(".water-row");
      await expect(line).toContainText("drains onto it");
      await tall(page, phone);
      await line.click();
      await uses.locator(".water-detail").evaluate((el) => el.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/${device}-uses-water.png` });
      const garden = uses.locator(".use", { hasText: "Garden, orchard, animals" });
      await garden.locator(".use-row").click();
      const holds = garden.getByText("Water it holds");
      await expect(holds).toBeVisible();
      await holds.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${device}-uses-garden-water.png` });

      // Map layers › Water on the land on Macks, its key, then the map over the imagery, the shading off.
      await page.getByRole("tab", { name: "Grade" }).click();
      await low(page, phone);
      const panel = await layers(page, { shading: "Off" });
      await press(
        panel.getByRole("group", { name: "On the map" }).getByRole("button", { name: "Water on the land" }),
      );
      await press(page.locator(".mp-key summary"));
      await page.locator(".mp-key").getByText("Where water gathers on the parcel").scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${device}-water-key.png` });
      await closeLayers(page);
      await low(page, phone);
      await settle(page);
      await page.screenshot({ path: `${OUT}/${device}-macks-water-map.png` });

      // Shading › Wetness, the water layer off so the shading reads alone.
      const again = await layers(page, { shading: "Wetness" });
      await press(
        again.getByRole("group", { name: "On the map" }).getByRole("button", { name: "Water on the land" }),
      );
      await closeLayers(page);
      await low(page, phone);
      await settle(page);
      await page.screenshot({ path: `${OUT}/${device}-macks-wetness.png` });

      // Mud Creek's watershed on the USGS topo map: Water on the land on (no shading: it's the saved grade).
      // Its saved grade (the recording is of the fixture's boundary, not the county's): the watershed is in it.
      await visit(page, "/library");
      await openFromList(page, loadFixture(MUD_CREEK).input.name);
      await low(page, phone);
      const mud = await layers(page, { basemap: "Topo (USGS)" });
      await press(
        mud.getByRole("group", { name: "On the map" }).getByRole("button", { name: "Water on the land" }),
      );
      await closeLayers(page);
      await low(page, phone);
      await settle(page);
      await page.screenshot({ path: `${OUT}/${device}-mud-creek-watershed-topo.png` });
    });
  });
}

/**
 * The review's fixes (owner, 2026-11-05): Roan's Garden line with a flow line at its patch; the key line naming the
 * overlays that are on (Water on the land, Boulder ground); Wetness's legend, its range and note, placed on a phone
 * above the key line and the sheet. The legend's placement on two more phone sizes.
 */
for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(`${device}, the review's fixes`, () => {
    test.use(
      phone
        ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );

    test("Roan's garden water, the key line with overlays on, Wetness's legend", async ({
      page,
      context,
    }) => {
      test.setTimeout(600_000);
      await replayHar(context, [MACKS, ROAN]);
      await liveImagery(page);
      await openExplorer(page, MACKS);
      await importParcels(page, [MACKS, ROAN]);
      await seedScreens(page, [MACKS], { current: true });
      await seedScreens(page, [ROAN], { current: true, settings: true });
      await settled(page);

      // Roan's saved grade: Uses › Garden, a flow line at its patch.
      await visit(page, "/library");
      await openFromList(page, loadFixture(ROAN).input.name);
      const tilt = page.locator(".tilt-hint button");
      if (await tilt.count()) await tilt.first().click();
      // Opened from the list, a phone's sheet sits at its peek, the tabs below the fold: raised first.
      await tall(page, phone);
      await press(page.getByRole("tab", { name: "Uses" }));
      const uses = page.getByRole("region", { name: "Uses" });
      const garden = uses.locator(".use", { hasText: "Garden, orchard, animals" });
      await expect(garden).toContainText("water gathers here in rain (flow line)");
      await garden.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${device}-fix-garden-flow.png` });

      // Macks graded here: Water on the land and Boulder ground on, and Shading › Wetness.
      await openGraded(page, MACKS);
      await page.getByRole("tab", { name: "Grade" }).click();
      await low(page, phone);
      const panel = await layers(page, { shading: "Wetness" });
      const onTheMap = panel.getByRole("group", { name: "On the map" });
      await press(onTheMap.getByRole("button", { name: "Water on the land" }));
      await press(onTheMap.getByRole("button", { name: "Boulder ground" }));
      await closeLayers(page);
      await low(page, phone);
      await settle(page);
      const line = page.locator(".map-key-line");
      await expect(line).toContainText("Water on the land");
      await expect(line).toContainText("Boulder ground");
      await expect(page.locator(".surface-legend.wet")).toContainText("wetter ← → drier");
      await page.screenshot({ path: `${OUT}/${device}-fix-key-and-wetness.png` });
    });
  });
}

for (const [w, h] of [
  [375, 667],
  [360, 780],
] as const) {
  test.describe(`phone ${w} × ${h}, Wetness's legend`, () => {
    test.use({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });

    test("sits above the key line and the sheet, clear of Your list", async ({ page, context }) => {
      test.setTimeout(600_000);
      await replayHar(context, [MACKS]);
      await liveImagery(page);
      await openExplorer(page, MACKS);
      await importParcels(page, [MACKS]);
      await seedScreens(page, [MACKS], { current: true });
      await settled(page);
      await openGraded(page, MACKS);
      await page.getByRole("tab", { name: "Grade" }).click();
      await low(page, true);
      const panel = await layers(page, { shading: "Wetness" });
      await press(
        panel.getByRole("group", { name: "On the map" }).getByRole("button", { name: "Water on the land" }),
      );
      await closeLayers(page);
      await low(page, true);
      await settle(page);
      // Clear of Your list above, of the key line below.
      const legend = await page.locator(".surface-legend.wet").boundingBox();
      const back = await page.locator(".back-chip").first().boundingBox();
      const key = await page.locator(".map-key-line").boundingBox();
      expect(legend).not.toBeNull();
      if (back) expect(legend!.y).toBeGreaterThanOrEqual(back.y + back.height);
      if (key) expect(legend!.y + legend!.height).toBeLessThanOrEqual(key.y);
      await page.screenshot({ path: `${OUT}/phone-${w}x${h}-wetness.png` });
    });
  });
}
