/**
 * Tennessee (roadmap step 2; docs/plans/step-2-tennessee.md §6.4, §7.3). Over one of the nine counties that keep their
 * own assessment systems the map says there are no state lines and offers Draw. The parcel services answer the replay
 * with empty collections there (e2e/replay.ts). PR 5 adds the Roan Mountain fixture's tests here.
 */
import { expect, test } from "@playwright/test";
import { OWN_RECORDS_HINT } from "@/lib/geo/ownRecords";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A" as const;
/** Downtown Knoxville, Knox County. */
const KNOXVILLE = { lat: 35.9606, lon: -83.9207, z: 15 };

let errors: string[] = [];
test.beforeEach(({ page }) => {
  errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
});

async function openAt(page: import("@playwright/test").Page, view: typeof KNOXVILLE): Promise<void> {
  await page.addInitScript((v) => {
    if (sessionStorage.getItem("e2e")) return;
    sessionStorage.setItem("e2e", "1");
    localStorage.clear();
    localStorage.setItem("ps.debug", "1");
    localStorage.setItem("ps.roads", "0");
    localStorage.setItem("ps.view", JSON.stringify(v));
  }, view);
  await page.goto("/explore");
}

for (const phone of [false, true]) {
  test.describe(phone ? "on a phone" : "on a desktop", () => {
    if (phone) test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

    test("over Knox County: the no-lines hint with a Draw button that starts drawing", async ({
      page,
      context,
    }) => {
      await replayHar(context, FERNEY);
      await openAt(page, KNOXVILLE);
      const hint = page.locator(".map-hint");
      await expect(hint).toContainText(OWN_RECORDS_HINT, { timeout: 30_000 });
      const draw = hint.getByRole("button", { name: "Draw" });
      const box = (await draw.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      // Nothing scrolls sideways.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await draw.click();
      await expect(page.getByText(/Tap each corner/)).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}
