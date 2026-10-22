/**
 * Step 12's screenshots (docs/plans/step-12-raise-the-grade.md §10), desktop (1280 × 800) then phone (375 × 812): the
 * adjust panel, an overridden row, a set-aside Must in the answer line. Later PRs add the grid mark, the nudge and the
 * suggestions. Run by `pnpm screenshots`.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { loadFixture, type FixtureSlug } from "../test/support/fixtures";
import {
  importParcel,
  importParcels,
  openExplorer,
  openFromList,
  screenIt,
  seedScreens,
  settled,
  visit,
} from "../e2e/flow";
import { GRAYSON, withRedGate } from "../e2e/redGate";
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

/** Ways to raise this grade on a parcel (PR 6): the section after the card. */
async function shootSuggestions(page: Page, slug: FixtureSlug, file: string, phone: boolean): Promise<void> {
  await visit(page, "/library");
  await openFromList(page, loadFixture(slug).input.name);
  if (phone) await raiseSheet(page);
  const raise = page.getByRole("region", { name: "Ways to raise this grade" });
  await expect(raise).toBeVisible({ timeout: 30_000 });
  await raise.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: file });
}

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
      await replayHar(context, [FERNEY, "macks-mountain-35-3", "grayson-mud-creek-6273"]);
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

      // The list: the grade and the factors marked (PR 4).
      await visit(page, "/library");
      await expect(page.locator(".lib-grade .adjusted-mark:visible").first()).toBeVisible();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${device}-adjust-grid.png` });

      // The nudge (PR 5): Night sky set aside on three parcels, What matters offers once.
      await importParcels(page, ["macks-mountain-35-3", "grayson-mud-creek-6273"]);
      await settled(page);
      await page.evaluate(() => {
        const kv = window.__psKv!;
        const me = localStorage.getItem("ps.profile")!;
        const h = JSON.parse(kv.getItem("ps.household") ?? '{"v":1,"asks":[],"takes":[],"adjusts":[]}');
        const keys = (JSON.parse(kv.getItem("ps.parcels")!) as { built: { key: string }[] }).built.map(
          (p) => p.key,
        );
        // One per factor per parcel: Ferney's Night sky override gives way to the set-aside.
        h.adjusts = h.adjusts.filter((a: { factor: string }) => a.factor !== "sky");
        for (const parcel of keys)
          h.adjusts.push({
            key: `${parcel}:${me}:sky`,
            parcel,
            by: me,
            factor: "sky",
            kind: "setAside",
            reason: "fine by us",
            was: "B",
            at: "2026-10-22T12:00:00Z",
          });
        kv.setItem("ps.household", JSON.stringify(h));
      });
      await settled(page);
      await visit(page, "/priorities");
      await expect(page.locator(".rubric-nudge")).toBeVisible();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${device}-adjust-nudge.png` });

      // Ways to raise this grade (PR 6), on Mud Creek and Macks.
      await seedScreens(page, ["macks-mountain-35-3", "grayson-mud-creek-6273"]);
      await settled(page);
      // The nudge's seeded set-asides off, so each card is the app's own.
      await page.evaluate(() => {
        const kv = window.__psKv!;
        kv.setItem("ps.household", JSON.stringify({ v: 1, asks: [], takes: [], adjusts: [] }));
      });
      await settled(page);
      await shootSuggestions(page, "grayson-mud-creek-6273", `${OUT}/${device}-raise-mud.png`, phone);
      await shootSuggestions(page, "macks-mountain-35-3", `${OUT}/${device}-raise-macks.png`, phone);

      // The parcel next door (PR 8): combine mode, with its hint.
      await page.getByRole("button", { name: "Grade it with the parcel next door" }).click();
      await expect(page.getByText("Tap the parcel next door, then Grade the combination")).toBeVisible();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/${device}-raise-neighbour.png` });
    });
  });
}

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(`${device} red gate`, () => {
    test.use(
      phone
        ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );

    test("Try it in the Easement panel: the red gate, the card going down and why (PR 7)", async ({
      page,
      context,
    }) => {
      test.setTimeout(300_000);
      await replayHar(context, [GRAYSON]);
      await liveImagery(context);
      await openExplorer(page, GRAYSON);
      await importParcel(page, GRAYSON);
      await withRedGate(page);
      await screenIt(page);
      if (phone) await raiseSheet(page);
      await page
        .locator(".must-row")
        .filter({ has: page.locator(".row-label", { hasText: /driveway on your land/i }) })
        .click();
      const redGate = page.locator(".route-choice-col").filter({ hasText: "Red gate" });
      await redGate.getByRole("button", { name: "Try it" }).click();
      await expect(redGate.locator(".try-it.tried")).toBeVisible({ timeout: 60_000 });
      await redGate.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${device}-try-red-gate.png` });
    });
  });
}
