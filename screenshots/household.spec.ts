/**
 * Step 6's screenshots (plan §15), desktop (1280 × 800) then phone (375 × 812): Who's this?; a member without
 * priorities; the list with two grades; How Sam would rate it; Ask; Waiting for you with its badge; answering a
 * take; and Zach's list with her take, new (step 6b: the dot and the badge; the waiting row shows the ask's note). Two browser contexts are the two people's devices, over the memory store. The
 * names are "Alex" (the first device's profile, renamed) and "Sam", not the owners'; the code is a throwaway one.
 */
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { PASSWORD_LEAD, START, SYNC_TITLE } from "@/lib/sync/words";
import { JULIE, ZACH } from "../test/support/rubrics";
import {
  booted,
  importParcels,
  listRow,
  openExplorer,
  openMenu,
  openYourData,
  reload,
  seedScreens,
  settled,
} from "../e2e/flow";

/** The Your list tab, whose name gains the badge's label ("Your list 1 new take") when something waits (step 6b). */
const YOUR_LIST = /^Your list/;
const FERNEY = "ferney-creek-52-47A" as const;
const MACKS = "macks-mountain-35-3" as const;
const MUD = "grayson-mud-creek-6273" as const;
const OUT = "test-results/screenshots";

/** The phone's sheet, raised until it holds most of the screen. */
async function raiseSheet(page: Page): Promise<void> {
  const sheet = page.locator(".explore-panel");
  for (let i = 0; i < 4; i++) {
    if ((await sheet.boundingBox())!.height > 500) return;
    await page.locator(".sheet-handle").tap();
    await page.waitForTimeout(500);
  }
}

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
    /** A row opens the parcel on the map, with the one panel (Z-2); on a phone, the sheet raised. */
    const open = async (page: Page, name: string) => {
      const row = listRow(page, name);
      // The phone card's money line since UX part 2 PR 7c2: a tap on the card opens the parcel (Z-2).
      if (phone) await row.locator(".lib-card-money").tap();
      else await row.locator(".lib-open").click();
      await expect(page.locator(".sh-name").first()).toContainText(name);
      await page.getByRole("tab", { name: "Grade" }).click();
      if (phone) await raiseSheet(page);
    };
    /** Closes the parcel, so the list's tab switches don't have it in front of anyone. */
    const close = (page: Page) => page.getByRole("button", { name: "Close this parcel" }).first().click();
    const scrollTo = (page: Page, region: string) =>
      page.getByRole("region", { name: region }).evaluate((el) => el.scrollIntoView({ block: "start" }));

    test("the household: who's this, everyone's grade, How Sam would rate it, ask and answer", async ({
      browser,
    }) => {
      test.setTimeout(300_000);
      const zach = await newPage(browser);
      await openExplorer(zach, FERNEY);
      await importParcels(zach, [FERNEY, MACKS, MUD]);
      await seedScreens(zach, [FERNEY, MACKS, MUD]);
      // The seeded grades are written to the store directly: a reload has the map read them.
      await settled(zach);
      await reload(zach);
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
      await close(zach);

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

      // Ask: the header's (UX part 2 PR 3), its form in the actions' place.
      const section = zach.getByRole("region", { name: "How Sam would rate it" });
      await zach.locator(".sh-acts").getByRole("button", { name: "Ask Sam" }).click();
      const ask = zach.getByRole("form", { name: "Ask for a take" });
      await ask.getByRole("textbox").fill("The spring by the road: worth a walk?");
      await ask.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await shot(zach, "5-ask");
      await ask.getByRole("button", { name: "Ask", exact: true }).click();
      await expect(section).toContainText("Sam's Waiting for you");
      await close(zach);

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
      await close(julie);

      // Zach: her take beside her grade, new (step 6b: the dot and the badge).
      await afterTabSwitch(zach, async () => {
        await expect(listRow(zach, "52-47A").locator(".take-chip")).toHaveText("Sam says Maybe", {
          timeout: 1000,
        });
      });
      await expect(listRow(zach, "52-47A").locator(".new-dot")).toBeVisible();
      await expect(zach.locator(".app-badge")).toHaveText("1");
      await shot(zach, "8-list-with-take");

      // Opened, her take is under the header's actions, with the dot it had as it opened (P-2).
      await open(zach, "52-47A");
      await expect(zach.getByRole("list", { name: "Takes" })).toContainText("Sam · Maybe");
      await zach.locator(".sh-acts-wrap").evaluate((el) => el.scrollIntoView({ block: "start" }));
      await shot(zach, "9-take-under-actions");
    });
  });
}
