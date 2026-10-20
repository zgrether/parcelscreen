/**
 * A new profile starts with the interview (step 4, docs/plans/step-4-interview.md §6, PR 3): a first visit goes to
 * the name screen from any page, and back there until it's finished or put off with "Not now"; the menu offers
 * "Answer a few questions (about 4 min)" while there are no answers, and the priorities page "Finish your questions (n of
 * 14)" or "Answer the questions again" (owner, 10/18); on the priorities page, the why lines
 * quote the answers, "Reset to my answers" asks first, and the quiet list shows. A production build. These specs ask
 * to be sent to the interview (`ps.onboard`), as a person's browser always is.
 */
import { expect, test, type Page } from "@playwright/test";
import { openMenu } from "./flow";

let errors: string[] = [];
test.beforeEach(({ page }) => {
  errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
});

/** A first visit, as a person's: no debug handle, and onboarding on. */
async function firstVisit(page: Page, path: string, onboard = true): Promise<void> {
  await page.addInitScript((onboard) => {
    if (sessionStorage.getItem("e2e")) return;
    sessionStorage.setItem("e2e", "1");
    localStorage.clear();
    if (onboard) localStorage.setItem("ps.onboard", "1");
  }, onboard);
  await page.goto(path);
}

const progress = (page: Page) => page.locator(".iv-progress");

test("a first visit starts with the name, comes back until put off, and Not now lets it go", async ({
  page,
}) => {
  await firstVisit(page, "/explore");
  await page.waitForURL("**/interview");
  await expect(page.locator(".iv-scene")).toHaveText("What should we call you?");
  await page.getByPlaceholder("Your name or a nickname").fill("Sam");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(progress(page)).toHaveText("1 of 14");
  await page.getByRole("radio", { name: "Cool and snowy" }).click();
  await expect(progress(page)).toHaveText("2 of 14");

  // Any other page sends the profile back, to the question it left.
  await page.goto("/library");
  await page.waitForURL("**/interview");
  await expect(progress(page)).toHaveText("2 of 14");

  await page.getByRole("button", { name: "Not now" }).click();
  await page.waitForURL("**/explore");
  await page.reload();
  await expect(page).toHaveURL(/\/explore$/);
  const drawer = await openMenu(page);
  await expect(drawer.getByRole("button", { name: "Switch profile" })).toHaveText(/Sam/);
  // Answered in part: not in the menu, but on the priorities page.
  await expect(drawer.getByRole("link", { name: /questions/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "What matters", exact: true }).click();
  await page.waitForURL("**/priorities");
  await expect(
    page.locator(".rubric-bar-actions").getByRole("link", { name: "Finish your questions (2 of 14)" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("an existing profile: offered, never sent; the why lines, Reset to my answers and the quiet list", async ({
  page,
}) => {
  // Onboarding off (as for every other spec): the first visit isn't sent anywhere.
  await firstVisit(page, "/explore", false);
  await expect(page).toHaveURL(/\/explore$/);
  const drawer = await openMenu(page);
  await drawer.getByRole("link", { name: "Answer a few questions (about 4 min)" }).click();
  await page.waitForURL("**/interview");
  // Not a new profile's interview: no "Not now".
  await expect(page.getByRole("button", { name: "Not now" })).toHaveCount(0);
  await page.getByRole("radio", { name: "Cool and snowy" }).click();
  await expect(progress(page)).toHaveText("2 of 14");
  for (let n = 3; n <= 6; n++) {
    await page.getByRole("button", { name: "Skip" }).click();
    await expect(progress(page)).toHaveText(`${n} of 14`);
  }
  await page.getByRole("radio", { name: "30 min" }).click();
  await expect(progress(page)).toHaveText("7 of 14");
  for (let i = 0; i < 9; i++) await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.locator(".iv-scene")).toHaveText("What matters to you");

  await page.getByRole("link", { name: "Fine-tune in What matters to you" }).click();
  await page.waitForURL("**/priorities");
  await expect(page.locator("main")).not.toContainText("Counts once the app measures it");
  const town = page.locator(".rubric-card", { hasText: "Town and hospital" }).first();
  await town.locator(".rubric-card-body").click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toContainText("You'd want an ER within 30 minutes");
  await expect(sheet).not.toContainText(/Question \d/);
  await sheet.getByRole("button", { name: "Nice to have" }).click();
  await expect(sheet).toContainText("You moved this here.");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Reset to my answers" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Reset to your answers? This undoes the changes you made since.");
  await confirm.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Really want", exact: true }).locator(".rubric-card-name"),
  ).toContainText(["Town and hospital"]);
  await expect(
    page.locator(".rubric-bar-actions").getByRole("link", { name: "Answer the questions again" }),
  ).toBeVisible();
  // Answered: the menu no longer offers the questions.
  await page.goto("/explore");
  const menu = await openMenu(page);
  await expect(menu.getByRole("link", { name: /questions/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});
