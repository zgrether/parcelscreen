/**
 * "My rubric" (step 3, docs/plans/step-3-rubric-editor.md §10 PR 2): the four columns; a card's sheet and its Move to…;
 * a row on Must as a minimum, its ranked card marked "min"; the first reorder by dragging, which applies at once with
 * the notice (See what changed, Undo, gone at the next change); a slider; Reset; and the Library re-grading at once,
 * with nothing asking for a re-screen. A production build; the fixtures replayed where a parcel is needed.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { importParcels, openExplorer, seedScreens, visit } from "./flow";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A" as const;

let errors: string[] = [];
test.beforeEach(({ page }) => {
  errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
});

async function openRubric(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("e2e")) return;
    sessionStorage.setItem("e2e", "1");
    localStorage.clear();
    localStorage.setItem("ps.debug", "1");
  });
  await page.goto("/rubric");
  await expect(column(page, "Should").locator(".rubric-card")).toHaveCount(7);
}

const column = (page: Page, name: string): Locator => page.getByRole("region", { name, exact: true });
const names = (col: Locator) => col.locator(".rubric-card-name");
const card = (page: Page, name: string): Locator =>
  page.locator(".rubric-card", { has: page.locator(".rubric-card-name", { hasText: name }) }).first();
const sheet = (page: Page) => page.getByRole("dialog");

/** Drags a card by its handle onto another card, in small steps so dnd-kit sees a drag. */
async function drag(page: Page, from: Locator, to: Locator): Promise<void> {
  const a = (await from.locator(".rubric-handle").boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 8, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + 8, { steps: 12 });
  await page.mouse.up();
  // dnd-kit swallows clicks for 50 ms after a drop (its sensor detach), so the drop's own click can't open the card.
  await page.waitForTimeout(100);
}

test("the columns, a card's Move to…, and Undo", async ({ page }) => {
  await openRubric(page);
  await expect(names(column(page, "Must"))).toHaveText([
    "Floodplain",
    "Legal road access",
    "Easement needed",
    "Septic",
  ]);
  await expect(column(page, "Won't")).toContainText("Everything counts.");
  await card(page, "Septic").locator(".rubric-card-body").click();
  await expect(sheet(page)).toContainText("From the default card");
  // A dealbreaker can't rank.
  await expect(sheet(page).getByRole("button", { name: "Should" })).toBeDisabled();
  await sheet(page).getByRole("button", { name: "Won't" }).click();
  await expect(names(column(page, "Won't"))).toHaveText(["Septic"]);
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(names(column(page, "Must"))).toContainText(["Septic"]);
  await expect(column(page, "Won't")).toContainText("Everything counts.");
  expect(errors).toEqual([]);
});

test("a row on Must: a minimum too, its ranked card stays, marked min", async ({ page }) => {
  await openRubric(page);
  await card(page, "Town and hospital").locator(".rubric-card-body").click();
  await sheet(page).getByRole("button", { name: "Must" }).click();
  await expect(page.locator(".rubric-status")).toHaveText(
    "Town and hospital is now a minimum too (ER within 30 min): its card stays at #7 in Should, marked min.",
  );
  await page.keyboard.press("Escape");
  await expect(column(page, "Must").locator(".rubric-card.minimum")).toContainText("ER within 30 min");
  await expect(card(page, "Town and hospital").locator(".rubric-min-badge")).toHaveText("min");
  await expect(names(column(page, "Should"))).toHaveCount(7);
  expect(errors).toEqual([]);
});

test("the first reorder by dragging: applied at once, the notice's table, its Undo, gone at the next change", async ({
  page,
}) => {
  await openRubric(page);
  await drag(page, card(page, "Night sky"), card(page, "Best homesite"));
  await expect(names(column(page, "Should"))).toHaveText([
    "Elevation at the build site",
    "Night sky",
    "Best homesite",
    "Room to build",
    "Trails and public land",
    "Garden ground",
    "Town and hospital",
  ]);
  const notice = page.locator(".rubric-notice");
  await expect(notice).toContainText("Your order now sets the weights.");
  await notice.getByRole("button", { name: "See what changed" }).click();
  await expect(notice.locator("tr", { hasText: "Night sky" })).toContainText(/10(\.0)?%\s*21\.4%/);
  await notice.getByRole("button", { name: "Undo" }).click();
  await expect(notice).toHaveCount(0);
  await expect(names(column(page, "Should")).nth(3)).toHaveText("Night sky");
  await expect(card(page, "Night sky").locator(".rubric-card-rank")).toHaveText("#4 · 10%");
  // Again, then another change: the notice goes.
  await drag(page, card(page, "Night sky"), card(page, "Best homesite"));
  await expect(notice).toBeVisible();
  await card(page, "Town and hospital").locator(".rubric-card-body").click();
  await sheet(page).getByRole("button", { name: "Could" }).click();
  await page.keyboard.press("Escape");
  await expect(notice).toHaveCount(0);
  await expect(names(column(page, "Could"))).toHaveText(["Town and hospital"]);
  expect(errors).toEqual([]);
});

test("a slider moves the band and the words; Reset puts today's card back", async ({ page }) => {
  await openRubric(page);
  await card(page, "Elevation at the build site").locator(".rubric-card-body").click();
  await sheet(page).getByRole("slider").fill("3000");
  await expect(sheet(page)).toContainText("A 3,500 ft+ · B 3,000 ft · C 2,500 ft · D 2,000 ft");
  await page.keyboard.press("Escape");
  await expect(card(page, "Elevation at the build site")).toContainText("Build site at 3,000 ft or higher");
  await page.getByRole("button", { name: "Reset to default" }).click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(card(page, "Elevation at the build site")).toContainText("Build site at 2,500 ft or higher");
  expect(errors).toEqual([]);
});

test("a change re-grades the Library at once, and nothing asks for a re-screen", async ({
  page,
  context,
}) => {
  await replayHar(context, FERNEY);
  await openExplorer(page, FERNEY);
  await importParcels(page, [FERNEY]);
  await seedScreens(page, [FERNEY]);
  await visit(page, "/library");
  const grade = page.locator(".lib-table tbody tr").first().locator("td").nth(7);
  await expect(grade).toHaveText(/^[A-F]/);
  const before = await grade.textContent();
  await visit(page, "/rubric");
  for (const row of ["Elevation at the build site", "Best homesite", "Room to build"]) {
    await card(page, row).locator(".rubric-card-body").click();
    await sheet(page).getByRole("button", { name: "Won't" }).click();
    await page.keyboard.press("Escape");
  }
  await visit(page, "/library");
  await expect(grade).not.toHaveText(before!);
  await expect(page.locator(".lib-table")).not.toContainText("Needs a re-screen");
  expect(errors).toEqual([]);
});

test("the preview: the sample when nothing is screened, following a held card before it's dropped", async ({
  page,
}) => {
  await openRubric(page);
  const preview = page.getByRole("complementary", { name: "Preview" });
  await expect(preview.locator("select")).toHaveValue("sample");
  await expect(preview).toContainText(/B\s*Contender/);
  // Held over Best homesite, not dropped: the preview already shows what the drop would make.
  const a = (await card(page, "Night sky").locator(".rubric-handle").boundingBox())!;
  const b = (await card(page, "Best homesite").boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 8, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + 8, { steps: 12 });
  await expect(preview).toContainText("(if you drop it here)");
  await expect(preview).toContainText(/B\s*Contender\s*→\s*A\s*Contender/);
  await page.mouse.up();
  await page.waitForTimeout(100);
  await expect(preview).not.toContainText("(if you drop it here)");
  await expect(preview.locator(".rubric-moved li")).toHaveCount(2);
  // The notice's table has the sample's points too.
  await page.locator(".rubric-notice").getByRole("button", { name: "See what changed" }).click();
  await expect(page.locator(".rubric-notice")).toContainText(
    // Rank weights with Night sky moved up: 3.54 (the default order alone would be 3.50).
    /Sample: Mud Creek.*3\.45 B · Contender → 3\.54 A · Contender/,
  );
  expect(errors).toEqual([]);
});

test("the preview on the open parcel: a dealbreaker that warned, moved to Won't, comes first", async ({
  page,
  context,
}) => {
  await replayHar(context, FERNEY);
  await openExplorer(page, FERNEY);
  await importParcels(page, [FERNEY]);
  await seedScreens(page, [FERNEY]);
  await visit(page, "/rubric");
  const preview = page.getByRole("complementary", { name: "Preview" });
  await expect(preview.locator("select option").first()).toContainText("Ferney");
  await expect(preview.locator("select")).not.toHaveValue("sample");
  await card(page, "Legal road access").locator(".rubric-card-body").click();
  await sheet(page).getByRole("button", { name: "Won't" }).click();
  await page.keyboard.press("Escape");
  await expect(preview.locator(".rubric-moved li").first()).toHaveText(/Legal road access\s*\(now a Won't\)/);
  expect(errors).toEqual([]);
});
