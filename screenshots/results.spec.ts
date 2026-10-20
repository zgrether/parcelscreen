/**
 * Step 7's screenshots (plan §10), desktop (1280 × 800) then phone (375 × 812), for Mud Creek, Ferney and Roan: the
 * answer and Best homesite; the alternatives and N more spots; the card in priority order; Still unknown; Full report
 * open; and, on a phone, the sheet at its peek. Run by `pnpm screenshots`; no facts card is opened, so no owner shows.
 */
import { expect, test, type BrowserContext, type Locator } from "@playwright/test";
import { importParcel, openExplorer, screenIt } from "../e2e/flow";
import { replayHar } from "../e2e/replay";
import type { FixtureSlug } from "../test/support/fixtures";

const OUT = "test-results/screenshots";
const PARCELS: readonly { slug: FixtureSlug; name: string }[] = [
  { slug: "grayson-mud-creek-6273", name: "mud-creek" },
  { slug: "ferney-creek-52-47A", name: "ferney" },
  { slug: "roan-hwy-143-099-046-02", name: "roan" },
];

/** The state aerial and the terrain tiles, live (the replay aborts tiles). Registered last. */
async function liveImagery(context: BrowserContext): Promise<void> {
  await context.route(
    /VBMP_Imagery|Orthoimagery_Latest|basemap\.nationalmap\.gov|elevation-tiles-prod/,
    (r) => r.continue(),
  );
}

/** Scrolls the panel so `el` is at its top. */
async function toTop(el: Locator): Promise<void> {
  await el.evaluate((n) => n.scrollIntoView({ block: "start" }));
  await el.page().waitForTimeout(400);
}

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(device, () => {
    test.use(
      phone
        ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );
    for (const { slug, name } of PARCELS)
      test(`${name}: the answer, Best homesite, the card, Still unknown, Full report`, async ({
        page,
        context,
      }) => {
        test.setTimeout(400_000);
        const shot = (what: string) => page.screenshot({ path: `${OUT}/${device}-7-${name}-${what}.png` });
        await replayHar(context, slug);
        await liveImagery(context);
        await openExplorer(page, slug);
        await importParcel(page, slug);
        await screenIt(page);
        await page.waitForTimeout(2500);
        if (phone) {
          // The sheet rises after a run: back down to its peek first, for the peek's shot.
          const handle = page.locator(".sheet-handle");
          await handle.tap();
          await handle.tap();
          await page.waitForTimeout(600);
          await shot("0-peek");
          await handle.tap();
          await handle.tap();
          await page.waitForTimeout(600);
        }
        await toTop(page.locator(".card-answer"));
        await shot("1-answer");
        const more = page.locator(".more-spots-toggle");
        if (await more.count()) {
          await more.click();
          await toTop(page.locator(".best-site"));
          await shot("2-spots");
        }
        await toTop(page.locator(".card-group").first());
        await shot("3-card");
        await toTop(page.locator(".ask-agent"));
        await shot("4-still-unknown");
        await page.locator(".full-report-toggle").click();
        await expect(page.locator(".full-report-body")).toBeVisible();
        await toTop(page.locator(".full-report"));
        await shot("5-full-report");
      });
  });
}
