/**
 * The existing-house mission's deployed check (docs/plans/existing-house.md §5 PR 5, §7): parcel 10-A-10 (Washington Co.,
 * VA) on the step branch's Vercel preview, graded live, then "House already here" placed just up the slope and left of
 * the solar array (Zach's map and photo), desktop (1280 × 800) then phone (375 × 812). Everything is live, so it runs on
 * CI's runners against the deployment (existing-house.yml, playwright.deployed.config.ts). The owner and site address are
 * read live; screenshot mode (fixtures.ts) has the app hide them, and the guard refuses a capture that shows them.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { screenIt } from "../e2e/flow";
import { HOUSE_ASIDE_WORDS } from "../lib/report/adjustWords";

const OUT = "test-results/screenshots/existing-house";
/** The house: about 25 m north-west of the solar array's pin (36.865411, −81.921775), up the slope. */
const HOUSE = { lat: 36.86562, lon: -81.922 };

async function openAt(page: Page, view: { lat: number; lon: number; z: number }): Promise<void> {
  await page.addInitScript((v) => {
    if (sessionStorage.getItem("shots")) return;
    sessionStorage.setItem("shots", "1");
    localStorage.clear();
    // The test handle on the map (window.__psMap), which the taps and the tile wait read.
    localStorage.setItem("ps.debug", "1");
    localStorage.setItem("ps.view", JSON.stringify(v));
  }, view);
  await page.goto("/explore");
}

/** Until the map has drawn every tile in view (or 45 s). */
async function drawn(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () => {
        const m = (window as unknown as { __psMap?: { areTilesLoaded(): boolean; isMoving(): boolean } })
          .__psMap;
        return !!m && !m.isMoving() && m.areTilesLoaded();
      },
      undefined,
      { timeout: 45_000 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(2500);
}

async function tapAt(page: Page, ll: { lat: number; lon: number }): Promise<void> {
  const xy = await page.evaluate(
    ({ lat, lon }) =>
      (
        window as unknown as { __psMap: { project(ll: [number, number]): { x: number; y: number } } }
      ).__psMap.project([lon, lat]),
    ll,
  );
  const box = (await page.locator(".maplibregl-canvas").boundingBox())!;
  await page.mouse.click(box.x + xy.x, box.y + xy.y);
}

/** The card's answer and rows, for the job's log (the before and the after). */
const cardText = (page: Page) => page.locator(".card").first().innerText();

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(device, () => {
    test.use(
      phone
        ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );
    const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${device}-${name}.png` });

    test("10-A-10 graded, then with House already here", async ({ page }) => {
      test.setTimeout(900_000);
      await openAt(page, { ...HOUSE, z: 16 });
      await drawn(page);
      await tapAt(page, HOUSE);
      await expect(page.getByRole("button", { name: /acres: parcel details$/ })).toBeVisible({
        timeout: 60_000,
      });
      await page.getByRole("tab", { name: "Grade" }).click();
      const steps = await screenIt(page);
      console.log(`10-A-10, graded: ${JSON.stringify(steps)}`);
      await page.waitForTimeout(1500);
      console.log(`BEFORE (${device}):\n${await cardText(page)}`);
      await shot(page, "before");

      // + Mark › On the land › House already here, then one tap on the house.
      await page.locator(".toolbar").getByRole("button", { name: "+ Mark", exact: true }).click();
      await page
        .getByRole("group", { name: "On the land" })
        .getByRole("button", { name: "House already here" })
        .click();
      await tapAt(page, HOUSE);
      // The answer line: "2 set aside: a house is already here." (the default rubric leaves Driveway Don't care).
      await expect(page.locator(".card").first()).toContainText(HOUSE_ASIDE_WORDS, { timeout: 120_000 });
      await page.getByRole("tab", { name: "Grade" }).click();
      await page.waitForTimeout(1500);
      console.log(`AFTER (${device}):\n${await cardText(page)}`);
      await shot(page, "after");
      // The set-aside rows, with what to check instead.
      const aside = page.locator(".card-row.set-aside").first();
      await expect(aside).toContainText(HOUSE_ASIDE_WORDS);
      await aside.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await shot(page, "after-set-aside");
    });
  });
}
