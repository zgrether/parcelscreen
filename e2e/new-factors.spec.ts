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

/** Writes this profile's priorities as an older version saved them, then starts again. */
async function seed(page: Page): Promise<void> {
  await booted(page);
  await page.evaluate(
    (mine) => {
      const kv = window.__psKv!;
      kv.setItem("ps.rubrics", JSON.stringify({ mine, others: [], drivewayAdded: "seen" }));
    },
    savedBefore(),
  );
}

const column = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const names = (page: Page, name: string) => column(page, name).locator(".rubric-card-name");

test("Hospital just after Town, Town's ER limit with it, one notice, and its Undo", async ({ page }) => {
  await openExplorer(page, FERNEY);
  await seed(page);
  await visit(page, "/priorities");
  const notice = page.locator(".rubric-new-factors");
  await expect(notice).toContainText("New factors to place: Hospital");
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
