/**
 * UX part 2 PR 3b (Zach's Z-9), on a phone (375 × 667): a grade running shows a slim progress bar under the header, in
 * the peek, with the step and its count; Steps ▸ raises the sheet to the step list. Run by `pnpm screenshots`.
 */
import { expect, test } from "./fixtures";
import { importParcel, openExplorer } from "../e2e/flow";
import { replayHar } from "../e2e/replay";

const MUD = "grayson-mud-creek-6273" as const;
const OUT = "test-results/screenshots";

test.use({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });

test("the grade's progress bar, then its step list", async ({ page, context }) => {
  test.setTimeout(240_000);
  await replayHar(context, MUD);
  await openExplorer(page, MUD);
  await importParcel(page, MUD);
  const sheet = page.locator(".explore-panel");
  await sheet.locator(".grade-btn").click();
  // A step or two along, so the bar shows some progress.
  await expect(sheet.locator(".grade-progress-text")).toHaveText(/… ([3-9]|1[01]) of 11$/, {
    timeout: 60_000,
  });
  await page.screenshot({ path: `${OUT}/phone-progress-1-peek.png` });
  await sheet.locator(".grade-progress-line").tap();
  await expect(sheet.locator(".steps")).toBeInViewport();
  await page.screenshot({ path: `${OUT}/phone-progress-2-steps.png` });
});
