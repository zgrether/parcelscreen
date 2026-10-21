/**
 * The panel's × on a parcel off the list (8c): "not for me". It closes, goes from the map and from Recent, and
 * "Closed. Undo" offers it back for about 6 s, open and live again with no re-grade. After that it's gone for good.
 * (× on a parcel on the list only closes: switching.spec.ts.)
 */
import { expect, test, type Page } from "@playwright/test";
import { DISMISS_MS } from "@/components/Explore/DismissToast";
import { expectAllDone, importParcels, openExplorer, openFromRecent, screenIt, settled } from "./flow";
import { YOUR_LIST } from "./household";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A";
const MACKS = "macks-mountain-35-3";

const live = (page: Page) =>
  page.evaluate(() => !!(window as unknown as { __psScreen: { view: unknown } }).__psScreen.view);
const toast = (page: Page) => page.locator(".dismiss-toast");
/** The built parcels' keys, as stored. */
const builtCount = async (page: Page) => {
  await settled(page);
  return page.evaluate(
    () => (JSON.parse(window.__psKv!.getItem("ps.parcels")!) as { built: unknown[] }).built.length,
  );
};

test("× on a parcel off the list: closed and cleared, Undo brings it back live, then it's gone", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await replayHar(context, [FERNEY, MACKS]);
  await openExplorer(page, FERNEY);
  await importParcels(page, [FERNEY, MACKS], { star: false });
  await openFromRecent(page, "52-47A");
  expectAllDone(await screenIt(page));
  expect(await live(page)).toBe(true);
  await expect(page.locator(".sh-actions").getByRole("button", { name: "Add to list" })).toBeVisible();
  expect(await builtCount(page)).toBe(2);

  // ×: closed, off the map and out of Recent, with "Closed. Undo".
  await page.getByRole("button", { name: "Close this parcel" }).first().click();
  await expect(page.locator(".sh-name")).toHaveCount(0);
  await expect(toast(page)).toContainText("Closed.");
  await expect(page.locator(".switch-toast", { hasText: "is on Your list" })).toHaveCount(0);
  expect(await builtCount(page)).toBe(1);

  // Undo: open again, its session still live (no re-grade), and back in Recent.
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".sh-name").first()).toContainText("52-47A");
  await expect.poll(() => live(page)).toBe(true);
  await expect(page.locator(".grade-btn", { hasText: /^Grading…$/ })).toHaveCount(0);
  expect(await builtCount(page)).toBe(2);

  // × again, and the Undo's time runs out: gone for good.
  await page.getByRole("button", { name: "Close this parcel" }).first().click();
  await expect(toast(page)).toBeVisible();
  await expect(toast(page)).toHaveCount(0, { timeout: DISMISS_MS + 3000 });
  expect(await builtCount(page)).toBe(1);
  await page.getByRole("link", { name: YOUR_LIST }).click();
  await page.getByRole("tab", { name: "Recent" }).click();
  await expect(page.locator(".hist-row")).toHaveCount(1);
  await expect(page.locator(".hist-row")).toContainText("35-3");
  expect(errors, "page errors").toEqual([]);
});
