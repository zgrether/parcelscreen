/**
 * The household on the synced space (step 6, docs/plans/step-6-household.md): one list for every member, who added
 * each parcel, joining through Who's this? and I'm new here, and the clean break of each profile's own list. Two
 * browser contexts are two people's devices, over the memory store (playwright.config.ts).
 */
import { expect, test, type Page } from "@playwright/test";
import { OLD_DATA_DROPPED } from "@/lib/client/oldData";
import { PASSWORD_LEAD, START, SYNC_TITLE } from "@/lib/sync/words";
import { booted, importParcels, listRow, openExplorer, openMenu, openYourData, reload } from "./flow";

const FERNEY = "ferney-creek-52-47A" as const;
const MACKS = "macks-mountain-35-3" as const;

/** Starts syncing on this page; returns its code. */
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

test("Julie joins: Who's this? → I'm new here → her name; one list, and who added each parcel", async ({
  browser,
}) => {
  const zach = await (await browser.newContext()).newPage();
  await openExplorer(zach, FERNEY);
  await importParcels(zach, [FERNEY, MACKS]);
  const code = await startSyncing(zach);

  const julie = await (await browser.newContext()).newPage();
  await openExplorer(julie, FERNEY);
  await julie.goto(`/link#${code}`);
  await julie.getByRole("button", { name: /^Join$/ }).click();
  await expect(julie).toHaveURL(/\/who$/);
  await expect(julie.getByRole("heading", { name: "Who's this?" })).toBeVisible();
  await expect(julie.getByRole("button", { name: "Profile 1" })).toBeVisible();
  await julie.getByRole("button", { name: "I'm new here" }).click();
  await julie.waitForURL("**/interview");
  await expect(julie.getByRole("heading", { name: "What should we call you?" })).toBeVisible();
  await julie.getByPlaceholder("Your name or a nickname").fill("Julie");
  await julie.getByRole("button", { name: "Continue" }).click();
  await julie.getByRole("button", { name: "Not now" }).click();

  // Her list is the household's: Zach's two parcels, each added by him.
  await julie.getByRole("link", { name: "Your list" }).click();
  await expect(listRow(julie, "52-47A")).toBeVisible();
  await expect(listRow(julie, "35-3")).toBeVisible();
  await listRow(julie, "52-47A").locator(".lib-open").click();
  await expect(julie.getByRole("dialog").getByText("Added by Profile 1")).toBeVisible();

  // The current profile stays per device: Julie's reload opens as her.
  await reload(julie);
  await expect((await openMenu(julie)).locator(".profile-btn-name")).toHaveText("Julie");
});

test("the clean break: a profile's own list from before step 6 goes, and the menu says so once", async ({
  page,
}) => {
  await openExplorer(page, FERNEY);
  await booted(page);
  const profile = await page.evaluate(() => window.__psKv!.profile);
  // A list kept the old way: under the profile, with no shared one.
  await page.evaluate(
    ({ parcels, profile }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("parcelscreen");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction("docs", "readwrite");
          const docs = tx.objectStore("docs");
          docs.put({ profile, key: "ps.parcels", value: parcels });
          docs.delete(["_space", "ps.parcels"]);
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { parcels: JSON.stringify({ v: 2, open: null, built: [] }), profile },
  );
  await reload(page);
  await expect((await openMenu(page)).getByText(OLD_DATA_DROPPED)).toBeVisible();
  await page.keyboard.press("Escape");
  await reload(page);
  await expect((await openMenu(page)).getByText(OLD_DATA_DROPPED)).toHaveCount(0);
});
