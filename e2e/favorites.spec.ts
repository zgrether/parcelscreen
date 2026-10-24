/**
 * Favorites and Recent (step 8, docs/plans/step-8-favorites.md; 8c's Recent and Add to list): two people's devices over
 * the memory store. Zach grades a parcel and keeps another; both are in his Recent, and neither is Julie's. He adds one
 * to the list: Julie sees it in Favorites, Search finds it by name. Removing it sends it back to his Recent and away
 * from hers; ✕ removes a Recent row with Undo; Clear Recent keeps the favorites. The panel's Add to list starts its
 * name sheet from the parcel's name. (The panel's × on a parcel off the list: dismiss.spec.ts.)
 */
import { expect, test, type Page } from "@playwright/test";
import { FAVORITES_EMPTY, RECENT_EMPTY } from "@/lib/client/library";
import {
  booted,
  importParcels,
  openExplorer,
  openFromRecent,
  openSearch,
  screenIt,
  seedScreens,
} from "./flow";
import { afterTabSwitch, startSyncing, YOUR_LIST } from "./household";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A" as const;
const MACKS = "macks-mountain-35-3" as const;

const recentRows = (page: Page) => page.locator(".hist-row");
const favoriteRows = (page: Page) => page.locator(".lib-table tbody tr");
const tab = (page: Page, name: "Shortlist" | "Recent") => page.getByRole("tab", { name });
const nameSheet = (page: Page) => page.getByRole("dialog", { name: "Add to list" });

async function yourList(page: Page, view: "Shortlist" | "Recent"): Promise<void> {
  await page.getByRole("link", { name: YOUR_LIST }).click();
  await tab(page, view).click();
}

test("Recent is yours, Favorites the household's: add, remove, ✕ with Undo, Clear Recent, Search", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const zachContext = await browser.newContext();
  await replayHar(zachContext, [FERNEY, MACKS]);
  const zach = await zachContext.newPage();
  await openExplorer(zach, FERNEY);
  await importParcels(zach, [FERNEY, MACKS], { star: false });
  await seedScreens(zach, [MACKS]);

  // Zach grades Ferney: it's at the top of his Recent, graded today; Macks is there too. Favorites is empty.
  await openFromRecent(zach, "52-47A");
  await screenIt(zach);
  await yourList(zach, "Recent");
  await expect(recentRows(zach)).toHaveCount(2);
  await expect(recentRows(zach).first()).toContainText("52-47A");
  await expect(recentRows(zach).first()).toContainText(/Graded [A-Z][a-z]{2} \d{1,2}/);
  await expect(recentRows(zach).first().locator(".card-grade")).toHaveText(/^[A-F]$/);
  await tab(zach, "Shortlist").click();
  await expect(zach.locator("main")).toContainText(FAVORITES_EMPTY);

  // He adds Macks to the list from Recent, with a name of his own (Add waits for one).
  await tab(zach, "Recent").click();
  await zach.getByRole("button", { name: /^Add to list: .*35-3/ }).click();
  await expect(nameSheet(zach).getByLabel("Name")).toHaveValue(/35-3/);
  await nameSheet(zach).getByLabel("Name").fill(" ");
  await expect(nameSheet(zach).getByRole("button", { name: "Add" })).toBeDisabled();
  await nameSheet(zach).getByLabel("Name").fill("Macks bench");
  await nameSheet(zach).getByRole("button", { name: "Add" }).click();
  // It leaves his Recent for Favorites.
  await expect(recentRows(zach)).toHaveCount(1);
  await tab(zach, "Shortlist").click();
  await expect(favoriteRows(zach)).toHaveCount(1);
  await expect(favoriteRows(zach)).toContainText("Macks bench");

  // Julie joins: Favorites holds Macks alone; her Recent is empty.
  const code = await startSyncing(zach);
  const julie = await (await browser.newContext()).newPage();
  await openExplorer(julie, FERNEY);
  await julie.goto(`/link#${code}`);
  await julie.getByRole("button", { name: /^Join$/ }).click();
  await julie.getByRole("button", { name: "I'm new here" }).click();
  await julie.waitForURL("**/interview");
  await julie.getByPlaceholder("Your name or a nickname").fill("Julie");
  await julie.getByRole("button", { name: "Continue" }).click();
  await julie.getByRole("button", { name: "Not now" }).click();
  await booted(julie);
  await yourList(julie, "Shortlist");
  await expect(favoriteRows(julie)).toHaveCount(1);
  await expect(favoriteRows(julie)).toContainText("Macks bench");
  await tab(julie, "Recent").click();
  await expect(julie.locator("main")).toContainText(RECENT_EMPTY);

  // Search: Julie finds the favorite by name; Zach finds his graded parcel in Recent (an imported parcel has no
  // county record, so no parcel number: favorites.test.ts covers the numbers).
  await julie.getByRole("link", { name: "Map", exact: true }).click();
  await (await openSearch(julie)).fill("macks bench");
  await expect(julie.getByRole("group", { name: "Shortlist" }).getByRole("option")).toContainText(
    "Macks bench",
  );
  await zach.getByRole("link", { name: "Map", exact: true }).click();
  await (await openSearch(zach)).fill("ferney");
  await expect(zach.getByRole("group", { name: "Recent" }).getByRole("option")).toContainText("52-47A");
  await zach.keyboard.press("Escape");

  // Zach takes Macks off the list: one confirm; it's back in his Recent, and gone for Julie.
  await yourList(zach, "Shortlist");
  await favoriteRows(zach)
    .getByRole("button", { name: /^On your list: Macks bench/ })
    .click();
  const confirm = zach.getByRole("alertdialog");
  await expect(confirm).toContainText("Remove from Your list? It goes back to your Recent list.");
  await confirm.getByRole("button", { name: "Remove from Your list" }).click();
  await expect(zach.locator("main")).toContainText(FAVORITES_EMPTY);
  await tab(zach, "Recent").click();
  await expect(recentRows(zach)).toHaveCount(2);
  await yourList(julie, "Shortlist");
  await afterTabSwitch(julie, async () => {
    await expect(julie.locator("main")).toContainText(FAVORITES_EMPTY, { timeout: 1000 });
  });

  // ✕ removes a Recent row for good, with Undo for a few seconds.
  await zach.getByRole("button", { name: "Remove from Recent: Macks bench" }).click();
  await expect(recentRows(zach)).toHaveCount(1);
  await zach.locator(".hist-toast").getByRole("button", { name: "Undo" }).click();
  await expect(recentRows(zach)).toHaveCount(2);

  // The panel's Add to list: Ferney, still open on the map, starts from its own name.
  await zach.getByRole("link", { name: "Map", exact: true }).click();
  await zach.locator(".sh-actions").getByRole("button", { name: "Add to list" }).click();
  await expect(nameSheet(zach).getByLabel("Name")).toHaveValue(/52-47A/);
  await nameSheet(zach).getByRole("button", { name: "Add" }).click();
  await expect(zach.locator(".sh-actions").getByRole("button", { name: "On your list" })).toBeVisible();

  // Ferney left Recent as it was added. Clear Recent: Macks goes; Ferney stays in Favorites.
  await yourList(zach, "Recent");
  await expect(recentRows(zach)).toHaveCount(1);
  await zach.getByRole("button", { name: "Clear Recent" }).click();
  await expect(zach.getByRole("alertdialog")).toContainText(
    "Clear your Recent list? Parcels on your list stay.",
  );
  await zach.getByRole("alertdialog").getByRole("button", { name: "Clear", exact: true }).click();
  await expect(recentRows(zach)).toHaveCount(0);
  await expect(zach.locator("main")).toContainText(RECENT_EMPTY);
  await expect(zach.getByRole("button", { name: "Clear Recent" })).toHaveCount(0);
  await tab(zach, "Shortlist").click();
  await expect(favoriteRows(zach)).toHaveCount(1);
  await afterTabSwitch(julie, async () => {
    await expect(favoriteRows(julie)).toContainText("52-47A", { timeout: 1000 });
  });
});
