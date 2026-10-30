/**
 * Step 4b's screenshots (plan §14), desktop (1280 × 800) then phone (375 × 667, the size the no-overlap check uses):
 * the map with no parcel; Mud Creek screened (the sheet at 46% and at its peek on a phone); Your list with two ticked
 * and Compare; Compare; What matters to you; Help at the top and at a rule; Settings' Your data; and the menu (the
 * panel under ☰ on a desktop, More's sheet on a phone). Run by `pnpm screenshots`; the parcels are the fixtures, under
 * the default "Profile 1", and no facts card is opened, so no owner shows.
 */
import type { BrowserContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  importParcels,
  listRow,
  openExplorer,
  openFromList,
  openMenu,
  openYourData,
  screenIt,
} from "../e2e/flow";
import { replayHar } from "../e2e/replay";

const MUD = "grayson-mud-creek-6273" as const;
const FERNEY = "ferney-creek-52-47A" as const;
const OUT = "test-results/screenshots";

/** The state aerial, the USGS fallback and the terrain tiles, live (the replay aborts tiles). Registered last. */
async function liveImagery(context: BrowserContext): Promise<void> {
  await context.route(
    /VBMP_Imagery|Orthoimagery_Latest|basemap\.nationalmap\.gov|elevation-tiles-prod/,
    (r) => r.continue(),
  );
}

/** Waits for the map to stop loading tiles, so a shot isn't half drawn. */
const mapIdle = (page: Page) =>
  expect
    .poll(() => page.evaluate(() => !!(window as { __psMap?: { loaded(): boolean } }).__psMap?.loaded()), {
      timeout: 30_000,
    })
    .toBe(true);

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(device, () => {
    test.use(
      phone
        ? { viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );
    const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${device}-nav-${name}.png` });

    test("the places, the map and the menu; the list, Compare, What matters, Help and Your data", async ({
      page,
      context,
    }) => {
      test.setTimeout(400_000);
      await replayHar(context, [MUD, FERNEY]);
      await liveImagery(context);
      await openExplorer(page, MUD);
      await mapIdle(page).catch(() => undefined);
      await shot(page, "1-map");

      // The menu: the panel under ☰, or More's sheet.
      await openMenu(page);
      await page.waitForTimeout(200);
      await shot(page, "2-menu");
      await page.keyboard.press("Escape");

      // Settings' Your data, at the foot of the dialog.
      await openYourData(page);
      await page.getByRole("heading", { name: "Your data" }).scrollIntoViewIfNeeded();
      await shot(page, "3-your-data");
      await page.keyboard.press("Escape");
      await importParcels(page, [MUD, FERNEY]);

      // Mud Creek screened: the sheet at 46% (where a run leaves it on a phone), then at its peek.
      await openFromList(page, "parcel 6273");
      await screenIt(page);
      // The overlays drawn (the run's tiles keep the map from ever reporting idle).
      await page.waitForTimeout(3000);
      await shot(page, "4-screened");
      if (phone) {
        const handle = page.locator(".sheet-handle");
        await handle.tap();
        await handle.tap();
        await page.waitForTimeout(400);
        await shot(page, "5-peek");
      }

      // Your list, two ticked, and Compare.
      await page.getByRole("link", { name: "Your list", exact: true }).click();
      await expect(listRow(page, "parcel 6273")).toBeVisible();
      for (const id of ["parcel 6273", "parcel 52-47A"])
        await page.getByRole("checkbox", { name: new RegExp(`^Compare .*${id}`) }).check();
      await shot(page, "6-list");
      await page.getByRole("button", { name: "Compare 2" }).click();
      await expect(page.locator(".compare-table")).toBeVisible();
      await shot(page, "7-compare");

      // What matters to you.
      await page.getByRole("link", { name: "What matters", exact: true }).click();
      await expect(page.getByRole("region", { name: "Try it" })).toBeVisible();
      await shot(page, "8-what-matters");

      // Help: the top, then a rule (an old /rulebook link's way in).
      await (await openMenu(page)).getByRole("link", { name: "Help", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Reading a parcel's report" })).toBeVisible();
      await shot(page, "9-help");
      await page.goto("/rulebook#rule-trails");
      await expect(page.locator("#rule-trails")).toBeInViewport();
      await shot(page, "10-help-rule");
    });
  });
}
