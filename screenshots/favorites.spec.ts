/**
 * Step 8's screenshots (plan §10), desktop (1280 × 800) then phone (375 × 812): Favorites; History; the star and its
 * name sheet; the panel's star filled; unstarring; Clear history; ✕'s Undo; Search showing saved parcels. The phone's
 * tab is in its Favorites and History shots. One profile; three fixture parcels, two of them starred.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { importParcels, openExplorer, openSearch, seedScreens, starFromHistory, visit } from "../e2e/flow";
import { YOUR_LIST } from "../e2e/household";

const FERNEY = "ferney-creek-52-47A" as const;
const MACKS = "macks-mountain-35-3" as const;
const MUD = "grayson-mud-creek-6273" as const;
const OUT = "test-results/screenshots";

/** Every parcel graded by this profile a few minutes apart, as History's dates show it. */
const seedGraded = (page: Page) =>
  page.evaluate(async () => {
    const kv = window.__psKv!;
    const built = (JSON.parse(kv.getItem("ps.parcels")!) as { built: { key: string }[] }).built;
    const t = Date.now();
    const graded = Object.fromEntries(
      built.map((b, i) => [b.key, new Date(t - i * 3_600_000).toISOString()]),
    );
    await kv.setItem("ps.history", JSON.stringify({ v: 1, graded }));
  });

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(device, () => {
    const viewport = phone ? { width: 375, height: 812 } : { width: 1280, height: 800 };
    const newPage = async (browser: Browser) =>
      (
        await browser.newContext(phone ? { viewport, isMobile: true, hasTouch: true } : { viewport })
      ).newPage();
    const shot = (page: Page, name: string) =>
      page.screenshot({ path: `${OUT}/${device}-favorites-${name}.png` });
    const tab = (page: Page, name: "Favorites" | "History") => page.getByRole("tab", { name });

    test("Favorites, History, the star, unstarring, Clear history, Undo, Search", async ({ browser }) => {
      test.setTimeout(300_000);
      const page = await newPage(browser);
      await openExplorer(page, FERNEY);
      await importParcels(page, [FERNEY, MACKS, MUD], { star: false });
      await seedScreens(page, [FERNEY, MACKS, MUD]);
      await seedGraded(page);
      await visit(page, "/library");
      await starFromHistory(page, "52-47A");
      await starFromHistory(page, "35-3");

      // Favorites, then History (the phone's switch at the top of each).
      await page.getByRole("link", { name: YOUR_LIST }).click();
      await tab(page, "Favorites").click();
      await expect(page.locator(".lib-row:visible")).toHaveCount(2);
      await shot(page, "1-favorites");
      await tab(page, "History").click();
      await expect(page.locator(".hist-row")).toHaveCount(3);
      await shot(page, "2-history");

      // ✕ on Mud Creek, and its Undo.
      await page.getByRole("button", { name: /^Remove from History: .*6273/ }).click();
      await expect(page.locator(".hist-toast")).toBeVisible();
      await shot(page, "3-removed-undo");
      await page.locator(".hist-toast").getByRole("button", { name: "Undo" }).click();
      await expect(page.locator(".hist-row")).toHaveCount(3);

      // Clear history's confirm.
      await page.getByRole("button", { name: "Clear history" }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await shot(page, "4-clear-history");
      await page.getByRole("alertdialog").getByRole("button", { name: "Keep" }).click();

      // The panel's star on Mud Creek: its name sheet, then filled.
      await page
        .locator(".hist-row", { hasText: "6273" })
        .getByRole("link", { name: "Open on the map" })
        .click();
      await expect(page).toHaveURL(/\/explore$/);
      // The tilt tip (desktop) would cover the map in every shot (fresh-eyes review).
      const tip = page.locator(".tilt-hint").getByRole("button", { name: "Dismiss" });
      if (await tip.isVisible()) await tip.click();
      const star = page.locator(".sh-actions").getByRole("button", { name: "Add to favorites" });
      await star.click();
      await expect(page.getByRole("dialog", { name: "Add to favorites" })).toBeVisible();
      await shot(page, "5-name-sheet");
      await page
        .getByRole("dialog", { name: "Add to favorites" })
        .getByRole("button", { name: "Add" })
        .click();
      await expect(page.locator(".sh-actions").getByRole("button", { name: "In favorites" })).toBeVisible();
      await shot(page, "6-panel-starred");

      // Unstarring asks once.
      await page.locator(".sh-actions").getByRole("button", { name: "In favorites" }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await shot(page, "7-unstar");
      await page.getByRole("alertdialog").getByRole("button", { name: "Keep" }).click();

      // Search shows the saved parcels above the places.
      if (phone) await page.locator(".sh-x").click();
      await (await openSearch(page)).fill("parcel");
      await expect(page.getByRole("group", { name: "Favorites" })).toBeVisible();
      await shot(page, "8-search");
    });
  });
}
