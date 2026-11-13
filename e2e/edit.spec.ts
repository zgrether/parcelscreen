/**
 * Map room (docs/plans/map-room.md §3): with a parcel open, the drawing toolbar is folded to ✎ Edit until Edit opens it.
 * Open, it holds Boundary ▾, + Mark, the trash and the acres, and a Done; it stays open through a tool, until Done. On a
 * desktop the grade button stays beside Edit; on a phone Edit is one 44 px button at the bottom right, above the sheet.
 * A production build, the fixtures' HARs replayed.
 */
import { expect, test } from "@playwright/test";
import { importParcel, openExplorer } from "./flow";
import { replayHar } from "./replay";

const MUD = "grayson-mud-creek-6273" as const;

test.describe("on a desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("folded to Edit beside Grade; Edit opens the tools and Done; a tool ends back in them; Done folds them", async ({
    page,
    context,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await replayHar(context, MUD);
    await openExplorer(page, MUD);
    await importParcel(page, MUD);

    const bar = page.locator(".toolbar");
    const edit = bar.getByRole("button", { name: "Edit the parcel" });
    await expect(edit).toBeVisible();
    await expect(bar.locator(".grade-btn")).toHaveText("Grade this parcel");
    await expect(bar.getByRole("button", { name: "Boundary ▾" })).toHaveCount(0);
    await expect(bar.getByRole("button", { name: /acres: parcel details$/ })).toHaveCount(0);

    await edit.click();
    await expect(bar.getByRole("button", { name: "Boundary ▾" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "+ Mark", exact: true })).toBeVisible();
    await expect(bar.getByRole("button", { name: /acres: parcel details$/ })).toBeVisible();

    // A tool starts and is cancelled: the bar is still open for the next edit.
    await bar.getByRole("button", { name: "Boundary ▾" }).click();
    await page.getByRole("menuitem", { name: "Split" }).click();
    await expect(bar).toHaveAttribute("data-mode", "split");
    await bar.getByRole("button", { name: "Cancel" }).click();
    await expect(bar.getByRole("button", { name: "Boundary ▾" })).toBeVisible();

    // Done folds it back to Edit.
    await bar.getByRole("button", { name: "Done", exact: true }).click();
    await expect(edit).toBeVisible();
    await expect(bar.getByRole("button", { name: "Boundary ▾" })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });

  test("Edit is one 44 px button at the bottom right, above the sheet", async ({ page, context }) => {
    await replayHar(context, MUD);
    await openExplorer(page, MUD);
    await importParcel(page, MUD);
    const edit = page.locator(".toolbar").getByRole("button", { name: "Edit the parcel" });
    await expect(edit).toBeVisible();
    const b = (await edit.boundingBox())!;
    const sheet = (await page.locator(".explore-panel").boundingBox())!;
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(375 - (b.x + b.width)).toBeLessThanOrEqual(14);
    expect(b.y + b.height).toBeLessThanOrEqual(sheet.y);
    await edit.tap();
    await expect(page.getByRole("button", { name: "Boundary ▾" })).toBeVisible();
  });
});
