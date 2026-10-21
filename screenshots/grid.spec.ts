/**
 * Step 10b's screenshots (plan §12): the Favorites grid at 1280 × 800 and 1920 × 1080, the phone's cards at 375 × 812,
 * with the four fixtures. Mud Creek has its $185k listing price (and 30.1 listed acres, so its $/ac is marked ≠), Ferney
 * $160k; the list has a walk-away limit on Elevation, as Zach's real one does, so its column reads "✓A".
 * Run by `pnpm screenshots`.
 */
import { expect, test, type Page } from "@playwright/test";
import { loadFixture, type FixtureSlug } from "../test/support/fixtures";
import { importParcels, openExplorer, seedScreens, settled, visit } from "../e2e/flow";
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

const D = defaultRubric();
/** The starting list with a limit on Elevation, as the interview's walk-away chip makes it. */
const WITH_LIMIT: Rubric = { ...D, musts: [...D.musts, { factor: "elevation", threshold: 1_800 }] };

const seed = (page: Page) =>
  page.evaluate(
    ({ mud, ferney, rubric }) => {
      const kv = window.__psKv!;
      const parcels = JSON.parse(kv.getItem("ps.parcels")!) as {
        built: {
          name: string;
          askingPrice: number | null;
          askingPriceAt: string | null;
          listingAcres: number | null;
        }[];
      };
      for (const p of parcels.built) {
        if (p.name === mud)
          Object.assign(p, {
            askingPrice: 185_000,
            askingPriceAt: "2026-10-11T12:00:00Z",
            listingAcres: 30.1,
          });
        if (p.name === ferney)
          Object.assign(p, { askingPrice: 160_000, askingPriceAt: "2026-10-12T12:00:00Z" });
      }
      kv.setItem("ps.parcels", JSON.stringify(parcels));
      kv.setItem("ps.rubrics", JSON.stringify({ mine: rubric, others: [], drivewayAdded: "undone" }));
    },
    { mud: loadFixture(SLUGS[0]).input.name, ferney: loadFixture(SLUGS[2]).input.name, rubric: WITH_LIMIT },
  );

const VIEWS = [
  { device: "desktop", viewport: { width: 1280, height: 800 } },
  { device: "wide", viewport: { width: 1920, height: 1080 } },
  { device: "phone", viewport: { width: 375, height: 812 } },
] as const;

for (const v of VIEWS) {
  test.describe(v.device, () => {
    test.use(
      v.device === "phone"
        ? { viewport: v.viewport, isMobile: true, hasTouch: true }
        : { viewport: v.viewport },
    );

    test("the grid, a header sort, Columns ▾", async ({ page, context }) => {
      test.setTimeout(240_000);
      await replayHar(context, "ferney-creek-52-47A");
      await openExplorer(page, "ferney-creek-52-47A");
      await importParcels(page, SLUGS);
      await seedScreens(page, SLUGS);
      await settled(page);
      await seed(page);
      await visit(page, "/library");
      await page.getByRole("tab", { name: "Favorites" }).click();
      await expect(
        page
          .getByText(/\$6,150\/ac/)
          .filter({ visible: true })
          .first(),
      ).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${v.device}-grid.png` });
      if (v.device === "phone") return;
      // A header sort: by Night sky, best first.
      await page.locator(".lib-grid").getByRole("button", { name: /^Sky/ }).click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${v.device}-grid-sorted.png` });
      // Columns ▾, open.
      await page.getByRole("button", { name: "Columns ▾" }).click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${v.device}-grid-columns.png` });
    });
  });
}
