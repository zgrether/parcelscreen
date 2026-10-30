/**
 * The interview (step 4, docs/plans/step-4-interview.md §1, §6–§7, PR 2): a full run as §4's Person A, with Back once
 * and Skip once; question 2's follow-up; 14a's stepper; the result ("What matters to you", Try it) and the
 * priorities page it saved; resuming after a reload; the keyboard; a changed list asks before it's replaced; and the
 * phone. A production build; no parcel is needed (Try it grades the Mud Creek sample).
 */
import { expect, test, type Page } from "@playwright/test";
import { settled } from "./flow";

let errors: string[] = [];
test.beforeEach(({ page }) => {
  errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
});

async function fresh(page: Page, path = "/interview"): Promise<void> {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("e2e")) return;
    sessionStorage.setItem("e2e", "1");
    localStorage.clear();
    localStorage.setItem("ps.debug", "1");
  });
  await page.goto(path);
}

const progress = (page: Page) => page.locator(".iv-progress");
const choice = (page: Page, name: string) => page.getByRole("radio", { name, exact: false });

/**
 * Question 1 (step 11): a year shows its two follow-ups, preset from it, and Continue goes on; "Either is fine" goes on
 * by itself.
 */
async function pickYear(page: Page, name: string): Promise<void> {
  await choice(page, name).first().click();
  if (name !== "Either is fine") await page.getByRole("button", { name: "Continue" }).click();
  await expect(progress(page)).toHaveText("2 of 14");
}

/** Picks a single choice and waits for the next screen. */
async function pick(page: Page, name: string, next: number): Promise<void> {
  await choice(page, name).first().click();
  await expect(progress(page)).toHaveText(`${next} of 14`);
}

test("a full run as Person A, with Back and Skip: the result, and the priorities it saved", async ({
  page,
}) => {
  await fresh(page);
  await expect(progress(page)).toHaveText("1 of 14");
  await expect(page.locator(".iv-scene")).toContainText("Which year sounds better");
  // Question 1's follow-ups (step 11): preset from the year, so Continue is the one more tap.
  await choice(page, "Cool and snowy").first().click();
  const follow = page.locator(".iv-follow");
  await expect(follow.getByRole("radio", { name: "Real winter welcome" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(follow.getByRole("radio", { name: "Keep it cool" })).toHaveAttribute("aria-checked", "true");
  await expect(progress(page)).toHaveText("1 of 14");
  await follow.getByRole("radio", { name: "Some snow" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(progress(page)).toHaveText("2 of 14");
  // Question 2: "Out with a camera" asks its follow-up on the same screen.
  await choice(page, "Out with a camera").click();
  await expect(page.locator(".iv-follow")).toContainText("A town's glow on one horizon");
  await expect(progress(page)).toHaveText("2 of 14");
  await pick(page, "Spoils it", 3);
  await pick(page, "Sun", 4);
  // Back keeps the pick, with Next in Skip's place; another pick waits, and the same pick again moves on.
  await page.getByRole("button", { name: "Back" }).click();
  await expect(progress(page)).toHaveText("3 of 14");
  await expect(choice(page, "Sun").first()).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("button", { name: "Next" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Skip" })).toHaveCount(0);
  await choice(page, "View").first().click();
  await page.waitForTimeout(500);
  await expect(progress(page)).toHaveText("3 of 14");
  await choice(page, "Sun").first().click();
  await expect(progress(page)).toHaveText("3 of 14");
  await pick(page, "Sun", 4);
  // Paddling (step 14d) shares question 4: "Rarely" hides its second row, and Continue goes on.
  await pick(page, "Walk out the door", 4);
  await choice(page, "Rarely").first().click();
  await expect(page.getByText("The longest you'd drive to a launch?")).toHaveCount(0);
  await page.getByRole("button", { name: "Continue" }).click();
  // Climbing (step 17) is question 4's third screen, its second row hidden the same way.
  await expect(progress(page)).toHaveText("4 of 14");
  await choice(page, "Rarely or never").first().click();
  await expect(page.getByText("The longest you'd drive for a day of climbing?")).toHaveCount(0);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(progress(page)).toHaveText("5 of 14");
  await pick(page, "Small and close", 6);
  await pick(page, "30 min", 7);
  // Question 7: two rows; Continue once both are answered (owner, 10/18).
  await expect(page.getByRole("button", { name: "Continue" })).toHaveCount(0);
  await choice(page, "Rarely or never").click();
  await choice(page, "Yes").click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(progress(page)).toHaveText("8 of 14");
  await pick(page, "Never know", 9);
  await pick(page, "A real kitchen garden", 10);
  await pick(page, "Long and gentle", 11);
  await pick(page, "No HOA or restrictions", 12);
  // Skip leaves question 12 out.
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(progress(page)).toHaveText("13 of 14");
  await choice(page, "20–50 acres").click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(progress(page)).toHaveText("14 of 14");
  // 14a: the elevation chip shows its number, 500 ft under question 1's edge.
  for (const chip of ["Flood zone", "An HOA", "Elevation below ___ ft", "No winter sun"])
    await page.getByRole("button", { name: chip, exact: true }).click();
  await expect(page.locator(".iv-stepper-value")).toHaveText("2,500 ft");
  await expect(page.locator(".iv-note")).toHaveCount(0);
  await page.getByRole("button", { name: "Continue" }).click();
  // 14b: without 14a's chips.
  await expect(page.locator(".iv-scene")).toHaveText("Which don't matter at all?");
  await expect(page.getByRole("button", { name: "Flood zone", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "See my priorities" }).click();

  // Headed as the priorities page is (owner, 10/18), and no quiet list.
  await expect(page.locator(".iv-scene")).toHaveText("What matters to you");
  const summary = page.getByRole("region", { name: "Your priorities" });
  await expect(summary).toContainText("Elevation at the build site: at least 2,500 ft");
  await expect(summary).toContainText("Best homesite: at least 3 h of December sun");
  await expect(summary.locator("ol").first().locator("li").first()).toContainText(
    "Elevation at the build site",
  );
  await expect(page.locator(".iv")).not.toContainText("Counts once the app measures it");
  await expect(page.locator(".iv")).not.toContainText("Try it grades a sample parcel");
  await expect(page.getByRole("region", { name: "Try it" })).toContainText("Try it on");
  await expect(page.getByText("Replace the priorities you changed?")).toHaveCount(0);
  // Back to 14b: it opens with its picks and the same one row (polish #27): See my priorities comes back here.
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("button", { name: "Next" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "See my priorities" })).toHaveCount(1);
  await page.getByRole("button", { name: "See my priorities" }).click();
  await expect(page.locator(".iv-scene")).toHaveText("What matters to you");

  await page.getByRole("link", { name: "Fine-tune in What matters to you" }).click();
  const should = page.getByRole("region", { name: "Really want", exact: true }).locator(".rubric-card-name");
  await expect(should.first()).toContainText("Elevation at the build site");
  await expect(should.first()).toContainText("also a limit");
  await expect(page.getByRole("region", { name: "Must have", exact: true })).toContainText(
    "Limit: at least 3 h of December sun",
  );
  expect(errors).toEqual([]);
});

test("leaving halfway resumes on the same screen", async ({ page }) => {
  await fresh(page);
  await pickYear(page, "In between");
  await pick(page, "Inside by the fire", 3);
  await pick(page, "Both", 4);
  await page.reload();
  await expect(progress(page)).toHaveText("4 of 14");
  await expect(page.locator(".iv-scene")).toContainText("Saturday morning");
  await page.getByRole("button", { name: "Back" }).click();
  await expect(choice(page, "Both").first()).toHaveAttribute("aria-checked", "true");
  expect(errors).toEqual([]);
});

test("the keyboard: 1–4 pick, the arrows move, Backspace goes back", async ({ page }) => {
  await fresh(page);
  await expect(page.locator(".iv-scene")).toBeFocused();
  // "Either is fine" (step 11: a year waits for its follow-ups) moves on by itself.
  await page.keyboard.press("4");
  await expect(progress(page)).toHaveText("2 of 14");
  await page.keyboard.press("Backspace");
  await expect(progress(page)).toHaveText("1 of 14");
  await expect(choice(page, "Either is fine")).toHaveAttribute("aria-checked", "true");
  await choice(page, "Either is fine").focus();
  await page.keyboard.press("ArrowUp");
  await expect(choice(page, "Warm and mild")).toBeFocused();
  // A screen that held an answer waits: Enter changes the pick, Enter on it again moves on.
  await page.keyboard.press("Enter");
  await expect(choice(page, "Warm and mild")).toHaveAttribute("aria-checked", "true");
  await expect(progress(page)).toHaveText("1 of 14");
  await page.keyboard.press("Enter");
  await expect(progress(page)).toHaveText("2 of 14");
  expect(errors).toEqual([]);
});

test("a changed list: the result asks, and Keep my changes keeps it", async ({ page }) => {
  await fresh(page, "/priorities");
  // Change the list first: Septic to Don't care.
  await page.locator(".rubric-card", { hasText: "Septic" }).first().locator(".rubric-card-body").click();
  await page.getByRole("dialog").getByRole("button", { name: "Don't care" }).click();
  await page.keyboard.press("Escape");
  // The change kept before the page goes (the profile's store writes through asynchronously).
  await settled(page);
  await page.goto("/interview");
  await pickYear(page, "Cool and snowy");
  // Paddling (step 14d) and Climbing (step 17) share question 4 with Trails, as 14a and 14b share 14.
  for (const n of [3, 4, 4, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]) {
    await page.getByRole("button", { name: "Skip" }).click();
    await expect(progress(page)).toHaveText(`${n} of 14`);
  }
  await page.getByRole("button", { name: "Skip" }).click(); // 14a
  await page.getByRole("button", { name: "See my priorities" }).click(); // 14b
  await expect(page.getByText("Replace the priorities you changed?")).toBeVisible();
  await page.getByRole("button", { name: "Keep my changes" }).click();
  await expect(page.getByText("Your priorities are as you left them.")).toBeVisible();
  await page.goto("/priorities");
  await expect(page.getByRole("region", { name: "Don't care", exact: true })).toContainText("Septic");
  expect(errors).toEqual([]);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });

  test("one question per screen, big targets, nothing scrolls sideways", async ({ page }) => {
    await fresh(page);
    for (const c of await page.getByRole("radio").all())
      expect((await c.boundingBox())!.height).toBeGreaterThanOrEqual(56);
    for (const name of ["Back", "Skip"])
      expect((await page.getByRole("button", { name }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // No scrolling on a question at 375 × 667: the Skip button is in view.
    const skip = (await page.getByRole("button", { name: "Skip" }).boundingBox())!;
    expect(skip.y + skip.height).toBeLessThanOrEqual(667);
    await choice(page, "Cool and snowy").tap();
    // Step 11: its follow-ups and Continue fit too.
    for (const c of await page.locator(".iv-follow").getByRole("radio").all())
      expect((await c.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.getByRole("button", { name: "Continue" }).tap();
    await expect(progress(page)).toHaveText("2 of 14");
    expect(errors).toEqual([]);
  });
});
