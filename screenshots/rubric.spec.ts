/**
 * Step 3's screenshots (plan §11), desktop then phone: "My rubric" at rest (Could and Won't empty), a drag in
 * progress, a card's sheet with its slider, the weights notice expanded, a row on Must with its "min" badge and its
 * minimum card, and the preview after a move. Run by `pnpm screenshots`; the preview grades the Mud Creek sample, so
 * no parcel is replayed and no owner shows.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

const OUT = "test-results/screenshots";

const column = (page: Page, name: string): Locator => page.getByRole("region", { name, exact: true });
const card = (page: Page, name: string): Locator =>
  page.locator(".rubric-card", { has: page.locator(".rubric-card-name", { hasText: name }) }).first();
const sheet = (page: Page) => page.getByRole("dialog");

async function openRubric(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("e2e")) return;
    sessionStorage.setItem("e2e", "1");
    localStorage.clear();
  });
  await page.goto("/rubric");
  await expect(column(page, "Should").locator(".rubric-card")).toHaveCount(7);
  await expect(page.getByRole("complementary", { name: "Preview" })).toContainText(/B\s*Contender/);
}

/** Scrolls the editor (its <main> scrolls, not the window) so `el` sits near the top. */
async function scrollTo(page: Page, el: Locator): Promise<void> {
  await el.evaluate((e) => {
    const main = document.querySelector("main.rubric-editor")!;
    main.scrollTop += e.getBoundingClientRect().top - 60;
  });
}

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(device, () => {
    if (phone) test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    const shot = (page: Page, name: string) =>
      page.screenshot({ path: `${OUT}/${device}-rubric-${name}.png` });

    test("at rest, an empty column, a drag in progress", async ({ page }) => {
      await openRubric(page);
      await shot(page, "1-rest");
      if (phone) {
        await scrollTo(page, column(page, "Could"));
        await shot(page, "2-empty");
        await scrollTo(page, column(page, "Must"));
        // The handle held past the touch delay, then moved up over Must: CDP touches, as a finger sends them.
        const h = (await card(page, "Elevation at the build site").locator(".rubric-handle").boundingBox())!;
        const to = (await column(page, "Must").boundingBox())!;
        const x = h.x + h.width / 2,
          y = h.y + h.height / 2;
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
        await page.waitForTimeout(400);
        const steps = 12;
        for (let i = 1; i <= steps; i++)
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: x + 20 * (i / steps), y: y + (to.y + to.height / 2 - y) * (i / steps) }],
          });
        await page.waitForTimeout(200);
        await shot(page, "3-drag");
        await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
      } else {
        // Night sky lifted from Should and held over the empty Could column.
        const a = (await card(page, "Night sky").locator(".rubric-handle").boundingBox())!;
        const b = (await column(page, "Could").boundingBox())!;
        await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
        await page.mouse.down();
        await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 8, { steps: 4 });
        await page.mouse.move(b.x + b.width / 2, b.y + 120, { steps: 16 });
        await expect(page.getByRole("complementary", { name: "Preview" })).toContainText(
          "(if you drop it here)",
        );
        await shot(page, "3-drag");
        await page.keyboard.press("Escape");
        await page.mouse.up();
      }
    });

    test("a card's sheet with its slider", async ({ page }) => {
      await openRubric(page);
      await card(page, "Elevation at the build site").locator(".rubric-card-body").click();
      await sheet(page).getByRole("slider").fill("3000");
      await expect(sheet(page)).toContainText("B 3,000 ft");
      await shot(page, "4-sheet");
    });

    test("the weights notice expanded, then the preview after the move", async ({ page }) => {
      await openRubric(page);
      // Night sky moved above Best homesite in one move, by the keyboard (the same move as a drag; a second move would
      // close the notice).
      const handle = card(page, "Night sky").locator(".rubric-handle");
      await handle.focus();
      await page.keyboard.press("Space");
      await expect(handle).toHaveAttribute("aria-pressed", "true");
      for (let i = 0; i < 2; i++) {
        await page.waitForTimeout(50);
        await page.keyboard.press("ArrowUp");
      }
      await page.waitForTimeout(50);
      await page.keyboard.press("Space");
      const notice = page.locator(".rubric-notice");
      await notice.getByRole("button", { name: "See what changed" }).click();
      await expect(notice.locator("table")).toBeVisible();
      if (phone) await scrollTo(page, notice);
      await shot(page, "5-notice");
      await notice.getByRole("button", { name: "Dismiss" }).click();
      const preview = page.getByRole("complementary", { name: "Preview" });
      if (phone) await page.locator(".rubric-preview-bar").tap();
      else await scrollTo(page, page.locator(".rubric-body"));
      await expect(preview.locator(".rubric-moved li")).toHaveCount(2);
      await shot(page, "6-preview");
    });

    test("a row on Must: its min badge and its minimum card", async ({ page }) => {
      await openRubric(page);
      await card(page, "Town and hospital").locator(".rubric-card-body").click();
      await sheet(page).getByRole("button", { name: "Must" }).click();
      await page.keyboard.press("Escape");
      await expect(page.locator(".rubric-card .rubric-min-badge").first()).toBeVisible();
      await scrollTo(page, phone ? column(page, "Must") : page.locator(".rubric-bar"));
      await shot(page, "7-min");
      if (phone) {
        await scrollTo(page, card(page, "Town and hospital").last());
        await shot(page, "8-min-badge");
      }
    });
  });
}
