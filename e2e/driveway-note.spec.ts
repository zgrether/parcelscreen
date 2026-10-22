/**
 * The Driveway row added once to priorities saved before step 7 (owner, #216): at the next start it's in the tier
 * question 10's answer implies, What matters says so once, and its Undo puts it back in Don't care for good.
 */
import { expect, test, type Page } from "@playwright/test";
import { defaultRubric } from "../lib/rubric/default";
import type { Rubric } from "../lib/rubric/types";
import { booted, openExplorer, visit } from "./flow";

const FERNEY = "ferney-creek-52-47A" as const;

/** Priorities as saved before step 7: rank-sum, with no Driveway row and no Driveway band. */
function savedBefore(): Rubric {
  const r = defaultRubric();
  const { drivewayPct: _without, ...bands } = r.bands;
  return {
    ...r,
    bands,
    weights: { mode: "rankSum" },
    ranked: [
      { factor: "trails", tier: "should" },
      { factor: "sky", tier: "should" },
      { factor: "elevation", tier: "should" },
      { factor: "homesite", tier: "could" },
    ],
    wonts: ["room", "town", "garden"],
  } as unknown as Rubric;
}

/** Writes this profile's priorities and answers as an older version saved them, then starts again. */
async function seed(page: Page, driveway: "gentle" | null): Promise<void> {
  await booted(page);
  await page.evaluate(
    ({ mine, driveway }) => {
      const kv = window.__psKv!;
      kv.setItem("ps.rubrics", JSON.stringify({ mine, others: [] }));
      kv.setItem(
        "ps.interview",
        JSON.stringify({
          v: 2,
          state: "done",
          at: 15,
          answers: driveway ? { trails: "door", driveway } : { trails: "door" },
          base: mine,
        }),
      );
    },
    { mine: savedBefore(), driveway },
  );
}

const column = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const names = (page: Page, name: string) => column(page, name).locator(".rubric-card-name");

test("Long and gentle: Driveway at the bottom of Really want, the note once, and its Undo", async ({
  page,
}) => {
  await openExplorer(page, FERNEY);
  await seed(page, "gentle");
  await visit(page, "/priorities");
  const note = page.locator(".rubric-new");
  await expect(note).toHaveText(/New: Driveway, placed from your answer about steep drives\./);
  await expect(column(page, "Really want").locator(".rubric-card").last()).toContainText("Driveway");
  // Nothing else moved; step 11's Internet joins Nice to have, its default tier.
  await expect(names(page, "Nice to have")).toHaveText(["Best homesite", "Satellite internet"]);

  // Undo: back in Don't care, and the next start doesn't add it again or show the note.
  await note.getByRole("button", { name: "Undo" }).click();
  await expect(note).toHaveCount(0);
  await expect(column(page, "Don't care")).toContainText("Driveway");
  await visit(page, "/priorities");
  await expect(page.locator(".rubric-new")).toHaveCount(0);
  await expect(column(page, "Don't care")).toContainText("Driveway");
});

test("unanswered: the bottom of Nice to have; the note shows once", async ({ page }) => {
  await openExplorer(page, FERNEY);
  await seed(page, null);
  await visit(page, "/priorities");
  await expect(page.locator(".rubric-new")).toContainText("you skipped the question about steep drives");
  // The bottom of Nice to have, then step 11's Internet, added after it.
  await expect(names(page, "Nice to have")).toHaveText(["Best homesite", "Driveway", "Satellite internet"]);
  await page.locator(".rubric-new").getByRole("button", { name: "OK" }).click();
  await visit(page, "/priorities");
  await expect(page.locator(".rubric-new")).toHaveCount(0);
  await expect(names(page, "Nice to have")).toHaveText(["Best homesite", "Driveway", "Satellite internet"]);
});
