/**
 * Two people's devices in one household (steps 6 and 8): starting to sync, and waiting for the space's changes. Two
 * browser contexts are two devices, over the memory store (playwright.config.ts).
 */
import { expect, type Page } from "@playwright/test";
import { PASSWORD_LEAD, START, SYNC_TITLE } from "@/lib/sync/words";
import { openYourData } from "./flow";

/** The Your list tab, whose name gains the badge's label ("Your list 1 new take") when something waits (step 6b). */
export const YOUR_LIST = /^Your list/;

/** Starts syncing on this page; returns its code. */
export async function startSyncing(page: Page): Promise<string> {
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

/** Switches tabs until the check passes: each switch fetches the space's changes. */
export async function afterTabSwitch(page: Page, check: () => Promise<void>): Promise<void> {
  await expect(async () => {
    await page.getByRole("link", { name: "Map", exact: true }).click();
    await page.getByRole("link", { name: YOUR_LIST }).click();
    await check();
  }).toPass({ timeout: 30_000 });
}
