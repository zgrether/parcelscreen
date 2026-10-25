/**
 * Step 4c's screenshots (plan §12), desktop (1280 × 800) then phone (375 × 667): the map with no parcel; Mud Creek opened
 * (Grade this parcel); a run in progress; Mud Creek graded (its recording lacks FEMA, PAD-US and OSRM: "Try again: 3
 * sources didn't load"); the log opened; a setting changed (the count joins the line); and the panel collapsed on a
 * desktop, the sheet at its peek and at 46% on a phone. Run by `pnpm screenshots`; no facts card is opened, so no
 * owner shows.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { importParcel, openExplorer, openMenu } from "../e2e/flow";
import { replayHar } from "../e2e/replay";

const MUD = "grayson-mud-creek-6273" as const;
const OUT = "test-results/screenshots";

/** The state aerial and the terrain tiles, live (the replay aborts tiles). Registered last. */
async function liveImagery(context: BrowserContext): Promise<void> {
  await context.route(
    /VBMP_Imagery|Orthoimagery_Latest|basemap\.nationalmap\.gov|elevation-tiles-prod/,
    (r) => r.continue(),
  );
}

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(device, () => {
    test.use(
      phone
        ? { viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );
    const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${device}-4c-${name}.png` });

    test("the panel or the sheet, the grade button's states and the log", async ({ page, context }) => {
      test.setTimeout(400_000);
      await replayHar(context, [MUD]);
      await liveImagery(context);
      await openExplorer(page, MUD);
      await page.waitForTimeout(3000);
      await shot(page, "1-no-parcel");
      // Zoomed out to about z11: "Zoom in to see parcel lines" (the zoom slider's amber band went).
      await page.evaluate(() =>
        (window as { __psMap?: { jumpTo(o: object): void } }).__psMap?.jumpTo({ zoom: 11 }),
      );
      await expect(page.locator(".map-hint")).toHaveText("Zoom in to see parcel lines");
      await page.waitForTimeout(2500);
      await shot(page, "0-zoomed-out");
      await page.evaluate(() =>
        (window as { __psMap?: { jumpTo(o: object): void } }).__psMap?.jumpTo({ zoom: 15 }),
      );
      await page.waitForTimeout(1500);

      await importParcel(page, MUD);
      await page.waitForTimeout(2000);
      await shot(page, "2-opened");

      // On a phone the sheet's own button, which turns into the progress bar while the grade runs (UX part 2 PR 3b).
      const grade = page.locator(phone ? ".explore-panel .grade-btn" : ".grade-btn");
      await grade.click();
      if (phone) await expect(page.locator(".grade-progress-text")).toBeVisible();
      else await expect(grade).toHaveText("Grading…");
      await page.waitForTimeout(1200);
      await shot(page, "3-grading");
      await expect(grade).toHaveText("Try again: 3 sources didn't load", { timeout: 200_000 });
      await page.waitForTimeout(2500);
      await shot(page, "4-graded");

      if (phone) {
        const handle = page.locator(".sheet-handle");
        await handle.tap();
        await handle.tap();
        await page.waitForTimeout(500);
        await shot(page, "5-peek");
        await handle.tap();
        await page.waitForTimeout(500);
      }

      // The log opened.
      await page.locator(".steps-folded").click();
      await page.locator("ul.steps").scrollIntoViewIfNeeded();
      await shot(page, "6-log-open");

      // A setting changed: "Grade again: house site score changed", and the count on the line (a fresh load folds the log).
      await (await openMenu(page)).getByRole("button", { name: "Settings", exact: true }).click();
      const field = page.locator(".settings-grid input").first();
      await field.fill(String(Number(await field.inputValue()) + 1));
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(grade).toHaveText("Grade again: house site score changed");
      await page.waitForTimeout(500);
      await shot(page, "7-reason");

      if (!phone) {
        await page.getByRole("button", { name: "Collapse the panel" }).click();
        await page.waitForTimeout(800);
        await shot(page, "8-collapsed");
      }
    });
  });
}
