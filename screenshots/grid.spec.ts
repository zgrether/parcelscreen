/**
 * Step 10b's screenshots (plan §12): the Favorites grid at 1280 × 800 and 1920 × 1080, the phone's cards at 375 × 812,
 * with the four fixtures. Mud Creek has its $185k listing price (and 32 listed acres, so its $/ac is marked ≠), Ferney
 * $160k; the list has a walk-away limit on Elevation, as Zach's real one does, so its column reads "✓A".
 * Run by `pnpm screenshots`.
 */
import { expect, test, type Page } from "@playwright/test";
import { loadFixture, type FixtureSlug } from "../test/support/fixtures";
import { importParcels, openExplorer, openFromList, seedScreens, settled, visit } from "../e2e/flow";
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
            listingAcres: 32,
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
      await page.getByRole("tab", { name: "Shortlist" }).click();
      await expect(
        page
          .getByText(/\$5,780\/ac/)
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

    // The other changed screens, at 1280 and 375: the panel's merged Must row, Compare's $/ac, One page, Recent.
    if (v.device !== "wide")
      test("the merged Must row, Compare, One page, Recent", async ({ page, context }) => {
        test.setTimeout(240_000);
        await replayHar(context, "ferney-creek-52-47A");
        // The imagery's tiles, live (the replay aborts tiles), for One page's map.
        await context.route(/basemap\.nationalmap\.gov|arcgisonline\.com/, (r) => r.continue());
        await openExplorer(page, "ferney-creek-52-47A");
        await importParcels(page, SLUGS);
        await seedScreens(page, SLUGS);
        await settled(page);
        await seed(page);
        const mud = loadFixture(SLUGS[0]).input.name;
        const ferney = loadFixture(SLUGS[2]).input.name;

        // The panel: Elevation once, in Must have, with its letter.
        await visit(page, "/library");
        await openFromList(page, mud);
        const musts = page.getByRole("group", { name: "Must have" });
        await expect(musts).toBeAttached({ timeout: 30_000 });
        if (v.device === "phone") await raiseSheet(page);
        await musts.evaluate((el) => el.scrollIntoView({ block: "center" }));
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${OUT}/${v.device}-panel-musts.png` });

        // Compare: $/ac after the asking price.
        await visit(page, "/library");
        await page.getByRole("tab", { name: "Shortlist" }).click();
        for (const n of [mud, ferney])
          await page.getByLabel(`Compare ${n}`).filter({ visible: true }).check();
        await page.getByRole("button", { name: "Compare 2" }).click();
        await expect(page).toHaveURL(/\/compare$/);
        await page
          .getByRole("rowheader", { name: "$/ac" })
          .evaluate((el) => el.scrollIntoView({ block: "center" }));
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${OUT}/${v.device}-compare.png` });

        // One page: $/ac after the price.
        const key = await page.evaluate(
          (n) =>
            (
              JSON.parse(window.__psKv!.getItem("ps.parcels")!) as { built: { name: string; key: string }[] }
            ).built.find((b) => b.name === n)!.key,
          mud,
        );
        await visit(page, `/parcel/${key}/report?preset=one`);
        await expect(page.locator(".rp-facts")).toContainText("/ac");
        await page.waitForTimeout(800);
        await page.screenshot({ path: `${OUT}/${v.device}-one-page.png` });

        // Recent: Ferney off the list, with its $/ac and the verdict word beside the letter.
        await visit(page, "/library");
        await page.getByRole("tab", { name: "Shortlist" }).click();
        await page
          .getByRole("button", { name: `On your list: ${ferney}` })
          .filter({ visible: true })
          .first()
          .click();
        await page.getByRole("alertdialog").getByRole("button", { name: "Remove from Your list" }).click();
        await page.getByRole("tab", { name: "Recent" }).click();
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${OUT}/${v.device}-recent.png` });
      });
  });
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
