/**
 * 8c's screenshots, desktop (1280 × 800) then phone (375 × 812): Recent; the header on a parcel off the list ("Add to
 * list", and the collapse ‹ on a desktop); on one on the list ("★ On your list"); × on one off the list ("Closed.
 * Undo"). One profile; three fixture parcels, none on the list to start.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { importParcels, openExplorer, seedScreens, visit } from "../e2e/flow";
import { YOUR_LIST } from "../e2e/household";

const FERNEY = "ferney-creek-52-47A" as const;
const MACKS = "macks-mountain-35-3" as const;
const MUD = "grayson-mud-creek-6273" as const;
const OUT = "test-results/screenshots";

/** Every parcel graded by this profile an hour apart, as Recent's dates show it. */
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
    const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${device}-8c-${name}.png` });
    const openFromRecent = async (page: Page, name: string) => {
      await page.getByRole("link", { name: YOUR_LIST }).click();
      await page.getByRole("tab", { name: "Recent" }).click();
      await page
        .locator(".hist-row", { hasText: name })
        .getByRole("link", { name: "Open on the map" })
        .click();
      await expect(page).toHaveURL(/\/explore$/);
      await expect(page.locator(".sh-name").first()).toContainText(name);
    };

    test("Recent, Add to list, On your list, × and its Undo", async ({ browser }) => {
      test.setTimeout(300_000);
      const page = await newPage(browser);
      await openExplorer(page, FERNEY);
      await importParcels(page, [FERNEY, MACKS, MUD], { star: false });
      await seedScreens(page, [FERNEY, MACKS, MUD]);
      await seedGraded(page);
      await visit(page, "/library");

      // Recent: the three, newest first, each with Add to list and ✕.
      await page.getByRole("link", { name: YOUR_LIST }).click();
      await page.getByRole("tab", { name: "Recent" }).click();
      await expect(page.locator(".hist-row")).toHaveCount(3);
      await shot(page, "1-recent");

      // Mud Creek off the list: Add to list in the header (and the ‹ on a desktop).
      await openFromRecent(page, "6273");
      // The tilt tip (desktop) would cover the map in every shot (fresh-eyes review, step 8).
      const tip = page.locator(".tilt-hint").getByRole("button", { name: "Dismiss" });
      if (await tip.isVisible()) await tip.click();
      const actions = page.locator(".sh-acts");
      await expect(actions.getByRole("button", { name: "Add to list" })).toBeVisible();
      await shot(page, "2-header-add");

      // Added: ★ On your list.
      await actions.getByRole("button", { name: "Add to list" }).click();
      await page.getByRole("dialog", { name: "Add to list" }).getByRole("button", { name: "Add" }).click();
      await expect(actions.getByRole("button", { name: "On your list" })).toBeVisible();
      await shot(page, "3-header-on-list");

      // Macks, off the list: × closes it and clears it from the map; it stays in Recent (J-2, UX part 2).
      await openFromRecent(page, "35-3");
      await page.waitForTimeout(3000); // the map's flight to Macks, from Grayson County
      await page.getByRole("button", { name: "Close this parcel" }).first().click();
      await expect(page.locator(".sh-name")).toHaveCount(0);
      await shot(page, "4-closed");
    });
  });
}
