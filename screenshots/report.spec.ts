/**
 * Step 9's screenshots (plan §12, PR 4): the report card export for Mud Creek and Roan, One page and Full, as rendered
 * (desktop 1280 × 800, and a phone at 375) and as printed (Chromium's PDF of the page, saved beside the shots). The
 * aerial tiles load live (the replay aborts tiles). Run by `pnpm screenshots`.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { loadFixture, type FixtureSlug } from "../test/support/fixtures";
import { importParcels, openExplorer, seedScreens, settled, visit } from "../e2e/flow";
import { replayHar } from "../e2e/replay";

const OUT = "test-results/screenshots";
const SLUGS = ["grayson-mud-creek-6273", "roan-hwy-143-099-046-02"] as const satisfies readonly FixtureSlug[];
const SHORT: Record<(typeof SLUGS)[number], string> = {
  "grayson-mud-creek-6273": "mud",
  "roan-hwy-143-099-046-02": "roan",
};

/** The imagery's tiles, live (the replay aborts tiles). Registered last. */
async function liveImagery(context: BrowserContext): Promise<void> {
  await context.route(/basemap\.nationalmap\.gov|arcgisonline\.com/, (r) => r.continue());
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

    test("One page and Full, as rendered and as printed", async ({ page, context }) => {
      test.setTimeout(240_000);
      await replayHar(context, "ferney-creek-52-47A");
      await liveImagery(context);
      await openExplorer(page, "ferney-creek-52-47A");
      await importParcels(page, SLUGS);
      await seedScreens(page, SLUGS);
      await settled(page);
      for (const slug of SLUGS) {
        const name = loadFixture(slug).input.name;
        const key = await keyOf(page, name);
        for (const preset of ["one", "full"] as const) {
          await visit(page, `/parcel/${key}/report?preset=${preset}`);
          await expect(page.locator(".rp-sheet h1")).toHaveText(name);
          await page.waitForTimeout(2500);
          const base = `${OUT}/${device}-report-${SHORT[slug]}-${preset}`;
          await page.screenshot({ path: `${base}.png` });
          if (!phone) {
            await page.screenshot({ path: `${base}-whole.png`, fullPage: true });
            writeFileSync(`${base}.pdf`, await page.pdf({ preferCSSPageSize: true, printBackground: true }));
          }
        }
      }
    });
  });
}
