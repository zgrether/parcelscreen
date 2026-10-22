/**
 * Help (step 4b): one page, the report's notes then how grades work (the rulebook, VR7; #118 review). A smoke test.
 * Opened from the menu, both sections and every rulebook heading render; with nothing screened it says how to get a
 * breakdown; after a fixture parcel is screened on the map, the breakdown bar shows that parcel's card grade; a report
 * section's "?" opens its notes in the dialog, whose "All of Help" goes to the page; an old /rulebook#rule-… link lands
 * on its rule; and at 375 px nothing scrolls sideways.
 */
import { expect, test, type Page } from "@playwright/test";
import { reportCard } from "@/lib/report/card";
import { expectedOf } from "../test/support/expected";
import { ZACH } from "../test/support/rubrics";
import { expectAllDone, importParcel, openExplorer, openMenu, reload, screenIt } from "./flow";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A" as const;

const HEADINGS = [
  "Help",
  "Reading a parcel's report",
  "How grades work",
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
  await (await openMenu(page)).getByRole("link", { name: "Help", exact: true }).click();
  await expect(page).toHaveURL(/\/help$/);
}

test("Help: from the menu, every section, a screened parcel's breakdown, no sideways scroll at 375 px", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const net = await replayHar(context, [FERNEY]);
  await openExplorer(page, FERNEY);

  // Nothing on the list yet: every section, and how to get a breakdown.
  await openRulebook(page);
  for (const h of HEADINGS) await expect(page.getByRole("heading", { name: h, exact: true })).toBeVisible();
  await expect(page.locator(".rule-breakdown")).toContainText(
    "Screen a parcel from the map and it shows here.",
  );
  await expect(page.locator(".rule-panel")).toHaveCount(20); // the verdict, 4 dealbreakers, 13 rows (step 11: Hospital, Climate, Privacy, Long view, Airport), within budget (step 10), cost to enjoy

  // Screen Ferney on the map, then back: its breakdown, at its card's grade.
  await page.getByRole("link", { name: "Map", exact: true }).click();
  await importParcel(page, FERNEY);
  expectAllDone(await screenIt(page));
  await openRulebook(page);
  const grade = reportCard(expectedOf(FERNEY, "run"), ZACH).grade!;
  await expect(page.locator(".rule-breakdown > p .card-grade")).toHaveText(grade);
  await expect(page.locator(".bd-track")).toBeVisible();
  await expect(page.locator(".bd-table tbody tr")).toHaveCount(7);

  // A report section's "?": its notes in the dialog, over the parcel; "All of Help" goes to the page.
  await page.getByRole("link", { name: "Map", exact: true }).click();
  await page.locator(".card-row", { hasText: "Night sky" }).click();
  await page
    .locator(".card-panel")
    .getByRole("button", { name: /^What does .* mean\?$/ })
    .first()
    .click();
  const dialog = page.locator("dialog.help-dialog[open]");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("link", { name: "All of Help" }).click();
  await expect(page).toHaveURL(/\/help$/);
  await expect(page.locator("dialog.help-dialog[open]")).toHaveCount(0);

  // An old link to a rule: redirected to Help, at that rule.
  await page.goto("/rulebook#rule-trails");
  await expect(page).toHaveURL(/\/help#rule-trails$/);
  await expect(page.locator("#rule-trails h4")).toHaveText("Trails and public land");
  await expect(page.locator("#rule-trails")).toBeInViewport();

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
