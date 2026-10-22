/**
 * Step 4's screenshots (plan §12), desktop then phone: a new profile's name screen, question 1, question 2 with its
 * follow-up, question 6, question 13, 14a's chips with a stepper, 14b's chips, the result with the quiet list and Try
 * it, the priorities page after it (the why line, "Reset to my answers", the quiet list), and "Replace the priorities
 * you changed?". Run by `pnpm screenshots`; Try it grades the Mud Creek sample, so no parcel is replayed and no owner
 * shows.
 */
import { expect, test, type Page } from "@playwright/test";

const OUT = "test-results/screenshots";
const progress = (page: Page) => page.locator(".iv-progress");

async function fresh(page: Page, onboard = false): Promise<void> {
  await page.addInitScript((onboard) => {
    if (sessionStorage.getItem("e2e")) return;
    sessionStorage.setItem("e2e", "1");
    localStorage.clear();
    localStorage.setItem("ps.debug", "1");
    if (onboard) localStorage.setItem("ps.onboard", "1");
  }, onboard);
  await page.goto("/interview");
  if (!onboard) await expect(progress(page)).toHaveText("1 of 14");
}

async function pick(page: Page, name: string, next: number): Promise<void> {
  await page.getByRole("radio", { name }).first().click();
  await expect(progress(page)).toHaveText(`${next} of 14`);
}

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(device, () => {
    if (phone) test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    const shot = (page: Page, name: string) =>
      page.screenshot({ path: `${OUT}/${device}-interview-${name}.png` });

    test("a new profile's name screen", async ({ page }) => {
      await fresh(page, true);
      await expect(page.locator(".iv-scene")).toHaveText("What should we call you?");
      await shot(page, "00-name");
    });

    test("the questions and the result", async ({ page }) => {
      await fresh(page);
      await shot(page, "01-q1");
      // Step 11: question 1's follow-ups, preset from the year.
      await page.getByRole("radio", { name: "Cool and snowy" }).first().click();
      await expect(page.locator(".iv-follow")).toBeVisible();
      await shot(page, "01b-q1-follow-ups");
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(progress(page)).toHaveText("2 of 14");
      await page.getByRole("radio", { name: "Out with a camera" }).click();
      await expect(page.locator(".iv-follow")).toBeVisible();
      await shot(page, "02-q2-follow-up");
      await pick(page, "Spoils it", 3);
      await pick(page, "Sun", 4);
      await pick(page, "Walk out the door", 5);
      await pick(page, "Small and close", 6);
      await shot(page, "03-q6");
      await pick(page, "30 min", 7);
      await page.getByRole("radio", { name: "Rarely or never" }).click();
      await page.getByRole("radio", { name: "Yes" }).click();
      await shot(page, "03b-q7");
      await page.getByRole("button", { name: "Continue" }).click();
      await pick(page, "Never know", 9);
      await pick(page, "A real kitchen garden", 10);
      await pick(page, "Long and gentle", 11);
      await pick(page, "No HOA or restrictions", 12);
      await pick(page, "Best feature", 13);
      await page.getByRole("radio", { name: "20–50 acres" }).click();
      await page.getByRole("textbox").first().fill("40,000");
      await shot(page, "04-q13");
      await page.getByRole("button", { name: "Continue" }).click();
      for (const chip of ["Flood zone", "An HOA", "Elevation below ___ ft", "No winter sun"])
        await page.getByRole("button", { name: chip, exact: true }).click();
      await shot(page, "05-q14a");
      await page.getByRole("button", { name: "Continue" }).click();
      await page.getByRole("button", { name: "Driveway on your land", exact: true }).click();
      await shot(page, "06-q14b");
      await page.getByRole("button", { name: "See my priorities" }).click();
      await expect(page.locator(".iv-scene")).toHaveText("What matters to you");
      await expect(page.getByRole("region", { name: "Try it" })).toContainText("Contender");
      await shot(page, "07-result");
      await page.locator(".iv").evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await shot(page, "08-result-end");

      // Back to 14b: the same one row (polish #27). Then the result again.
      await page.getByRole("button", { name: "Back" }).click();
      await expect(page.getByRole("button", { name: "See my priorities" })).toBeVisible();
      await shot(page, "06b-q14b-back");
      await page.getByRole("button", { name: "See my priorities" }).click();

      // The priorities page after it: "Reset to my answers", "Answer the questions again", and a card's why.
      await page.getByRole("link", { name: "Fine-tune in What matters to you" }).click();
      await page.waitForURL("**/priorities");
      await expect(page.getByRole("button", { name: "Reset to my answers" })).toBeVisible();
      await shot(page, "09-priorities");
      await page
        .locator(".rubric-card", { hasText: "Hospital" })
        .first()
        .locator(".rubric-card-body")
        .click();
      // Step 11: the ER's answer is Hospital's own.
      await expect(page.getByRole("dialog")).toContainText("You'd want an ER within 30 minutes");
      await shot(page, "11-why");
      // Moved to another tier, so the list differs from the answers: Nice to have, or Really want if it's there already
      // (since step 7's Driveway it can be).
      const nice = page.getByRole("dialog").getByRole("button", { name: "Nice to have" });
      await (
        (await nice.isEnabled())
          ? nice
          : page.getByRole("dialog").getByRole("button", { name: "Really want" })
      ).click();
      await page.keyboard.press("Escape");

      // Changed since: the interview again asks before replacing it.
      await page.goto("/interview");
      // A finished interview reopens with its answers: every screen shows Next.
      for (let i = 0; i < 15; i++)
        await page.getByRole("button", { name: /^(Next|Skip|See my priorities)$/ }).click();
      await expect(page.getByText("Replace the priorities you changed?")).toBeVisible();
      await shot(page, "12-replace");
    });
  });
}
