/**
 * Step 11's screenshots (docs/plans/step-11-new-data.md §10), desktop (1280 × 800) then phone (375 × 812): each new
 * factor's row on the card for Mud Creek, Ferney and Roan, its panel on Mud Creek, and What matters' notice for
 * priorities saved before the step. Each factor's PR adds its own to FACTORS. Run by `pnpm screenshots`.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { loadFixture, type FixtureSlug } from "../test/support/fixtures";
import { importParcels, openExplorer, openFromList, seedScreens, settled, visit } from "../e2e/flow";
import { replayHar } from "../e2e/replay";
import { defaultRubric, rubricFromWeights } from "../lib/rubric/default";
import type { Rubric } from "../lib/rubric/types";
import { SCREEN_CONSTANTS } from "../lib/screen/config";

const OUT = "test-results/screenshots";
const SLUGS = [
  "grayson-mud-creek-6273",
  "ferney-creek-52-47A",
  "roan-hwy-143-099-046-02",
] as const satisfies readonly FixtureSlug[];
const SHORT: Record<(typeof SLUGS)[number], string> = {
  "grayson-mud-creek-6273": "mud",
  "ferney-creek-52-47A": "ferney",
  "roan-hwy-143-099-046-02": "roan",
};

/** Each new factor's row label on the card, and its screenshots' name. */
const FACTORS = [
  { label: "Hospital", file: "hospital" },
  { label: "Town and groceries", file: "town" },
  { label: "Climate", file: "climate" },
  { label: "Privacy", file: "privacy" },
] as const;

/** The starting list with Town (the groceries) and each new factor weighed too, so each shows on the card. */
const GRADED: Rubric = rubricFromWeights({
  ...SCREEN_CONSTANTS.card.weights.default,
  town: 5,
  climate: 5,
  privacy: 5,
});

/** Priorities as saved before step 11: rank-sum, Town in Really want, no Hospital. */
const SAVED_BEFORE: Rubric = {
  ...defaultRubric(),
  weights: { mode: "rankSum" },
  ranked: [
    { factor: "elevation", tier: "should" },
    { factor: "homesite", tier: "should" },
    { factor: "town", tier: "should" },
    { factor: "trails", tier: "could" },
  ],
  wonts: ["room", "sky", "garden", "driveway"],
};

async function liveImagery(context: BrowserContext): Promise<void> {
  await context.route(/basemap\.nationalmap\.gov|arcgisonline\.com/, (r) => r.continue());
}

const seedRubric = (page: Page, mine: Rubric) =>
  page.evaluate((m) => {
    window.__psKv!.setItem("ps.rubrics", JSON.stringify({ mine: m, others: [], drivewayAdded: "undone" }));
  }, mine);

/** The phone's sheet, raised until it holds most of the screen (as grade-panel.spec.ts does). */
async function raiseSheet(page: Page): Promise<void> {
  const sheet = page.locator(".explore-panel");
  for (let i = 0; i < 4; i++) {
    if ((await sheet.boundingBox())!.height > 500) return;
    await page.locator(".sheet-handle").tap();
    await page.waitForTimeout(500);
  }
}

const row = (page: Page, label: string) =>
  page.locator("button.card-row", { has: page.getByText(label, { exact: true }) }).first();

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(device, () => {
    test.use(
      phone
        ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );

    test("the new factors: each row on three parcels, its panel, and the notice", async ({
      page,
      context,
    }) => {
      test.setTimeout(300_000);
      await replayHar(context, [...SLUGS]);
      await liveImagery(context);
      await openExplorer(page, SLUGS[0]);
      await importParcels(page, SLUGS);
      await seedScreens(page, SLUGS);
      await settled(page);
      await seedRubric(page, GRADED);

      for (const slug of SLUGS) {
        await visit(page, "/library");
        await openFromList(page, loadFixture(slug).input.name);
        if (phone) await raiseSheet(page);
        for (const f of FACTORS) {
          const r = row(page, f.label);
          await expect(r).toBeVisible({ timeout: 30_000 });
          await r.evaluate((el) => el.scrollIntoView({ block: "center" }));
          await page.waitForTimeout(300);
          await page.screenshot({ path: `${OUT}/${device}-factor-${f.file}-${SHORT[slug]}.png` });
          if (slug !== SLUGS[0]) continue;
          await r.click();
          await expect(page.locator(".card-panel")).toBeVisible();
          await page.waitForTimeout(400);
          await page.screenshot({ path: `${OUT}/${device}-factor-${f.file}-panel.png` });
          await page.locator(".card-panel").getByRole("button", { name: "Close" }).click();
        }
      }

      // What matters, for priorities saved before the step: the one notice.
      await page.evaluate((m) => {
        window.__psKv!.setItem(
          "ps.rubrics",
          JSON.stringify({ mine: m, others: [], drivewayAdded: "undone" }),
        );
      }, SAVED_BEFORE);
      await visit(page, "/priorities");
      await expect(page.locator(".rubric-new-factors")).toBeVisible();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${device}-factor-notice.png` });

      // Its new questions, asked on their own (Climate's: question 1 and its follow-ups).
      await page
        .locator(".rubric-new-factors")
        .getByRole("link", { name: "Answer the new questions" })
        .click();
      await page.waitForURL("**/interview?ask=climate");
      await page.getByRole("radio", { name: "In between" }).click();
      await expect(page.locator(".iv-follow")).toBeVisible();
      await page.screenshot({ path: `${OUT}/${device}-factor-ask-climate.png` });
    });
  });
}
