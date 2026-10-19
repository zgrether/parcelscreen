/**
 * Settings' Your data (step 4b, plan §7): Export file and Import file, moved out of the ☰ menu. They act at once,
 * outside Settings' Save: an import adds its parcels, and the export holds them. Settings opens from the menu on any
 * page (step 4b): here from Your list, with the map mounted behind its tab, so the list shows the import at once and the
 * map has it on return. A production build, no network.
 */
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { importParcels, listRow, openExplorer, openMenu, openYourData } from "./flow";

const FERNEY = "ferney-creek-52-47A" as const;
const MACKS = "macks-mountain-35-3" as const;

test("Your data: Import file adds the parcels at once; Export file saves them; the menu no longer holds either", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openExplorer(page, FERNEY);

  // The menu: no Export or Import of its own.
  await expect((await openMenu(page)).getByRole("button", { name: /^(Export|Import) file$/ })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // From Your list, the map behind its tab: imported without Save (the dialog closed with Esc), and on the list at once.
  await page.getByRole("link", { name: "Your list", exact: true }).click();
  await importParcels(page, [FERNEY, MACKS]);
  for (const name of ["52-47A", "35-3"]) await expect(listRow(page, name)).toBeVisible();
  // And the map has them: one opens there from the list.
  await listRow(page, "35-3").click();
  await page.getByRole("link", { name: "Open on the map" }).click();
  await expect(page.locator(".sh-name").first()).toContainText("35-3");

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
