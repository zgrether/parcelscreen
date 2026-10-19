/**
 * Sync across devices (step 5, docs/plans/step-5-sync.md): two browser contexts are two devices. The routes keep their
 * spaces in memory (playwright.config.ts sets PS_SYNC_STORE=memory), so no test touches the production database.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { generateCode, groupCode } from "@/lib/sync/code";
import {
  JOINED,
  LEAVE,
  NOT_SAVED,
  PASSWORD_LEAD,
  START,
  SYNC_TITLE,
  UNSAVED_AT_OPEN,
  WRONG_CODE,
} from "@/lib/sync/words";
import { importParcels, listRow, openExplorer, openYourData } from "./flow";

const FERNEY = "ferney-creek-52-47A" as const;
const MACKS = "macks-mountain-35-3" as const;
const MUD = "grayson-mud-creek-6273" as const;

async function device(context: BrowserContext, urls: string[]): Promise<Page> {
  const page = await context.newPage();
  page.on("request", (r) => urls.push(r.url()));
  return page;
}

/** Settings → Your data → Sync across devices. */
async function openSync(page: Page) {
  await openYourData(page);
  await page.getByRole("button", { name: SYNC_TITLE, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: SYNC_TITLE });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Starts syncing on this page; returns the code it shows. */
async function startSyncing(page: Page): Promise<string> {
  const dialog = await openSync(page);
  await dialog.getByRole("button", { name: START }).click();
  await expect(dialog.getByText(PASSWORD_LEAD)).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByRole("img", { name: /QR code/ })).toBeVisible();
  const code = (await dialog.locator(".sync-code-value").innerText()).replace(/-/g, "");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  return code;
}

const goList = (page: Page) => page.getByRole("link", { name: "Your list" }).click();
const goMap = (page: Page) => page.getByRole("link", { name: "Map" }).click();

/** Renames a parcel from its detail on Your list. */
async function rename(page: Page, from: string, to: string): Promise<void> {
  // Already there when offline: a tab switch then fetches the page, and the fetch fails.
  if (!page.url().endsWith("/library")) await goList(page);
  await listRow(page, from).locator(".lib-open").click();
  const detail = page.getByRole("dialog");
  const name = detail.getByRole("group", { name: "Listing" }).getByLabel("Name");
  await name.fill(to);
  await name.press("Enter");
  await detail.getByRole("button", { name: "Close" }).click();
}

/** Switches tabs until the list shows `text`: each switch fetches the space's changes. */
async function seesAfterTabSwitch(page: Page, text: string): Promise<void> {
  await expect(async () => {
    await goMap(page);
    await goList(page);
    await expect(listRow(page, text)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
}

test("start on one device and join from another; changes cross on a tab switch; the later save wins; leave keeps a copy", async ({
  browser,
}) => {
  const urls: string[] = [];
  const a = await device(await browser.newContext(), urls);
  const b = await device(await browser.newContext(), urls);

  // Device A: two parcels, then Start syncing.
  await openExplorer(a, FERNEY);
  await importParcels(a, [FERNEY, MACKS]);
  const code = await startSyncing(a);
  expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);

  // Device B holds a parcel of its own: joining says it's replaced, and does replace it.
  await openExplorer(b, MUD);
  await importParcels(b, [MUD]);
  await b.goto(`/link#${groupCode(code)}`);
  await expect(b).toHaveURL(/\/link$/); // the code is gone from the address bar
  await expect(b.getByText(/This device has 1 profile and 1 parcel of its own/)).toBeVisible();
  await expect(b.getByRole("button", { name: "Export first" })).toBeVisible();
  await b.getByRole("button", { name: "Replace and join" }).click();
  await expect(b).toHaveURL(/\/library$/);
  await expect(listRow(b, "52-47A")).toBeVisible();
  await expect(listRow(b, "35-3")).toBeVisible();
  await expect(b.locator(".lib-row:visible", { hasText: "6273" })).toHaveCount(0);
  await expect(b.locator(".sync-ind.bar")).toHaveText("Synced");

  // A parcel renamed on B reaches A when A switches tabs.
  await rename(b, "35-3", "Macks from B");
  await seesAfterTabSwitch(a, "Macks from B");

  // The same parcel on both: the later save wins, whole, on both.
  await rename(a, "52-47A", "Ferney A");
  await seesAfterTabSwitch(b, "Ferney A");
  await rename(b, "Ferney A", "Ferney B");
  await seesAfterTabSwitch(a, "Ferney B");
  await expect(a.locator(".lib-row:visible", { hasText: "Ferney A" })).toHaveCount(0);

  // Leaving keeps B's copy, and B stops getting A's changes.
  const dialog = await openSync(b);
  await expect(dialog.getByText(JOINED)).toBeVisible();
  await dialog.getByRole("button", { name: LEAVE }).click();
  await dialog.getByRole("button", { name: "Stop syncing" }).click();
  await expect(listRow(b, "Ferney B")).toBeVisible({ timeout: 15_000 });
  await expect(b.locator(".sync-ind")).toHaveCount(0);
  await rename(a, "Ferney B", "Ferney after B left");
  await a.waitForTimeout(2500);
  await goMap(b);
  await goList(b);
  await expect(listRow(b, "Ferney B")).toBeVisible();

  // The code never went into a URL (it travels in a header).
  for (const c of [code, groupCode(code)]) expect(urls.filter((u) => u.includes(c))).toEqual([]);
});

test("offline: Not saved, then Try again; a change a closed page didn't save is offered at the next open", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const a = await context.newPage();
  await openExplorer(a, FERNEY);
  await importParcels(a, [FERNEY]);
  await startSyncing(a);
  const b = await (await browser.newContext()).newPage();

  // Offline: the save fails, and says so; Try again once back saves it.
  await goList(a);
  await expect(listRow(a, "52-47A")).toBeVisible(); // loaded before going offline
  await context.setOffline(true);
  await rename(a, "52-47A", "Ferney offline");
  const toast = a.locator(".sync-toast");
  await expect(toast).toContainText(NOT_SAVED, { timeout: 15_000 });
  await expect(a.locator("button.sync-ind.bad")).toHaveText(NOT_SAVED);
  await expect(listRow(a, "Ferney offline")).toBeVisible(); // the change stays on screen
  await context.setOffline(false);
  await toast.getByRole("button", { name: "Try again" }).click();
  await expect(toast).toHaveCount(0);
  await expect(a.locator(".sync-ind.bar")).toHaveText("Synced");

  // A change still unsaved when the page goes: the next open says so, and Try again saves it.
  await context.setOffline(true);
  await rename(a, "Ferney offline", "Ferney at next open");
  await expect(toast).toContainText(NOT_SAVED, { timeout: 15_000 });
  await context.setOffline(false);
  await a.reload();
  await expect(a.locator(".sync-toast")).toContainText(UNSAVED_AT_OPEN);
  await a.locator(".sync-toast").getByRole("button", { name: "Try again" }).click();
  await expect(a.locator(".sync-toast")).toHaveCount(0);

  // Another device joining now gets the saved name.
  const code = (await a.evaluate(() => localStorage.getItem("ps.sync"))) ?? "";
  await openExplorer(b, FERNEY);
  await b.goto(`/link#${(JSON.parse(code) as { code: string }).code}`);
  await b.getByRole("button", { name: /^Join$/ }).click();
  await expect(listRow(b, "Ferney at next open")).toBeVisible();
});

test("a code no space has changes nothing", async ({ page }) => {
  await openExplorer(page, FERNEY);
  await importParcels(page, [FERNEY]);
  await page.goto(`/link#${generateCode()}`);
  await expect(page.getByText(WRONG_CODE)).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(listRow(page, "52-47A")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("ps.sync"))).toBeNull();
});
