/**
 * Your list's polish (owner, 2026-10-20), desktop (1280 × 800) then phone (375 × 812): Ferney and Macks starred, with no
 * price or status yet (#12: those columns hide); a row's ⋯ menu (#16: Remove from favorites); a row's detail beside the
 * table (#15). The takes' comments and New takes (#13, #14) are household.spec.ts's "8-list-with-take". Run by
 * `pnpm screenshots`.
 */
import { expect, test, type Page } from "@playwright/test";
import { importParcels, openExplorer, seedScreens, visit } from "../e2e/flow";
import { replayHar } from "../e2e/replay";

const FERNEY = "ferney-creek-52-47A" as const;
const MACKS = "macks-mountain-35-3" as const;
const OUT = "test-results/screenshots";

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(device, () => {
    test.use(
      phone
        ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );
    const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${device}-list-${name}.png` });

    test("Your list: the columns, the ⋯ menu, the detail beside the table", async ({ page, context }) => {
      test.setTimeout(180_000);
      await replayHar(context, [FERNEY, MACKS]);
      await openExplorer(page, FERNEY);
      await importParcels(page, [FERNEY, MACKS]);
      await seedScreens(page, [FERNEY, MACKS]);
      await visit(page, "/library");
      const rows = page.locator(".lib-row:visible");
      await expect(rows).toHaveCount(2);
      await shot(page, "1-list");

      await rows
        .first()
        .getByRole("button", { name: /^More for / })
        .click();
      await expect(page.getByRole("menu")).toBeVisible();
      await shot(page, "2-menu");
      await page.keyboard.press("Escape");

      await rows.first().locator(".lib-open").click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.waitForTimeout(400);
      await shot(page, "3-detail");
    });
  });
}
