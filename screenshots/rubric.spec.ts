/**
 * Step 3's screenshots (plan §11, and the owner's UX round of 10/18), desktop then phone: "What matters to you" at rest
 * (Nice to have and Don't care empty), a drag in progress, a card's sheet with its slider, the weights notice expanded,
 * "Try it" after a move, a row on Must have with its "limit" badge and its limit card, Reset's confirm, the profile
 * menu inside the window, and the night sky's sheet (UX part 2, P-7). Run by `pnpm screenshots`; Try it grades the Mud Creek sample, so no parcel is replayed and
 * no owner shows.
 */
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

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
  await page.goto("/priorities");
  await expect(column(page, "Really want").locator(".rubric-card")).toHaveCount(7);
  await expect(page.getByRole("region", { name: "Try it" })).toContainText(/B\s*·\s*Contender/);
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
        await scrollTo(page, column(page, "Nice to have"));
        await shot(page, "2-empty");
        await scrollTo(page, column(page, "Must have"));
        // The handle held past the touch delay, then moved up over Must: CDP touches, as a finger sends them.
        const h = (await card(page, "Elevation at the build site").locator(".rubric-handle").boundingBox())!;
        const to = (await column(page, "Must have").boundingBox())!;
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
        const b = (await column(page, "Nice to have").boundingBox())!;
        await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
        await page.mouse.down();
        await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 8, { steps: 4 });
        await page.mouse.move(b.x + b.width / 2, b.y + 120, { steps: 16 });
        await expect(page.getByRole("region", { name: "Try it" })).toContainText("If you drop it here");
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
      // Each move announced, and the page's scroll with the card settled, before the next key: a key pressed
      // mid-scroll was lost on a phone.
      for (const place of [3, 2]) {
        await page.keyboard.press("ArrowUp");
        await expect(page.getByRole("status").filter({ hasText: "Night sky is over" })).toContainText(
          `Really want, place ${place}.`,
        );
        await page.waitForTimeout(400);
      }
      await page.keyboard.press("Space");
      const notice = page.locator(".rubric-notice");
      await notice.getByRole("button", { name: "See what changed" }).click();
      await expect(notice.locator("table")).toBeVisible();
      if (phone) await scrollTo(page, notice);
      await shot(page, "5-notice");
      await notice.getByRole("button", { name: "Dismiss" }).click();
      const preview = page.getByRole("region", { name: "Try it" });
      // Try it is under the intro on a phone too since UX part 2 (P-7).
      await scrollTo(page, preview);
      await expect(preview.locator(".rubric-reasons li")).toHaveCount(2);
      await shot(page, "6-preview");
    });

    test("the night sky's sheet, in what you'd see (UX part 2, P-7)", async ({ page }) => {
      await openRubric(page);
      await card(page, "Night sky").locator(".rubric-card-body").click();
      await expect(sheet(page).locator(".sky-scale li")).toHaveCount(4);
      await shot(page, "11-sky");
    });

    test("a row on Must have: its limit badge and its limit card", async ({ page }) => {
      await openRubric(page);
      await card(page, "Hospital").locator(".rubric-card-body").click();
      await sheet(page).getByRole("button", { name: "Must have" }).click();
      await page.keyboard.press("Escape");
      await expect(page.locator(".rubric-card .rubric-min-badge").first()).toBeVisible();
      await scrollTo(page, phone ? column(page, "Must have") : page.locator(".rubric-bar"));
      await shot(page, "7-min");
      if (phone) {
        await scrollTo(page, card(page, "Hospital").last());
        await shot(page, "8-min-badge");
      }
    });

    test("Reset's confirm, and the profile menu inside the window", async ({ page }) => {
      await openRubric(page);
      await page.getByRole("button", { name: "Reset to the starting list" }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await shot(page, "9-reset");
      await page.keyboard.press("Escape");
      // The profile is in the menu since step 4b.
      await page.locator(".app-more").click();
      await page.locator(".menu-profile").getByRole("button", { name: "Switch profile" }).click();
      await expect(page.locator(".menu-profile .profile-pop")).toBeVisible();
      await page.waitForTimeout(100);
      await shot(page, "10-profile-menu");
    });
  });
}
