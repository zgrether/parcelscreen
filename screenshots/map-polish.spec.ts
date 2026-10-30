/**
 * The map and Details polish (owner, 2026-10-20), at 1280 × 800, 375 × 667 and 360 × 780 (an Android phone; #20 asks
 * for both phone sizes): Ferney graded, the map's controls (#20: a row along the top on a phone, the legend on the
 * left); Map layers with "What's on the map" open (#18); Details with the Listing folded once it has a name (#24) and
 * the notes without "Name: …" (#21). Run by `pnpm screenshots`.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { expectAllDone, importParcel, openExplorer, screenIt } from "../e2e/flow";
import { replayHar } from "../e2e/replay";

const FERNEY = "ferney-creek-52-47A" as const;
const OUT = "test-results/screenshots";

const SIZES = [
  { name: "desktop", viewport: { width: 1280, height: 800 }, phone: false },
  { name: "phone", viewport: { width: 375, height: 667 }, phone: true },
  { name: "android", viewport: { width: 360, height: 780 }, phone: true },
] as const;

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use(
      size.phone ? { viewport: size.viewport, isMobile: true, hasTouch: true } : { viewport: size.viewport },
    );
    const shot = (page: Page, name: string) =>
      page.screenshot({ path: `${OUT}/${size.name}-map-${name}.png` });

    test("the map's controls, Map layers' key, Details", async ({ page, context }) => {
      test.setTimeout(240_000);
      await replayHar(context, [FERNEY]);
      await openExplorer(page, FERNEY);
      await importParcel(page, FERNEY);
      expectAllDone(await screenIt(page));
      // A graded parcel shows the house-site surface, and its legend.
      await page.waitForTimeout(1500);
      await shot(page, "1-controls");

      await page.getByRole("button", { name: "Map layers" }).click();
      const layers = page.getByRole("region", { name: "Map layers" });
      await expect(layers).toBeVisible();
      const key = layers.locator(".mp-key summary");
      if (await key.count()) {
        await key.click();
        await key.scrollIntoViewIfNeeded();
      }
      await page.waitForTimeout(400);
      await shot(page, "2-layers");
      await page.keyboard.press("Escape");
      if (await layers.count()) await layers.getByRole("button", { name: "Close the map panel" }).click();

      await page.getByRole("tab", { name: "Details" }).click();
      if (size.phone)
        for (let i = 0; i < 3; i++) {
          if ((await page.locator(".explore-panel").boundingBox())!.height > 450) break;
          await page.locator(".sheet-handle").tap();
          await page.waitForTimeout(400);
        }
      await page.waitForTimeout(500);
      await shot(page, "3-details");
    });
  });
}
