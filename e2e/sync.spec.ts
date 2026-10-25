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
  unsavedAtOpen,
  WRONG_CODE,
} from "@/lib/sync/words";
import { defaultRubric } from "@/lib/rubric/default";
import { NEW_FACTORS, places } from "@/lib/rubric/factorsAdd";
import type { Rubric } from "@/lib/rubric/types";
import { importParcels, listRow, openExplorer, openYourData, unfoldListing } from "./flow";

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

/** Renames a parcel from Your list: its row opens it on the map (Z-2), Details renames it, "‹ Your list" comes back. */
async function rename(page: Page, from: string, to: string): Promise<void> {
  // Already there when offline: a tab switch then fetches the page, and the fetch fails.
  if (!page.url().endsWith("/library")) await goList(page);
  await listRow(page, from).locator(".lib-open").click();
  await page.getByRole("tab", { name: "Details" }).click();
  const name = (await unfoldListing(page.locator(".parcel-details"))).getByLabel("Name");
  await name.fill(to);
  await name.press("Enter");
  await page.locator(".back-chip").click();
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
  await expect(b).toHaveURL(/\/who$/);
  await b.getByRole("button", { name: "Profile 1" }).click();
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
  await expect(a.locator(".sync-toast")).toContainText(unsavedAtOpen(["Ferney at next open"])); // names the change
  await a.locator(".sync-toast").getByRole("button", { name: "Try again" }).click();
  await expect(a.locator(".sync-toast")).toHaveCount(0);

  // Discard, asked once: the space's copy comes back in place of this device's unsaved change.
  await expect(listRow(a, "Ferney at next open")).toBeVisible();
  await context.setOffline(true);
  await rename(a, "Ferney at next open", "Ferney to discard");
  await expect(toast).toContainText(NOT_SAVED, { timeout: 15_000 });
  await context.setOffline(false);
  await a.reload();
  await expect(toast).toContainText(unsavedAtOpen(["Ferney to discard"]));
  await toast.getByRole("button", { name: "Discard" }).click();
  await expect(toast).toContainText("Your other devices' copy replaces it here.");
  await toast.getByRole("button", { name: "Discard" }).click();
  await expect(toast).toHaveCount(0);
  await expect(listRow(a, "Ferney at next open")).toBeVisible();
  await expect(a.locator(".lib-row:visible", { hasText: "Ferney to discard" })).toHaveCount(0);

  // Another device joining now gets the saved name.
  const code = (await a.evaluate(() => localStorage.getItem("ps.sync"))) ?? "";
  await openExplorer(b, FERNEY);
  await b.goto(`/link#${(JSON.parse(code) as { code: string }).code}`);
  await b.getByRole("button", { name: /^Join$/ }).click();
  await b.getByRole("button", { name: "Profile 1" }).click();
  await expect(listRow(b, "Ferney at next open")).toBeVisible();
});

/** The current profile's own priorities on this page, as stored. */
const myRubric = (page: Page) =>
  page.evaluate(() => (JSON.parse(window.__psKv!.getItem("ps.rubrics")!) as { mine: unknown }).mine);

test("a fetch answered while a save is out doesn't undo that save (#319's CI race)", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  await openExplorer(a, FERNEY);
  await importParcels(a, [FERNEY]);
  const code = await startSyncing(a);
  const b = await (await browser.newContext()).newPage();
  await openExplorer(b, FERNEY);
  await b.goto(`/link#${groupCode(code)}`);
  await b.getByRole("button", { name: /^Join$/ }).click();
  await b.getByRole("button", { name: "Profile 1" }).click();
  await expect(b).toHaveURL(/\/library$/);
  await expect(b.locator(".sync-ind.bar")).toHaveText("Synced");

  // A renames it, and the save lands ("Synced" shows before a save goes, so the save itself is awaited).
  const savedA = a.waitForResponse((r) => r.url().endsWith("/api/sync/save"));
  await rename(a, "52-47A", "Ferney A");
  await savedA;

  // B renames it too, and B's save is held on its way out. Meanwhile B switches tabs, which fetches: the answer has
  // A's "Ferney A" in it, older than B's save.
  let out = () => {};
  const saving = new Promise<void>((r) => (out = r));
  let land = () => {};
  const landing = new Promise<void>((r) => (land = r));
  await b.route(
    (u) => u.pathname === "/api/sync/save",
    async (route) => {
      out();
      await landing;
      await route.continue();
    },
    { times: 1 },
  );
  const fetched = b.waitForResponse((r) => r.url().includes("/api/sync/changes"));
  await rename(b, "52-47A", "Ferney B");
  await saving;
  await goMap(b);
  await goList(b);
  await fetched;
  await b.waitForTimeout(500);
  await expect(listRow(b, "Ferney B")).toBeVisible({ timeout: 1 });
  await expect(b.locator(".lib-row:visible", { hasText: "Ferney A" })).toHaveCount(0);
  land();
});

test("a new factor added on one device reaches the other: one profile grades the same everywhere (B-1)", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const urls: string[] = [];
  const a = await device(await browser.newContext(), urls);
  const b = await device(await browser.newContext(), urls);
  await openExplorer(a, FERNEY);
  await importParcels(a, [FERNEY]);
  const code = await startSyncing(a);
  await openExplorer(b, MUD);
  await b.goto(`/link#${groupCode(code)}`);
  await b.getByRole("button", { name: /^(Replace and join|Join)$/ }).click();
  await expect(b).toHaveURL(/\/who$/);
  await b.getByRole("button", { name: "Profile 1" }).click();
  await expect(b).toHaveURL(/\/library$/);

  // B saves the profile's priorities as a release before Internet left them: no Internet anywhere, and no mark that
  // it was added. The space, and A, take that copy.
  const start = defaultRubric();
  const before = {
    mine: {
      ...start,
      ranked: start.ranked.filter((c) => c.factor !== "internet"),
      wonts: start.wonts.filter((k) => k !== "internet"),
      musts: start.musts.filter((m) => m.factor !== "internet"),
    },
    others: [],
    drivewayAdded: "seen",
    factorsAdded: Object.fromEntries(NEW_FACTORS.filter((f) => f !== "internet").map((f) => [f, "seen"])),
  };
  await b.waitForFunction(() => !!window.__psKv);
  await b.evaluate((r) => window.__psKv!.setItem("ps.rubrics", JSON.stringify(r)), before);
  // Placed: ranked, a limit, or Don't care (its bands are there either way).
  const hasInternet = (r: unknown) => places(r as Rubric, "internet");
  await expect(async () => {
    await goMap(a);
    await goList(a);
    expect(hasInternet(await myRubric(a))).toBe(false);
  }).toPass({ timeout: 20_000 });

  // B opens again: the release adds Internet once, after the space's copy is in, and saves it to the space. A, which
  // never reopened, gets it on a tab switch; the two copies are the same.
  await b.reload();
  await expect(async () => expect(hasInternet(await myRubric(b))).toBe(true)).toPass({ timeout: 15_000 });
  await expect(async () => {
    await goMap(a);
    await goList(a);
    expect(hasInternet(await myRubric(a))).toBe(true);
  }).toPass({ timeout: 20_000 });
  expect(await myRubric(a)).toEqual(await myRubric(b));
});

test("I'm new here on a joined device: the new member is saved before its questions open (B-2)", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const urls: string[] = [];
  const a = await device(await browser.newContext(), urls);
  const b = await device(await browser.newContext(), urls);
  await openExplorer(a, FERNEY);
  await importParcels(a, [FERNEY]);
  const code = await startSyncing(a);
  await openExplorer(b, MUD);
  await b.goto(`/link#${groupCode(code)}`);
  await b.getByRole("button", { name: /^(Replace and join|Join)$/ }).click();
  await expect(b).toHaveURL(/\/who$/);
  await b.getByRole("button", { name: "I'm new here" }).click();
  await expect(b).toHaveURL(/\/interview/);
  // The save went before the page did: no leftover to call unsaved.
  await b.waitForTimeout(1500);
  await expect(b.getByText(unsavedAtOpen(["New member"]))).toHaveCount(0);
  expect(
    await b.evaluate(() => JSON.parse(localStorage.getItem("ps.sync") ?? "{}").unsaved?.profiles ?? []),
  ).toEqual([]);
});

test("a code no space has changes nothing", async ({ page }) => {
  await openExplorer(page, FERNEY);
  await importParcels(page, [FERNEY]);
  await page.goto(`/link#${generateCode()}`);
  await expect(page.getByText(WRONG_CODE)).toBeVisible();
  await page.getByRole("button", { name: "Go to Your list" }).click();
  await expect(listRow(page, "52-47A")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("ps.sync"))).toBeNull();
});
