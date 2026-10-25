/**
 * UX part 2 PR 4 (the audit's P-1): coordinates typed in search drop a pin there and open the parcel under it. Ferney's
 * point, whose county lookup is in its recording. A production build, the fixtures' HARs replayed.
 */
import { expect, test } from "@playwright/test";
import { loadFixture } from "../test/support/fixtures";
import { openExplorer, openSearch } from "./flow";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A" as const;

test("coordinates: a pin where they are, and the parcel under it opened", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await replayHar(context, FERNEY);
  await openExplorer(page, FERNEY);
  const { lat, lon } = loadFixture(FERNEY).input.point;
  await (await openSearch(page)).fill(`${lat}, ${lon}`);
  await page.getByRole("option", { name: `Go to ${lat}, ${lon}` }).click();
  await expect(page.getByRole("img", { name: `Pin at ${lat}, ${lon}` })).toBeVisible();
  await expect(page.locator(".sh-name").first()).toContainText("52-47A", { timeout: 15_000 });
  expect(errors).toEqual([]);
});
