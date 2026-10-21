/**
 * Step 10's screenshots (plan §12, PR 4), desktop (1280 × 800) then phone (375 × 812): Mud Creek at its $185k listing
 * price, graded by a list with budgets ($250k to camp, $300k to build; Within budget last in Really want):
 * - the Grade section's Cost to enjoy, and its breakdown (camp, then build);
 * - Favorites with the Cost to build column (the card's facts line on a phone);
 * - Settings → Costs; What matters with the Within budget card; One page with both lines.
 * Run by `pnpm screenshots`.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { loadFixture, type FixtureSlug } from "../test/support/fixtures";
import {
  importParcels,
  openExplorer,
  openFromList,
  openMenu,
  seedScreens,
  settled,
  visit,
} from "../e2e/flow";
import { replayHar } from "../e2e/replay";
import { defaultRubric } from "../lib/rubric/default";
import type { Rubric } from "../lib/rubric/types";

const OUT = "test-results/screenshots";
const SLUGS = [
  "grayson-mud-creek-6273",
  "macks-mountain-35-3",
  "ferney-creek-52-47A",
  "roan-hwy-143-099-046-02",
] as const satisfies readonly FixtureSlug[];
const MUD = loadFixture(SLUGS[0]).input.name;

/** The starting list with Zach-style budgets, as the interview makes it: rank-sum, Within budget last in Really want. */
const D = defaultRubric();
const BUDGETED: Rubric = {
  ...D,
  weights: { mode: "rankSum" },
  ranked: [...D.ranked, { factor: "budget", tier: "should" }],
  budgets: { camp: 250_000, build: 300_000 },
};

async function liveImagery(context: BrowserContext): Promise<void> {
  await context.route(/basemap\.nationalmap\.gov|arcgisonline\.com/, (r) => r.continue());
}

/** Mud Creek's asking price, and the budgeted list, written as the app keeps them. */
const seedCostState = (page: Page) =>
  page.evaluate(
    ({ name, rubric }) => {
      const kv = window.__psKv!;
      const parcels = JSON.parse(kv.getItem("ps.parcels")!) as {
        built: { name: string; askingPrice: number | null; askingPriceAt: string | null }[];
      };
      for (const p of parcels.built)
        if (p.name === name)
          Object.assign(p, { askingPrice: 185_000, askingPriceAt: "2026-10-11T12:00:00Z" });
      kv.setItem("ps.parcels", JSON.stringify(parcels));
      // "seen": the Driveway row's one-time note (step 7) isn't this step's.
      kv.setItem("ps.rubrics", JSON.stringify({ mine: rubric, others: [], drivewayAdded: "undone" }));
    },
    { name: MUD, rubric: BUDGETED },
  );

/** The phone's sheet, raised until it holds most of the screen (as grade-panel.spec.ts does). */
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

    test("Cost to enjoy: the lines, the breakdown, Favorites, Settings, What matters, One page", async ({
      page,
      context,
    }) => {
      test.setTimeout(300_000);
      await replayHar(context, "ferney-creek-52-47A");
      await liveImagery(context);
      await openExplorer(page, "ferney-creek-52-47A");
      await importParcels(page, SLUGS);
      await seedScreens(page, SLUGS);
      await settled(page);
      await seedCostState(page);
      await visit(page, "/library");

      // Favorites: the Cost to build column (desktop), the facts line (phone).
      await page.getByRole("tab", { name: "Favorites" }).click();
      await expect(
        page
          .getByText(/\$330–595k/)
          .filter({ visible: true })
          .first(),
      ).toBeVisible({
        timeout: 30_000,
      });
      await page.screenshot({ path: `${OUT}/${device}-cost-favorites.png` });

      // The Grade section's two lines, after the answer.
      await openFromList(page, MUD);
      const section = page.getByRole("group", { name: "Cost to enjoy" });
      await expect(section).toBeAttached({ timeout: 30_000 });
      if (phone) await raiseSheet(page);
      await section.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await section.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${device}-cost-lines.png` });

      // The breakdown: camp, then build further down.
      await section.getByRole("button", { name: /^Ready to camp/ }).click();
      const panel = page.locator(".card-panel");
      await expect(panel.getByText("Published ranges, not a quote.")).toBeAttached();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${device}-cost-breakdown.png` });
      await panel.getByRole("region", { name: /^Ready to build/ }).scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${device}-cost-breakdown-build.png` });
      await page.keyboard.press("Escape");

      // Settings → Costs.
      await (await openMenu(page)).getByRole("button", { name: "Settings", exact: true }).click();
      await page
        .getByRole("heading", { name: "Costs", exact: true })
        .evaluate((h) => h.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${device}-cost-settings.png` });
      await page.keyboard.press("Escape");

      // What matters: Within budget, last in Really want.
      await visit(page, "/priorities");
      await page.getByText("Within budget").first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${device}-cost-what-matters.png` });

      // One page: both lines after the grades.
      await visit(page, `/parcel/${await keyOf(page, MUD)}/report?preset=one`);
      await expect(page.locator(".rp-cost")).toBeVisible();
      await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeEnabled({
        timeout: 60_000,
      });
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT}/${device}-cost-one-page.png` });
    });
  });
}
