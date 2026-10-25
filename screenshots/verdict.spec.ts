/**
 * The verdict's word (polish #11, owner 2026-10-20: "Pass" → "Not for us"), desktop (1280 × 800) then phone
 * (375 × 812): Mud Creek with a Must it fails (elevation at least 5,000 ft), so it reads as the third verdict, on its
 * card, in the header, on Your list and in Compare; the list's verdict filter; Help's grade rules.
 */
import { expect, test, type Page } from "@playwright/test";
import { ZACH } from "../test/support/rubrics";
import { booted, importParcel, openExplorer, seedScreens } from "../e2e/flow";
import { replayHar } from "../e2e/replay";

const GRAYSON = "grayson-mud-creek-6273" as const;
const OUT = "test-results/screenshots";

/** The starting list with one more Must: at least 5,000 ft, which Mud Creek (3,543 ft) fails. */
const STRICT = { ...ZACH.rubric, musts: [...ZACH.rubric.musts, { factor: "elevation", threshold: 5000 }] };

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(device, () => {
    test.use(
      phone
        ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );
    const shot = (page: Page, name: string) =>
      page.screenshot({ path: `${OUT}/${device}-verdict-${name}.png` });

    test("Not for us: the card, Your list, its filter, Compare and Help", async ({ page, context }) => {
      test.setTimeout(240_000);
      await replayHar(context, GRAYSON);
      await openExplorer(page, GRAYSON);
      await importParcel(page, GRAYSON);
      await seedScreens(page, [GRAYSON]);
      await page.evaluate(
        (r) => window.__psKv!.setItem("ps.rubrics", JSON.stringify({ mine: r, others: [] })),
        STRICT,
      );
      await page.goto("/library");
      await booted(page);

      // Your list: the default view hides this verdict, and says so; Show all; then the verdict filter's chips.
      await page.getByRole("button", { name: "Show all" }).click();
      await expect(page.locator(".lib-row:visible").first()).toBeVisible();
      await shot(page, "1-list");
      await page.getByRole("button", { name: /^Filters/ }).click();
      await shot(page, "2-filters");
      await page.getByRole("button", { name: /^Filters/ }).click();

      // The card, on the map's one panel (Z-2, UX part 2: the list's own detail went): its answer and reason.
      await page.locator(".lib-row:visible").first().click();
      await expect(page.locator(".sh-name").first()).toBeVisible();
      await shot(page, "3-detail-card");

      // Help: the grade rules and the breakdown's lines.
      await page.goto("/help");
      await booted(page);
      await page.waitForTimeout(800);
      await shot(page, "4-help");
    });
  });
}
