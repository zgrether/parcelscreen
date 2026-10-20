/**
 * "What matters to you" (/priorities; "My rubric" until 10/18) (step 3, docs/plans/step-3-rubric-editor.md §10 PR 2): the four columns; a card's sheet and its Move to…;
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
  await page.goto("/priorities");
  await expect(column(page, "Really want").locator(".rubric-card")).toHaveCount(7);
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
  await expect(names(column(page, "Must have"))).toHaveText([
    "Floodplain",
    "Legal road access",
    "Driveway on your land",
    "Septic",
  ]);
  await expect(column(page, "Don't care")).toHaveText(/Driveway/);
  await card(page, "Septic").locator(".rubric-card-body").click();
  await expect(sheet(page)).toContainText("On the starting list.");
  // A dealbreaker can't rank.
  await expect(sheet(page).getByRole("button", { name: "Really want" })).toBeDisabled();
  await sheet(page).getByRole("button", { name: "Don't care" }).click();
  await expect(names(column(page, "Don't care"))).toHaveText(["Septic", "Driveway"]);
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(names(column(page, "Must have"))).toContainText(["Septic"]);
  await expect(column(page, "Don't care")).toHaveText(/Driveway/);
  expect(errors).toEqual([]);
});

test("a row on Must: a minimum too, its ranked card stays, marked min", async ({ page }) => {
  await openRubric(page);
  await card(page, "Town and hospital").locator(".rubric-card-body").click();
  await sheet(page).getByRole("button", { name: "Must have" }).click();
  await expect(page.locator(".rubric-status")).toHaveText(
    "Town and hospital is now a must have too (ER within 30 min): it also stays at #7 in Really want.",
  );
  await page.keyboard.press("Escape");
  await expect(column(page, "Must have").locator(".rubric-card.minimum")).toContainText("ER within 30 min");
  await expect(column(page, "Really want").locator(".rubric-min-badge")).toHaveText("also a limit");
  await expect(names(column(page, "Really want"))).toHaveCount(7);
  expect(errors).toEqual([]);
});

test("the first reorder by dragging: applied at once, the notice's table, its Undo, gone at the next change", async ({
  page,
}) => {
  await openRubric(page);
  await drag(page, card(page, "Night sky"), card(page, "Best homesite"));
  await expect(names(column(page, "Really want"))).toHaveText([
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
  await expect(names(column(page, "Really want")).nth(3)).toHaveText("Night sky");
  // Again, then another change: the notice goes.
  await drag(page, card(page, "Night sky"), card(page, "Best homesite"));
  await expect(notice).toBeVisible();
  await card(page, "Town and hospital").locator(".rubric-card-body").click();
  await sheet(page).getByRole("button", { name: "Nice to have" }).click();
  await page.keyboard.press("Escape");
  await expect(notice).toHaveCount(0);
  await expect(names(column(page, "Nice to have"))).toHaveText(["Town and hospital"]);
  expect(errors).toEqual([]);
});

test("a slider moves the band and the words; Reset puts today's card back", async ({ page }) => {
  await openRubric(page);
  await card(page, "Elevation at the build site").locator(".rubric-card-body").click();
  await sheet(page).getByRole("slider").fill("3000");
  await expect(sheet(page)).toContainText("A 3,500 ft+ · B 3,000 ft · C 2,500 ft · D 2,000 ft");
  await page.keyboard.press("Escape");
  await expect(card(page, "Elevation at the build site")).toContainText("3,000 ft or higher");
  await page.getByRole("button", { name: "Reset to the starting list" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Reset to the starting list? This undoes all your changes.");
  await confirm.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(card(page, "Elevation at the build site")).toContainText("2,500 ft or higher");
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
  await visit(page, "/priorities");
  for (const row of ["Elevation at the build site", "Best homesite", "Room to build"]) {
    await card(page, row).locator(".rubric-card-body").click();
    await sheet(page).getByRole("button", { name: "Don't care" }).click();
    await page.keyboard.press("Escape");
  }
  await visit(page, "/library");
  await expect(grade).not.toHaveText(before!);
  await expect(page.locator(".lib-table")).not.toContainText("Needs a re-screen");
  expect(errors).toEqual([]);
});

test("Try it: the sample when nothing is screened, following a held card before it's dropped; no points", async ({
  page,
}) => {
  await openRubric(page);
  const preview = page.getByRole("region", { name: "Try it" });
  await expect(preview.locator("select")).toHaveValue("sample");
  await expect(preview).toContainText(/B\s*·\s*Contender/);
  await expect(preview).toContainText("Try it on");
  // Held over Best homesite, not dropped: the strip already shows what the drop would make.
  const a = (await card(page, "Night sky").locator(".rubric-handle").boundingBox())!;
  const b = (await card(page, "Best homesite").boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 8, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + 8, { steps: 12 });
  await expect(preview).toContainText("If you drop it here");
  await expect(preview).toContainText(/B\s*→\s*A\s*·\s*Contender/);
  await page.mouse.up();
  await page.waitForTimeout(100);
  await expect(preview).not.toContainText("If you drop it here");
  await expect(preview.locator(".rubric-reasons li")).toHaveCount(2);
  await expect(preview.locator(".rubric-reasons")).toContainText("Night sky now counts more");
  await expect(preview).not.toContainText(/\d\.\d/);
  // The notice's table has the sample's letter and verdict too, and no points (owner, 10/18).
  await page.locator(".rubric-notice").getByRole("button", { name: "See what changed" }).click();
  const notice = page.locator(".rubric-notice");
  await expect(notice).toContainText(/Sample: Mud Creek.*B · Contender → A · Contender/);
  await expect(notice).not.toContainText(/\d\.\d\d/);
  expect(errors).toEqual([]);
});

test("Try it on the open parcel: a dealbreaker that warned, no longer checked, comes first", async ({
  page,
  context,
}) => {
  await replayHar(context, FERNEY);
  await openExplorer(page, FERNEY);
  await importParcels(page, [FERNEY]);
  await seedScreens(page, [FERNEY]);
  await visit(page, "/priorities");
  const preview = page.getByRole("region", { name: "Try it" });
  await expect(preview.locator("select option").first()).toContainText("Ferney");
  await expect(preview.locator("select")).not.toHaveValue("sample");
  await card(page, "Legal road access").locator(".rubric-card-body").click();
  await sheet(page).getByRole("button", { name: "Don't care" }).click();
  await page.keyboard.press("Escape");
  await expect(preview.locator(".rubric-reasons li").first()).toHaveText(
    "Legal road access no longer checked",
  );
  expect(errors).toEqual([]);
});

test("the keyboard: Space picks a card up, the arrows move it, Space puts it down", async ({ page }) => {
  await openRubric(page);
  const handle = card(page, "Night sky").locator(".rubric-handle");
  await handle.focus();
  await page.keyboard.press("Space");
  // dnd-kit's keyboard sensor listens for the arrows only from the next task after the pick-up.
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(50);
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(50);
  await page.keyboard.press("Space");
  await expect(names(column(page, "Really want")).nth(2)).toHaveText("Night sky");
  await expect(page.locator(".rubric-notice")).toContainText("Your order now sets the weights.");
  expect(errors).toEqual([]);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test("stacked tiers; tap a card, Move to…; 44 px targets; nothing scrolls sideways; Try it along the bottom", async ({
    page,
  }) => {
    await openRubric(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const must = (await column(page, "Must have").boundingBox())!,
      should = (await column(page, "Really want").boundingBox())!;
    expect(should.y).toBeGreaterThan(must.y + must.height - 1); // stacked, not side by side
    for (const el of [
      card(page, "Septic").locator(".rubric-handle"),
      card(page, "Septic").locator(".rubric-card-body"),
    ])
      expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await card(page, "Septic").locator(".rubric-card-body").tap();
    for (const b of await sheet(page).locator(".rubric-moveto button").all())
      expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await sheet(page).getByRole("button", { name: "Don't care" }).tap();
    await page.keyboard.press("Escape");
    await expect(names(column(page, "Don't care"))).toHaveText(["Septic", "Driveway"]);
    // Try it is a bar along the bottom, with the same words as on a desktop.
    const bar = page.getByRole("region", { name: "Try it" });
    await expect(bar).toBeVisible();
    const box = (await bar.boundingBox())!;
    // Along the bottom, on the tab bar (step 4b), as the map's sheet is.
    const tabs = (await page.locator(".app-nav").boundingBox())!;
    expect(box.y + box.height).toBeCloseTo(tabs.y, 0);
    await expect(bar.locator("select")).toBeVisible();
    expect((await bar.locator("select").boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(bar).toContainText("Septic no longer checked");
    expect(errors).toEqual([]);
  });

  test("a swipe over the cards scrolls the page and never drags a card", async ({ page }) => {
    await openRubric(page);
    const before = await names(page.locator(".rubric-columns")).allTextContents();
    // A card well above the preview bar along the bottom.
    const box = (await card(page, "Driveway on your land").locator(".rubric-card-body").boundingBox())!;
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let i = 1; i <= 10; i++)
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - i * 30 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    // The page scrolls inside its <main> (.compare), as the Library and the rulebook do.
    await expect
      .poll(() => page.evaluate(() => document.querySelector("main.rubric-editor")!.scrollTop))
      .toBeGreaterThan(0);
    expect(await names(page.locator(".rubric-columns")).allTextContents()).toEqual(before);
    await expect(page.locator(".rubric-notice")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
