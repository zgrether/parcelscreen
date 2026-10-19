/**
 * Settings' Your data (step 4b, plan §7): Export file and Import file, moved out of the ☰ menu. They act at once,
 * outside Settings' Save: an import adds its parcels, and the export holds them. A production build, no network.
 */
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { importParcels, openExplorer, openYourData } from "./flow";

const FERNEY = "ferney-creek-52-47A" as const;
const MACKS = "macks-mountain-35-3" as const;

test("Your data: Import file adds the parcels at once; Export file saves them; the menu no longer holds either", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openExplorer(page, FERNEY);

  // The menu: no Export or Import of its own.
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(
    page.locator(".menu-drawer").getByRole("button", { name: /^(Export|Import) file$/ }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");

  await importParcels(page, [FERNEY, MACKS]);
  // Imported without Save: the dialog closed with Esc, and both are in the menu's History.
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  for (const name of ["52-47A", "35-3"])
    await expect(page.locator(".menu-drawer li", { hasText: name })).toHaveCount(1);
  await page.keyboard.press("Escape");

  // Export: a file with both parcels.
  await openYourData(page);
  await expect(page.getByText("These don't wait for Save.")).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export file", exact: true }).click(),
  ]);
  const file = JSON.parse(readFileSync((await download.path())!, "utf8")) as { built?: { name?: string }[] };
  const text = JSON.stringify(file);
  expect(text).toContain("52-47A");
  expect(text).toContain("35-3");

  // The same file again: nothing new, and the summary says what it skipped.
  await page.locator('input[aria-label="Import file"]').setInputFiles({
    name: "again.json",
    mimeType: "application/json",
    buffer: readFileSync((await download.path())!),
  });
  await expect(page.locator(".import-summary")).toContainText("Skipped");
  expect(errors).toEqual([]);
});
