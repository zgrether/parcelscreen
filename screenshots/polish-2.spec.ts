/**
 * Polish pass 2's before and after shots (docs/plans/polish-2.md §5): the screens the pass changes, at 1280 × 800,
 * 375 × 667 and 360 × 780, with the four fixtures graded and current (no stale banner). POLISH_TAG names the set
 * ("before" on main, "after" on the branch). Run by `pnpm screenshots polish-2`.
 */
import { expect, test, type Page } from "@playwright/test";
import {
  importParcels,
  openExplorer,
  openFromList,
  openYourData,
  seedScreens,
  settled,
  visit,
} from "../e2e/flow";
import { replayHar } from "../e2e/replay";
import type { FixtureSlug } from "../test/support/fixtures";

const OUT = "test-results/screenshots/polish-2";
const TAG = process.env.POLISH_TAG ?? "after";
const SLUGS = [
  "grayson-mud-creek-6273",
  "macks-mountain-35-3",
  "ferney-creek-52-47A",
  "roan-hwy-143-099-046-02",
] as const satisfies readonly FixtureSlug[];

const VIEWS = [
  { device: "desktop", viewport: { width: 1280, height: 800 }, phone: false },
  { device: "phone375", viewport: { width: 375, height: 667 }, phone: true },
  { device: "phone360", viewport: { width: 360, height: 780 }, phone: true },
] as const;

/** The phone's sheet, raised until it holds most of the screen. */
async function raiseSheet(page: Page): Promise<void> {
  const sheet = page.locator(".explore-panel");
  for (let i = 0; i < 4; i++) {
    if ((await sheet.boundingBox())!.height > 450) return;
    await page.locator(".sheet-handle").tap();
    await page.waitForTimeout(500);
  }
}

const toTop = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => el.scrollIntoView({ block: "start" }));

for (const v of VIEWS) {
  test.describe(v.device, () => {
    test.use(v.phone ? { viewport: v.viewport, isMobile: true, hasTouch: true } : { viewport: v.viewport });
    const shot = (page: Page, name: string) =>
      page.screenshot({ path: `${OUT}/${TAG}/${v.device}-${name}.png` });

    test("the screens", async ({ page, context }) => {
      test.setTimeout(420_000);
      await replayHar(context, [...SLUGS]);
      await context.route(/basemap\.nationalmap\.gov|arcgisonline\.com/, (r) => r.continue());
      await openExplorer(page, SLUGS[0]);
      await importParcels(page, SLUGS);
      await seedScreens(page, SLUGS, { current: true, settings: true });
      await settled(page);

      // Your list and Recent.
      await visit(page, "/library");
      await expect(page.locator(".lib-row:visible").first()).toBeVisible();
      await page.waitForTimeout(500);
      await shot(page, "list-1-shortlist");
      const recent = page.getByRole("tab", { name: /Recent/ });
      if (await recent.count()) {
        await recent.first().click();
        await page.waitForTimeout(400);
        await shot(page, "list-2-recent");
        await page
          .getByRole("tab", { name: /Shortlist/ })
          .first()
          .click();
      }

      // A parcel opened on the map: Grade, then Uses and Details.
      await openFromList(page, "Ferney");
      const tilt = page.locator(".tilt-hint button");
      if (await tilt.count()) await tilt.first().click();
      await page.waitForTimeout(1500);
      await shot(page, "map-1-parcel");
      if (v.phone) await raiseSheet(page);
      await toTop(page, ".card");
      await page.waitForTimeout(300);
      await shot(page, "panel-1-grade");
      for (const sel of [".best-site", ".must-row"]) {
        if (await page.locator(sel).count()) {
          await toTop(page, sel);
          await page.waitForTimeout(300);
          await shot(page, `panel-2-grade-${sel.slice(1)}`);
        }
      }
      for (const tab of ["Uses", "Details"]) {
        const t = page.getByRole("tab", { name: tab, exact: true });
        if (!(await t.count())) continue;
        await t.first().click();
        await page.waitForTimeout(600);
        await shot(page, `panel-3-${tab.toLowerCase()}`);
      }
      await page.getByRole("tab", { name: "Grade", exact: true }).first().click();

      // Map layers.
      const layers = page.getByRole("button", { name: /Map layers/ });
      if (await layers.count()) {
        await layers.first().click();
        await page.waitForTimeout(600);
        await shot(page, "map-2-layers");
        await page.locator(".map-panel .mp-body").evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
        await page.waitForTimeout(300);
        await shot(page, "map-3-layers-results");
        await page.keyboard.press("Escape");
      }

      // Compare, What matters, the interview.
      await visit(page, "/compare");
      await page.waitForTimeout(1000);
      await shot(page, "compare-1");
      await visit(page, "/priorities");
      await page.waitForTimeout(1000);
      await shot(page, "priorities-1");
      await visit(page, "/interview");
      await page.waitForTimeout(1000);
      await shot(page, "interview-1");

      // Settings › Offline, and One page's export (its key; a phone's Full size).
      await visit(page, "/library");
      await openYourData(page);
      await page.locator(".offline-settings").evaluate((el) => el.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(300);
      await shot(page, "settings-offline");
      await page.keyboard.press("Escape");
      const key = await page.evaluate(
        () =>
          (
            JSON.parse(window.__psKv!.getItem("ps.parcels")!) as { built: { name: string; key: string }[] }
          ).built.find((b) => b.name.startsWith("Ferney"))!.key,
      );
      await visit(page, `/parcel/${key}/report?preset=one`);
      await page.waitForTimeout(2500);
      await shot(page, "report-one-page");
      const full = page.getByRole("button", { name: "Full size" });
      if (await full.count()) {
        await full.click();
        await page.waitForTimeout(500);
        await shot(page, "report-one-page-full");
      }
      await settled(page);
    });
  });
}
