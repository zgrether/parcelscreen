/**
 * Step 6's screenshots (plan §15), desktop (1280 × 800) then phone (375 × 812): Who's this?; a member without
 * priorities; the list with two grades; How Sam would rate it; Ask; Waiting for you with its badge; answering a
 * take; and Zach's list with her take, new (step 6b: the dot and the badge; the waiting row shows the ask's note). Two browser contexts are the two people's devices, over the memory store. The
 * names are "Alex" (the first device's profile, renamed) and "Sam", not the owners'; the code is a throwaway one.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { PASSWORD_LEAD, START, SYNC_TITLE } from "@/lib/sync/words";
import { JULIE, ZACH } from "../test/support/rubrics";
import {
  booted,
  importParcels,
  listRow,
  openExplorer,
  openMenu,
  openYourData,
  seedScreens,
} from "../e2e/flow";

/** The Your list tab, whose name gains the badge's label ("Your list 1 new take") when something waits (step 6b). */
const YOUR_LIST = /^Your list/;
const FERNEY = "ferney-creek-52-47A" as const;
const MACKS = "macks-mountain-35-3" as const;
const MUD = "grayson-mud-creek-6273" as const;
const OUT = "test-results/screenshots";

const setPriorities = (page: Page, rubric: unknown) =>
  page.evaluate((r) => window.__psKv!.setItem("ps.rubrics", JSON.stringify({ mine: r, others: [] })), rubric);

async function startSyncing(page: Page): Promise<string> {
  await openYourData(page);
  await page.getByRole("button", { name: SYNC_TITLE, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: SYNC_TITLE });
  await dialog.getByRole("button", { name: START }).click();
  await expect(dialog.getByText(PASSWORD_LEAD)).toBeVisible({ timeout: 30_000 });
  const code = (await dialog.locator(".sync-code-value").innerText()).replace(/[-\s]/g, "");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  return code;
}

/** Renames the device's first profile (Profile 1) through the menu's picker. */
async function rename(page: Page, from: string, to: string): Promise<void> {
  await openMenu(page);
  const list = page.locator(".menu-profile .profile-pop");
  if (!(await list.count()))
    await page.locator(".menu-profile").getByRole("button", { name: "Switch profile" }).click();
  await list.locator("li", { hasText: from }).getByRole("button", { name: "Rename" }).click();
  await list.getByLabel(`New name for ${from}`).fill(to);
  await list.getByRole("button", { name: "Save" }).click();
  await expect(list.locator("li", { hasText: to })).toBeVisible();
  await page.keyboard.press("Escape");
}

async function afterTabSwitch(page: Page, check: () => Promise<void>): Promise<void> {
  await expect(async () => {
    // On a phone the parcel's sheet covers the tabs: close it before the next try.
    const close = page.getByRole("dialog").getByRole("button", { name: "Close" });
    if (await close.isVisible()) await close.click();
    await page.getByRole("link", { name: "Map", exact: true }).click();
    await page.getByRole("link", { name: YOUR_LIST }).click();
    await check();
  }).toPass({ timeout: 30_000 });
}

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(device, () => {
    const viewport = phone ? { width: 375, height: 812 } : { width: 1280, height: 800 };
    const newPage = async (browser: Browser) =>
      (
        await browser.newContext(phone ? { viewport, isMobile: true, hasTouch: true } : { viewport })
      ).newPage();
    const shot = (page: Page, name: string) =>
      page.screenshot({ path: `${OUT}/${device}-household-${name}.png` });
    const open = async (page: Page, name: string) => {
      const row = listRow(page, name);
      if (phone) await row.locator(".lib-card-facts").tap();
      else await row.locator(".lib-open").click();
      await expect(page.getByRole("dialog")).toBeVisible();
    };
    const scrollTo = (page: Page, region: string) =>
      page.getByRole("region", { name: region }).scrollIntoViewIfNeeded();

    test("the household: who's this, everyone's grade, How Sam would rate it, ask and answer", async ({
      browser,
    }) => {
      test.setTimeout(300_000);
      const zach = await newPage(browser);
      await openExplorer(zach, FERNEY);
      await importParcels(zach, [FERNEY, MACKS, MUD]);
      await seedScreens(zach, [FERNEY, MACKS, MUD]);
      await setPriorities(zach, ZACH.rubric);
      await rename(zach, "Profile 1", "Alex");
      const code = await startSyncing(zach);

      const julie = await newPage(browser);
      await openExplorer(julie, FERNEY);
      await julie.goto(`/link#${code}`);
      await julie.getByRole("button", { name: /^Join$/ }).click();
      await expect(julie.getByRole("heading", { name: "Who's this?" })).toBeVisible();
      await shot(julie, "1-who");
      await julie.getByRole("button", { name: "I'm new here" }).click();
      await julie.waitForURL("**/interview");
      await julie.getByPlaceholder("Your name or a nickname").fill("Sam");
      await julie.getByRole("button", { name: "Continue" }).click();
      await julie.getByRole("button", { name: "Not now" }).click();
      await booted(julie);

      // Zach: Sam without priorities.
      await afterTabSwitch(zach, async () => {
        await open(zach, "52-47A");
        await expect(zach.getByText("Sam hasn't said what matters to them yet.")).toBeVisible({
          timeout: 1000,
        });
      });
      await scrollTo(zach, "How Sam would rate it");
      await shot(zach, "2-no-priorities");
      await zach.getByRole("dialog").getByRole("button", { name: "Close" }).click();

      // Sam sets hers: two grades on Zach's list, and her section.
      await setPriorities(julie, JULIE.rubric);
      await afterTabSwitch(zach, async () => {
        await expect(listRow(zach, "52-47A").locator(".lib-other-grade")).toContainText("Sam", {
          timeout: 1000,
        });
      });
      await shot(zach, "3-list-two-grades");
      await open(zach, "52-47A");
      await scrollTo(zach, "How Sam would rate it");
      await shot(zach, "4-julie-section");

      // Ask.
      const section = zach.getByRole("region", { name: "How Sam would rate it" });
      await section.getByRole("button", { name: "Ask Sam" }).click();
      await section.getByRole("textbox").fill("The spring by the road: worth a walk?");
      await scrollTo(zach, "How Sam would rate it");
      await shot(zach, "5-ask");
      await section.getByRole("button", { name: "Ask", exact: true }).click();
      await expect(section).toContainText("Sam's Waiting for you");
      await zach.getByRole("dialog").getByRole("button", { name: "Close" }).click();

      // Sam: the badge and Waiting for you; answering.
      await afterTabSwitch(julie, async () => {
        await expect(julie.locator(".app-badge")).toHaveText("1", { timeout: 1000 });
      });
      await julie.getByRole("button", { name: /^Waiting for you/ }).click();
      // Step 6b: the ask's note on its row.
      await expect(listRow(julie, "52-47A").locator(".lib-ask-note")).toContainText("The spring by the road");
      await shot(julie, "6-waiting");
      await open(julie, "52-47A");
      const yours = julie.getByRole("region", { name: "Your take" });
      await yours.getByRole("button", { name: "Maybe" }).click();
      await yours.getByRole("textbox").fill("Steep drive, lovely spring. Let's walk it in May.");
      await scrollTo(julie, "Your take");
      await shot(julie, "7-answering");
      await yours.getByRole("button", { name: "Save my take" }).click();
      await expect(yours).toContainText("Let's walk it in May.");

      // Zach: her take beside her grade, new (step 6b: the dot and the badge).
      await afterTabSwitch(zach, async () => {
        await expect(listRow(zach, "52-47A").locator(".take-chip")).toHaveText("Sam says Maybe", {
          timeout: 1000,
        });
      });
      await expect(listRow(zach, "52-47A").locator(".new-dot")).toBeVisible();
      await expect(zach.locator(".app-badge")).toHaveText("1");
      await shot(zach, "8-list-with-take");
    });
  });
}
