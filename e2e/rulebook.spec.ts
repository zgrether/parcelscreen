/**
 * The rulebook, "What the grade means" (VR7; #118 review): a smoke test. Opened from the menu, every section heading
 * renders; with nothing screened it says how to get a breakdown; after a fixture parcel is screened on the map, the
 * breakdown bar shows that parcel's card grade; and at 375 px nothing scrolls sideways.
 */
import { expect, test, type Page } from "@playwright/test";
import { reportCard } from "@/lib/report/card";
import { expectedOf } from "../test/support/expected";
import { ZACH } from "../test/support/rubrics";
import { expectAllDone, importParcel, openExplorer, reload, screenIt } from "./flow";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A" as const;

const HEADINGS = [
  "What the grade means",
  "A parcel's grade, row by row",
  "The parcel grade",
  "Weights",
  "Dealbreakers",
  "The graded rows",
  "The homesite grade",
  "Quality",
  "What it costs to build there",
];

async function openRulebook(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("link", { name: "What the grade means" }).click();
  await expect(page).toHaveURL(/\/rulebook$/);
}

test("the rulebook: from the menu, every section, a screened parcel's breakdown, no sideways scroll at 375 px", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const net = await replayHar(context, [FERNEY]);
  await openExplorer(page, FERNEY);

  // Nothing in History yet: every section, and how to get a breakdown.
  await openRulebook(page);
  for (const h of HEADINGS) await expect(page.getByRole("heading", { name: h, exact: true })).toBeVisible();
  await expect(page.locator(".rule-breakdown")).toContainText(
    "Screen a parcel from the map and it shows here.",
  );
  await expect(page.locator(".rule-panel")).toHaveCount(13); // the verdict, 4 dealbreakers, 7 rows, cost to enjoy

  // Screen Ferney on the map, then back: its breakdown, at its card's grade.
  await page.getByRole("link", { name: "← Map" }).click();
  await importParcel(page, FERNEY);
  expectAllDone(await screenIt(page));
  await openRulebook(page);
  const grade = reportCard(expectedOf(FERNEY, "run"), ZACH).grade!;
  await expect(page.locator(".rule-breakdown > p .card-grade")).toHaveText(grade);
  await expect(page.locator(".bd-track")).toBeVisible();
  await expect(page.locator(".bd-table tbody tr")).toHaveCount(7);

  // A phone: nothing wider than the screen.
  await page.setViewportSize({ width: 375, height: 812 });
  await reload(page);
  await expect(page.locator(".bd-track")).toBeVisible();
  const overflow = await page.evaluate(() => {
    const main = document.querySelector("main")!;
    return {
      page: document.documentElement.scrollWidth > window.innerWidth,
      main: main.scrollWidth > main.clientWidth,
    };
  });
  expect(overflow).toEqual({ page: false, main: false });

  expect(net.misses, "data requests the HAR doesn't have").toEqual([]);
  expect(errors).toEqual([]);
});
