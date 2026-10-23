/**
 * The site-letters fix's screenshots (owner, 2026-10-22), desktop (1280 × 800) then phone (375 × 812): Mud Creek with
 * Room to build overridden, its panel saying where the override applies, the card with Best homesite's measurements
 * beside it, the grid, and One page. Run by `pnpm screenshots`.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { loadFixture } from "../test/support/fixtures";
import { importParcels, openExplorer, openFromList, seedScreens, settled, visit } from "../e2e/flow";
import { GRAYSON } from "../e2e/redGate";
import { replayHar } from "../e2e/replay";

const OUT = "test-results/screenshots";

async function liveImagery(context: BrowserContext): Promise<void> {
  await context.route(/basemap\.nationalmap\.gov|arcgisonline\.com/, (r) => r.continue());
}

async function raiseSheet(page: Page): Promise<void> {
  const sheet = page.locator(".explore-panel");
  for (let i = 0; i < 4; i++) {
    if ((await sheet.boundingBox())!.height > 500) return;
    await page.locator(".sheet-handle").tap();
    await page.waitForTimeout(500);
  }
}

const keyOf = (page: Page, name: string): Promise<string> =>
  page.evaluate(
    (n) =>
      (
        JSON.parse(window.__psKv!.getItem("ps.parcels")!) as { built: { name: string; key: string }[] }
      ).built.find((b) => b.name === n)!.key,
    name,
  );

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(device, () => {
    test.use(
      phone
        ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );

    test("Mud Creek, Room to build overridden: the panel, the card, the grid, One page", async ({
      page,
      context,
    }) => {
      test.setTimeout(300_000);
      await replayHar(context, [GRAYSON]);
      await liveImagery(context);
      await openExplorer(page, GRAYSON);
      await importParcels(page, [GRAYSON]);
      await seedScreens(page, [GRAYSON]);
      await settled(page);
      const name = loadFixture(GRAYSON).input.name;
      await visit(page, "/library");
      await openFromList(page, name);
      if (phone) await raiseSheet(page);

      // The panel: where the override applies, then the letter and the reason.
      const room = page.locator(`.card [data-card-key="room"] .card-row`);
      await room.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await room.click();
      const adjust = page.locator(".card-panel .adjust");
      await expect(adjust.locator(".adjust-site")).toContainText("Applies to this parcel's graded site, #");
      await adjust.getByRole("button", { name: "Override the grade: A" }).click();
      await adjust
        .getByLabel("Why? (required)")
        .fill("The bench below the road is wider than the lidar shows");
      await adjust.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${device}-site-letters-panel.png` });
      await adjust.getByRole("button", { name: "Save" }).click();
      await page.locator(".card-panel").getByRole("button", { name: "Close" }).click();

      // The card: Room to build A ✎; Best homesite's measurements, no letter.
      const best = page.locator(".best-site");
      await expect(best.locator(".card-grade")).toHaveCount(0);
      await best.evaluate((el) => el.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${device}-site-letters-best.png` });
      await room.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${device}-site-letters-card.png` });

      // The grid (the phone's strip).
      await visit(page, "/library");
      await page.getByRole("tab", { name: "Favorites" }).click();
      await expect(page.locator(".adjusted-mark:visible").first()).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${device}-site-letters-grid.png` });

      // One page.
      await visit(page, `/parcel/${await keyOf(page, name)}/report?preset=one`);
      await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeEnabled({
        timeout: 60_000,
      });
      const roomRow = page.locator(".rp-card tr").filter({ hasText: "Room to build" });
      await expect(roomRow.locator(".adjusted-mark")).toBeVisible();
      await roomRow.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${device}-site-letters-onepage.png` });
    });
  });
}
