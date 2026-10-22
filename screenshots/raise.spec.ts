/**
 * Step 12's screenshots (docs/plans/step-12-raise-the-grade.md §10), desktop (1280 × 800) then phone (375 × 812): the
 * adjust panel, an overridden row, a set-aside Must in the answer line. Later PRs add the grid mark, the nudge and the
 * suggestions. Run by `pnpm screenshots`.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { loadFixture, type FixtureSlug } from "../test/support/fixtures";
import { importParcels, openExplorer, openFromList, seedScreens, settled, visit } from "../e2e/flow";
import { replayHar } from "../e2e/replay";

const OUT = "test-results/screenshots";
const FERNEY = "ferney-creek-52-47A" satisfies FixtureSlug;

async function liveImagery(context: BrowserContext): Promise<void> {
  await context.route(/basemap\.nationalmap\.gov|arcgisonline\.com/, (r) => r.continue());
}

/** The phone's sheet, raised until it holds most of the screen (as grade-panel.spec.ts does). */
async function raiseSheet(page: Page): Promise<void> {
  const sheet = page.locator(".explore-panel");
  for (let i = 0; i < 4; i++) {
    if ((await sheet.boundingBox())!.height > 500) return;
    await page.locator(".sheet-handle").tap();
    await page.waitForTimeout(500);
  }
}

const row = (page: Page, key: string) => page.locator(`.card [data-card-key="${key}"] .card-row`);
const adjust = (page: Page) => page.locator(".card-panel .adjust");
const closePanel = (page: Page) => page.locator(".card-panel").getByRole("button", { name: "Close" }).click();

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(device, () => {
    test.use(
      phone
        ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );

    test("adjustments: the panel, an overridden row, a set-aside Must", async ({ page, context }) => {
      test.setTimeout(300_000);
      await replayHar(context, FERNEY);
      await liveImagery(context);
      await openExplorer(page, FERNEY);
      await importParcels(page, [FERNEY]);
      await seedScreens(page, [FERNEY]);
      await settled(page);
      await visit(page, "/library");
      await openFromList(page, loadFixture(FERNEY).input.name);
      if (phone) await raiseSheet(page);

      // The panel's section, then the reason form.
      const sky = row(page, "sky");
      await sky.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await sky.click();
      const section = adjust(page);
      await section.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${device}-adjust-panel.png` });
      await section.locator(".adjust-letters .chip").first().click();
      await section.getByLabel("Why? (required)").fill("No glow from the ridge at night");
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${device}-adjust-reason.png` });
      await section.getByRole("button", { name: "Save" }).click();
      await closePanel(page);

      // The overridden row on the card.
      await sky.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${device}-adjust-row.png` });

      // A Must set aside: its line, and the answer line naming it.
      await row(page, "floodplain").click();
      await adjust(page).getByRole("button", { name: "Set aside for this parcel" }).click();
      await adjust(page).getByLabel("Why? (required)").fill("The house goes on the ridge");
      await adjust(page).getByRole("button", { name: "Save" }).click();
      await closePanel(page);
      await expect(page.locator(".card .card-reason")).toContainText("You set aside a must-have");
      await page.locator(".card .card-answer").evaluate((el) => el.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${device}-adjust-aside-answer.png` });
      await row(page, "floodplain").evaluate((el) => el.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${device}-adjust-aside-must.png` });
    });
  });
}
