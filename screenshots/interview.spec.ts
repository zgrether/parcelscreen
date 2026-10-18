/**
 * Step 4's screenshots (plan §12), desktop then phone: question 1, question 2 with its follow-up, question 6, question
 * 13, 14a's chips with a stepper, 14b's chips, and the result with the quiet list and Try it. Run by `pnpm
 * screenshots`; Try it grades the Mud Creek sample, so no parcel is replayed and no owner shows.
 */
import { expect, test, type Page } from "@playwright/test";

const OUT = "test-results/screenshots";
const progress = (page: Page) => page.locator(".iv-progress");

async function fresh(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("e2e")) return;
    sessionStorage.setItem("e2e", "1");
    localStorage.clear();
    localStorage.setItem("ps.debug", "1");
  });
  await page.goto("/interview");
  await expect(progress(page)).toHaveText("1 of 14");
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

    test("the questions and the result", async ({ page }) => {
      await fresh(page);
      await shot(page, "01-q1");
      await pick(page, "Cool and snowy", 2);
      await page.getByRole("radio", { name: "Out with a camera" }).click();
      await expect(page.locator(".iv-follow")).toBeVisible();
      await shot(page, "02-q2-follow-up");
      await pick(page, "Spoils it", 3);
      await pick(page, "Sun", 4);
      await pick(page, "Walk out the door", 5);
      await pick(page, "Small and close", 6);
      await shot(page, "03-q6");
      await pick(page, "30 min", 7);
      await page.getByRole("button", { name: "Video calls from home" }).click();
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
      for (const chip of ["Flood zone", "An HOA", "Below ___ ft", "No winter sun"])
        await page.getByRole("button", { name: chip, exact: true }).click();
      await shot(page, "05-q14a");
      await page.getByRole("button", { name: "Continue" }).click();
      await page.getByRole("button", { name: "Shared driveway", exact: true }).click();
      await shot(page, "06-q14b");
      await page.getByRole("button", { name: "See my priorities" }).click();
      await expect(page.locator(".iv-scene")).toHaveText("Your priorities");
      await expect(page.getByRole("region", { name: "Try it" })).toContainText("Contender");
      await shot(page, "07-result");
      await page.locator(".iv").evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await shot(page, "08-result-end");
    });
  });
}
