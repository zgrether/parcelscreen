/**
 * Step 13's screenshots (docs/plans/step-13-area-catalog.md §10), desktop (1280 × 800) then phone (375 × 812): Areas
 * that fit you after the interview, Where to look on the map, Show more, the outlines (all, and a starred one), and an
 * area's popup. Run by `pnpm screenshots`.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { AREA_WORDS as W, SAMPLE_WORDS } from "@/lib/areas/words";
import { defaultRubric } from "@/lib/rubric/default";
import { openExplorer, reload, settled, visit } from "../e2e/flow";
import { GRAYSON } from "../e2e/redGate";
import { replayHar } from "../e2e/replay";

const OUT = "test-results/screenshots";

async function liveImagery(context: BrowserContext): Promise<void> {
  await context.route(/basemap\.nationalmap\.gov|arcgisonline\.com/, (r) => r.continue());
}

/** The phone's sheet, raised until it holds most of the screen. */
async function raiseSheet(page: Page): Promise<void> {
  const sheet = page.locator(".explore-panel");
  for (let i = 0; i < 4; i++) {
    if ((await sheet.boundingBox())!.height > 500) return;
    await page.locator(".sheet-handle").tap();
    await page.waitForTimeout(500);
  }
}

async function dismissTilt(page: Page): Promise<void> {
  const x = page.locator(".tilt-hint button");
  if (await x.count()) await x.first().click();
}

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(device, () => {
    test.use(
      phone
        ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );

    test("the suggestion box and the outlines", async ({ page, context }) => {
      test.setTimeout(180_000);
      await replayHar(context, [GRAYSON]);
      await liveImagery(context);
      await openExplorer(page, GRAYSON);

      // After the interview.
      await visit(page, "/interview");
      for (let i = 0; i < 16 && !(await page.getByText("What matters to you").first().isVisible()); i++)
        await page.getByRole("button", { name: /^(Next|Skip|See my priorities)$/ }).click();
      const after = page.getByRole("region", { name: W.afterInterview });
      await expect(after.locator(".area-card")).toHaveCount(5);
      await after.evaluate((el) => el.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${device}-areas-interview.png` });

      // On the map, nothing open: Where to look (a phone's is under its search box).
      await visit(page, "/explore");
      await dismissTilt(page);
      if (phone) await page.getByRole("button", { name: "Search", exact: true }).click();
      const box = page.getByRole("region", { name: W.onTheMap });
      await expect(box.locator(".area-card")).toHaveCount(5);
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT}/${device}-areas-where-to-look.png` });
      await box.getByRole("button", { name: W.showMore }).click();
      await box.locator(".area-rest").evaluate((el) => el.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${device}-areas-show-more.png` });

      // A star, then the area shown: its outline, solid and named.
      await box.getByRole("button", { name: W.showFewer }).click();
      await box.locator(".area-card").first().getByRole("button", { name: W.star }).click();
      await box.getByRole("button", { name: W.showParcel }).first().click();
      if (phone) await page.keyboard.press("Escape");
      await page.waitForTimeout(2500);
      await settled(page);
      await page.screenshot({ path: `${OUT}/${device}-areas-starred.png` });

      // Map layers: every outline.
      await page.getByRole("button", { name: "Map layers" }).click();
      await page.getByRole("button", { name: W.outlines }).click();
      await page.getByRole("button", { name: "Map layers" }).click();
      await page.evaluate(() =>
        (window as unknown as { __psMap: { jumpTo(o: object): void } }).__psMap.jumpTo({
          center: [-81.6, 36.4],
          zoom: 7.4,
        }),
      );
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${OUT}/${device}-areas-outlines.png` });
    });

    test("with must-haves an area can measure: the share as each card's headline, the fit's sign", async ({
      page,
      context,
    }) => {
      test.setTimeout(120_000);
      await replayHar(context, [GRAYSON]);
      await liveImagery(context);
      await openExplorer(page, GRAYSON);
      await dismissTilt(page);
      const musts = {
        ...defaultRubric(),
        musts: [
          ...defaultRubric().musts,
          { factor: "elevation", threshold: 3000 },
          { factor: "hospital", threshold: 30 },
        ],
      };
      await page.evaluate(
        (r) => window.__psKv!.setItem("ps.rubrics", JSON.stringify({ mine: r, others: [] })),
        musts,
      );
      await reload(page);
      await dismissTilt(page);
      if (phone) await page.getByRole("button", { name: "Search", exact: true }).click();
      const box = page.getByRole("region", { name: W.onTheMap });
      await expect(box.locator(".ac-pct").first()).toHaveText(/^\d+%$/);
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT}/${device}-areas-musts.png` });
    });

    test("a sample parcel, before and after Add to list", async ({ page, context }) => {
      test.setTimeout(180_000);
      await replayHar(context, [GRAYSON]);
      await liveImagery(context);
      await openExplorer(page, GRAYSON);
      await dismissTilt(page);
      if (phone) await page.getByRole("button", { name: "Search", exact: true }).click();
      const box = page.getByRole("region", { name: W.onTheMap });
      await box.getByRole("button", { name: W.showParcel }).first().click();
      const header = page.locator(".explore-header");
      await expect(header.locator(".sh-sample")).toHaveText(SAMPLE_WORDS.tag);
      if (phone) await raiseSheet(page);
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${OUT}/${device}-areas-sample.png` });
      await header.getByRole("button", { name: /^Add to list/ }).click();
      await page.getByRole("dialog", { name: "Add to list" }).getByRole("button", { name: "Add" }).click();
      await expect(header.locator(".sh-sample")).toHaveCount(0);
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT}/${device}-areas-sample-added.png` });
    });
  });
}
