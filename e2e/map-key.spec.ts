/**
 * The map's key line (UX part 2 PR 3b2; the audit's P-2): after a grade the map pins the best homesite only, and a line
 * under the map names what's drawn. "All map marks" opens Map layers at the full key, whose Every pin brings the other
 * pins back, and the line says so. A production build, the fixtures' HARs replayed.
 */
import { expect, test } from "@playwright/test";
import { importParcel, openExplorer, screenIt } from "./flow";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A" as const;

test.use({ viewport: { width: 1280, height: 800 } });

test("the key line names what's drawn; All map marks opens the key; Every pin brings the rest", async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await replayHar(context, [FERNEY]);
  await openExplorer(page, FERNEY);
  await importParcel(page, FERNEY);
  await screenIt(page);

  // The best homesite's pin alone: no other sites, shelves, gardens or road entrances.
  const line = page.getByRole("note", { name: "What the map shows" });
  await expect(line).toContainText("Best homesite");
  await expect(line).toContainText("The app's driveway");
  await expect(page.locator(".sitepin.top:not(.mk-pin)")).toHaveCount(1);
  await expect(page.locator(".sitepin:not(.top):not(.steep):not(.mk-pin)")).toHaveCount(0);

  // All map marks: Map layers, at the key, open.
  await line.getByRole("button", { name: "All map marks" }).click();
  const key = page.locator(".mp-key");
  await expect(key).toHaveAttribute("open", "");
  await key.getByRole("button", { name: "Show every pin" }).click();
  await expect(page.locator(".sitepin:not(.top):not(.mk-pin)").first()).toBeVisible();
  await expect(line).toContainText("Every pin");

  // Off again: the best homesite alone.
  await key.getByRole("button", { name: "Hide every pin" }).click();
  await expect(page.locator(".sitepin:not(.top):not(.steep):not(.mk-pin)")).toHaveCount(0);
  expect(errors).toEqual([]);
});
