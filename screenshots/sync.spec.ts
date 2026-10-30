/**
 * Step 5's screenshots (plan §15), desktop (1280 × 800) then phone (375 × 812): Sync across devices unjoined, showing
 * the code, and joined; the join question with no data and with data; a wrong code; the indicator, Synced and Not
 * saved; the toast; and the next-open line. Two browser contexts are two devices, over the memory store
 * (playwright.config.ts), under the default "Profile 1". The code in the shots is a throwaway one.
 */
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { generateCode } from "@/lib/sync/code";
import { PASSWORD_LEAD, START, SYNC_TITLE } from "@/lib/sync/words";
import { importParcels, listRow, openExplorer, openMenu, openYourData } from "../e2e/flow";

const FERNEY = "ferney-creek-52-47A" as const;
const MACKS = "macks-mountain-35-3" as const;
const MUD = "grayson-mud-creek-6273" as const;
const OUT = "test-results/screenshots";

async function openSync(page: Page) {
  await openYourData(page);
  await page.getByRole("button", { name: SYNC_TITLE, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: SYNC_TITLE });
  await expect(dialog).toBeVisible();
  return dialog;
}

const closeDialogs = async (page: Page) => {
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
};

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(device, () => {
    const viewport = phone ? { width: 375, height: 812 } : { width: 1280, height: 800 };
    const newPage = async (browser: Browser) =>
      (
        await browser.newContext(phone ? { viewport, isMobile: true, hasTouch: true } : { viewport })
      ).newPage();
    const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${device}-sync-${name}.png` });

    test("Sync across devices: start, the code, joining, the indicator and the toasts", async ({
      browser,
    }) => {
      test.setTimeout(300_000);
      const a = await newPage(browser);
      await openExplorer(a, FERNEY);
      await importParcels(a, [FERNEY, MACKS]);
      await a.goto("/library");
      await expect(listRow(a, "52-47A")).toBeVisible();

      // Unjoined: one line, Start and Join with a code.
      const dialog = await openSync(a);
      await shot(a, "1-unjoined");
      await dialog.getByRole("button", { name: START }).click();
      await expect(dialog.getByText(PASSWORD_LEAD)).toBeVisible({ timeout: 30_000 });
      await shot(a, "2-code");
      const code = (await dialog.locator(".sync-code-value").innerText()).replace(/-/g, "");
      await closeDialogs(a);

      // Joined: the indicator (the bar on a desktop, More's sheet on a phone) and the Sync screen's joined state.
      if (phone) {
        await openMenu(a);
        await shot(a, "3-indicator-synced");
        await a.keyboard.press("Escape");
      } else await shot(a, "3-indicator-synced");
      await openSync(a);
      await shot(a, "4-joined");
      await closeDialogs(a);

      // The join question: a device with nothing of its own, and one with a parcel; and a code no space has.
      const empty = await newPage(browser);
      await openExplorer(empty, FERNEY);
      await empty.goto(`/link#${code}`);
      await expect(empty.getByRole("button", { name: /^Join$/ })).toBeVisible();
      await shot(empty, "5-join-empty");
      const held = await newPage(browser);
      await openExplorer(held, MUD);
      await importParcels(held, [MUD]);
      await held.goto(`/link#${code}`);
      await expect(held.getByRole("button", { name: "Replace and join" })).toBeVisible();
      await shot(held, "6-join-replaces");
      await held.goto("/library"); // a new page load: only the fragment would change otherwise
      await held.goto(`/link#${generateCode()}`);
      await expect(held.getByText(/doesn't match a synced space/)).toBeVisible();
      await shot(held, "7-wrong-code");

      // A failed save: Not saved, the toast, and on a phone More's dot; then the next open's line.
      await a.context().setOffline(true);
      // An edit, through the debug store handle (the same on both widths): it goes up a second later, and fails.
      await a.evaluate(async () => {
        const s = JSON.parse(window.__psKv!.getItem("ps.parcels")!) as {
          built: { name: string }[];
        };
        s.built.find((b) => b.name.includes("35-3"))!.name = "Macks Mountain";
        await window.__psKv!.setItem("ps.parcels", JSON.stringify(s));
      });
      await expect(a.locator(".sync-toast")).toBeVisible({ timeout: 15_000 });
      await shot(a, "8-not-saved");
      if (phone) {
        await openMenu(a);
        await shot(a, "9-indicator-not-saved");
        await a.keyboard.press("Escape");
      }
      await a.context().setOffline(false);
      await a.reload();
      await expect(listRow(a, "52-47A")).toBeVisible();
      await expect(a.locator(".sync-toast")).toContainText("wasn't saved");
      await shot(a, "10-next-open");
    });
  });
}
