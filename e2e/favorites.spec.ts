/**
 * Favorites and History (step 8, docs/plans/step-8-favorites.md): two people's devices over the memory store. Zach
 * grades a parcel and keeps another; both are in his History, and neither is Julie's. He stars one: Julie sees it in
 * Favorites, Search finds it by name. Unstarring sends it back to his History and away from hers; ✕ removes a History
 * row with Undo; Clear history keeps the favorites. The panel's star starts its name sheet from the parcel's name.
 */
import { expect, test, type Page } from "@playwright/test";
import { FAVORITES_EMPTY, HISTORY_EMPTY } from "@/lib/client/library";
import {
  booted,
  importParcels,
  openExplorer,
  openFromHistory,
  openSearch,
  screenIt,
  seedScreens,
} from "./flow";
import { afterTabSwitch, startSyncing, YOUR_LIST } from "./household";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A" as const;
const MACKS = "macks-mountain-35-3" as const;

const historyRows = (page: Page) => page.locator(".hist-row");
const favoriteRows = (page: Page) => page.locator(".lib-table tbody tr");
const tab = (page: Page, name: "Favorites" | "History") => page.getByRole("tab", { name });
const nameSheet = (page: Page) => page.getByRole("dialog", { name: "Add to Favorites" });

async function yourList(page: Page, view: "Favorites" | "History"): Promise<void> {
  await page.getByRole("link", { name: YOUR_LIST }).click();
  await tab(page, view).click();
}

test("History is yours, Favorites the household's: star, unstar, ✕ with Undo, Clear history, Search", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const zachContext = await browser.newContext();
  await replayHar(zachContext, [FERNEY, MACKS]);
  const zach = await zachContext.newPage();
  await openExplorer(zach, FERNEY);
  await importParcels(zach, [FERNEY, MACKS], { star: false });
  await seedScreens(zach, [MACKS]);

  // Zach grades Ferney: it's at the top of his History, graded today; Macks is there too. Favorites is empty.
  await openFromHistory(zach, "52-47A");
  await screenIt(zach);
  await yourList(zach, "History");
  await expect(historyRows(zach)).toHaveCount(2);
  await expect(historyRows(zach).first()).toContainText("52-47A");
  await expect(historyRows(zach).first()).toContainText(/Graded [A-Z][a-z]{2} \d{1,2}/);
  await expect(historyRows(zach).first().locator(".card-grade")).toHaveText(/^[A-F]$/);
  await tab(zach, "Favorites").click();
  await expect(zach.locator("main")).toContainText(FAVORITES_EMPTY);

  // He stars Macks from History, with a name of his own (Add waits for one).
  await tab(zach, "History").click();
  await zach.getByRole("button", { name: /^Add to favorites: .*35-3/ }).click();
  await expect(nameSheet(zach).getByLabel("Name")).toHaveValue(/35-3/);
  await nameSheet(zach).getByLabel("Name").fill(" ");
  await expect(nameSheet(zach).getByRole("button", { name: "Add" })).toBeDisabled();
  await nameSheet(zach).getByLabel("Name").fill("Macks bench");
  await nameSheet(zach).getByRole("button", { name: "Add" }).click();
  // Never graded here, it leaves his History for Favorites.
  await expect(historyRows(zach)).toHaveCount(1);
  await tab(zach, "Favorites").click();
  await expect(favoriteRows(zach)).toHaveCount(1);
  await expect(favoriteRows(zach)).toContainText("Macks bench");

  // Julie joins: Favorites holds Macks alone; her History is empty.
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
  await yourList(julie, "Favorites");
  await expect(favoriteRows(julie)).toHaveCount(1);
  await expect(favoriteRows(julie)).toContainText("Macks bench");
  await tab(julie, "History").click();
  await expect(julie.locator("main")).toContainText(HISTORY_EMPTY);

  // Search: Julie finds the favorite by name; Zach finds his graded parcel in Your history (an imported parcel has no
  // county record, so no parcel number: favorites.test.ts covers the numbers).
  await julie.getByRole("link", { name: "Map", exact: true }).click();
  await (await openSearch(julie)).fill("macks bench");
  await expect(julie.getByRole("group", { name: "Favorites" }).getByRole("option")).toContainText(
    "Macks bench",
  );
  await zach.getByRole("link", { name: "Map", exact: true }).click();
  await (await openSearch(zach)).fill("ferney");
  await expect(zach.getByRole("group", { name: "Your history" }).getByRole("option")).toContainText("52-47A");
  await zach.keyboard.press("Escape");

  // Zach unstars Macks: one confirm; it's back in his History, and gone for Julie.
  await yourList(zach, "Favorites");
  await favoriteRows(zach)
    .getByRole("button", { name: /^In favorites: Macks bench/ })
    .click();
  const confirm = zach.getByRole("alertdialog");
  await expect(confirm).toContainText("Remove from your household's favorites? It stays in your History.");
  await confirm.getByRole("button", { name: "Remove from favorites" }).click();
  await expect(zach.locator("main")).toContainText(FAVORITES_EMPTY);
  await tab(zach, "History").click();
  await expect(historyRows(zach)).toHaveCount(2);
  await yourList(julie, "Favorites");
  await afterTabSwitch(julie, async () => {
    await expect(julie.locator("main")).toContainText(FAVORITES_EMPTY, { timeout: 1000 });
  });

  // ✕ removes a History row for good, with Undo for a few seconds.
  await zach.getByRole("button", { name: "Remove from History: Macks bench" }).click();
  await expect(historyRows(zach)).toHaveCount(1);
  await zach.locator(".hist-toast").getByRole("button", { name: "Undo" }).click();
  await expect(historyRows(zach)).toHaveCount(2);

  // The panel's star: Ferney, still open on the map, starts from its own name.
  await zach.getByRole("link", { name: "Map", exact: true }).click();
  await zach.locator(".sh-actions").getByRole("button", { name: "Add to favorites" }).click();
  await expect(nameSheet(zach).getByLabel("Name")).toHaveValue(/52-47A/);
  await nameSheet(zach).getByRole("button", { name: "Add" }).click();
  await expect(zach.locator(".sh-actions").getByRole("button", { name: "In favorites" })).toBeVisible();

  // Clear history: the unstarred row goes; Ferney stays, starred, in History and in Favorites.
  await yourList(zach, "History");
  await zach.getByRole("button", { name: "Clear history" }).click();
  await expect(zach.getByRole("alertdialog")).toContainText("Clear your history? Starred parcels stay.");
  await zach.getByRole("alertdialog").getByRole("button", { name: "Clear", exact: true }).click();
  await expect(historyRows(zach)).toHaveCount(1);
  await expect(historyRows(zach).getByRole("button", { name: /^In favorites/ })).toBeVisible();
  await expect(zach.getByRole("button", { name: "Clear history" })).toHaveCount(0);
  await tab(zach, "Favorites").click();
  await expect(favoriteRows(zach)).toHaveCount(1);
  await afterTabSwitch(julie, async () => {
    await expect(favoriteRows(julie)).toContainText("52-47A", { timeout: 1000 });
  });
});
