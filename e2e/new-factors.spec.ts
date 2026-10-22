/**
 * Step 11's new factors added once to priorities saved before them (docs/plans/step-11-new-data.md §1, §5): at the
 * next start each is placed (Hospital just after Town, which graded the ER until then), What matters lists them once
 * in one notice, and its Undo puts them in Don't care for good. The card grades Hospital as its own row.
 */
import { expect, test, type Page } from "@playwright/test";
import { defaultRubric } from "../lib/rubric/default";
import type { Rubric } from "../lib/rubric/types";
import { booted, openExplorer, visit } from "./flow";

const FERNEY = "ferney-creek-52-47A" as const;

/** Priorities as saved before step 11: rank-sum, Town in Really want with an ER limit, no Hospital. */
function savedBefore(): Rubric {
  const r = defaultRubric();
  return {
    ...r,
    weights: { mode: "rankSum" },
    musts: [...r.musts, { factor: "town", threshold: 50 }],
    ranked: [
      { factor: "trails", tier: "should" },
      { factor: "town", tier: "should" },
      { factor: "elevation", tier: "should" },
      { factor: "homesite", tier: "could" },
    ],
    wonts: ["room", "sky", "garden", "driveway"],
  };
}

/** Writes this profile's priorities (and its answers) as an older version saved them, then starts again. */
async function seed(page: Page, answers?: Record<string, string>): Promise<void> {
  await booted(page);
  await page.evaluate(
    ({ mine, answers }) => {
      const kv = window.__psKv!;
      kv.setItem("ps.rubrics", JSON.stringify({ mine, others: [], drivewayAdded: "seen" }));
      if (answers)
        kv.setItem("ps.interview", JSON.stringify({ v: 2, state: "done", at: 15, answers, base: mine }));
    },
    { mine: savedBefore(), answers },
  );
}

const column = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const names = (page: Page, name: string) => column(page, name).locator(".rubric-card-name");

test("Hospital just after Town, Town's ER limit with it, one notice, and its Undo", async ({ page }) => {
  await openExplorer(page, FERNEY);
  await seed(page);
  await visit(page, "/priorities");
  const notice = page.locator(".rubric-new-factors");
  await expect(notice).toContainText(
    "New factors to place: Hospital, Climate, Privacy, Long view, Airport, Bike to a long trail, Internet",
  );
  await expect(names(page, "Really want")).toHaveText([
    "Trails and public land",
    "Town and groceries",
    /^Hospital/, // with its "also a limit" badge
    "Elevation at the build site",
  ]);
  // The ER limit Town held is Hospital's.
  await expect(column(page, "Must have").locator(".rubric-card.minimum")).toContainText("Hospital");
  await expect(column(page, "Must have").locator(".rubric-card.minimum")).toContainText("ER within 50 min");

  // Undo: Hospital in Don't care, and the next start adds nothing and shows no notice.
  await notice.getByRole("button", { name: "Undo" }).click();
  await expect(notice).toHaveCount(0);
  await expect(column(page, "Don't care")).toContainText("Hospital");
  await expect(column(page, "Don't care")).toContainText("Climate");
  await visit(page, "/priorities");
  await expect(page.locator(".rubric-new-factors")).toHaveCount(0);
  await expect(names(page, "Really want")).toHaveText([
    "Trails and public land",
    "Town and groceries",
    "Elevation at the build site",
  ]);
});

test("OK: the notice shows once, and Hospital stays where it was placed", async ({ page }) => {
  await openExplorer(page, FERNEY);
  await seed(page);
  await visit(page, "/priorities");
  await page.locator(".rubric-new-factors").getByRole("button", { name: "OK" }).click();
  await visit(page, "/priorities");
  await expect(page.locator(".rubric-new-factors")).toHaveCount(0);
  await expect(names(page, "Really want")).toContainText(["Hospital"]);
});

test("Climate from question 1, and its new questions asked on their own", async ({ page }) => {
  await openExplorer(page, FERNEY);
  await seed(page, { climate: "cool" });
  await visit(page, "/priorities");
  // Cool and snowy: Climate at the bottom of Really want.
  await expect(names(page, "Really want").last()).toHaveText("Climate");
  const notice = page.locator(".rubric-new-factors");
  await notice.getByRole("link", { name: "Answer the new questions" }).click();
  await page.waitForURL("**/interview?ask=climate");
  await expect(page.locator(".iv-progress")).toHaveText("A new question");
  // Its follow-ups, preset from the year; a change, then Continue, back to What matters.
  const follow = page.locator(".iv-follow");
  await expect(follow.getByRole("radio", { name: "Real winter welcome" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await follow.getByRole("radio", { name: "Mild" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/priorities");
  await expect(names(page, "Really want").last()).toHaveText("Climate");
  await page.locator(".rubric-card", { hasText: "Climate" }).first().locator(".rubric-card-body").click();
  await expect(page.getByRole("dialog")).toContainText("January lows of 24 °F or milder");
  await page.keyboard.press("Escape");
  // "Either is fine" puts it in Don't care.
  await visit(page, "/interview?ask=climate");
  await page.getByRole("radio", { name: "Either is fine" }).click();
  await page.waitForURL("**/priorities");
  await expect(column(page, "Don't care")).toContainText("Climate");
});
