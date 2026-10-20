/**
 * Step 4c's one action (docs/plans/step-4c-map-layout.md §2–§3): "Grade this parcel" before the first run; after a run,
 * a button only with a reason, and the step log folded to one line, its count only when the button doesn't carry it
 * (owner, 10/19). On a desktop the button is the toolbar's; on a phone it's under the sheet's header, and the peek
 * grows to hold it (owner, 4c: 148 px). Mud Creek's recording lacks FEMA, PAD-US and OSRM: 3 sources didn't load.
 * A production build, the fixtures' HARs replayed.
 */
import { expect, test, type Page } from "@playwright/test";
import { importParcel, openExplorer, openMenu, screenIt } from "./flow";
import { replayHar } from "./replay";

const MUD = "grayson-mud-creek-6273" as const;

const grade = (page: Page) => page.locator(".grade-btn");
const header = (page: Page) => page.locator(".explore-header");

test.describe("on a desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("Grade this parcel in the toolbar; after the run, Try again with the count and a log line without it; a setting changed moves the count to the line", async ({
    page,
    context,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await replayHar(context, MUD);
    await openExplorer(page, MUD);
    await importParcel(page, MUD);

    // Before the first run: the toolbar's button; nothing in the header but the name, acres and ×.
    await expect(page.locator(".toolbar").locator(".grade-btn")).toHaveText("Grade this parcel");
    await expect(header(page).getByRole("button", { name: /Run again|Screen it|Grade/ })).toHaveCount(0);

    await screenIt(page);
    // Three steps failed: the button carries the count, and the log's one line doesn't.
    await expect(grade(page)).toHaveText("Try again: 3 sources didn't load");
    const line = page.locator(".steps-folded");
    await expect(line).toHaveText(/^Graded in \d+ sSteps ▸$/);
    await expect(page.locator("ul.steps")).toHaveCount(0);

    // A setting changed: the button names it, and the count joins the line.
    await (await openMenu(page)).getByRole("button", { name: "Settings", exact: true }).click();
    const field = page.locator(".settings-grid input").first();
    const was = await field.inputValue();
    await field.fill(String(Number(was) + 1));
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(grade(page)).toHaveText("Grade again: settings changed");
    await expect(line).toHaveText(/^Graded in \d+ s · 3 sources didn't loadSteps ▸$/);

    // ▸ opens the run's list.
    await line.click();
    await expect(page.locator("ul.steps li")).toHaveCount(11);
    await page.reload();
    await expect(grade(page)).toHaveText("Grade again: settings changed");
    expect(errors).toEqual([]);
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });

  test("the button under the sheet's header, in a peek that grows to hold it; the name on two lines", async ({
    page,
    context,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await replayHar(context, MUD);
    await openExplorer(page, MUD);
    await importParcel(page, MUD);

    // Before the first run the sheet rests at its peek, 148 px with the button: the button is whole and above the tabs.
    const sheet = page.locator(".explore-panel");
    await expect.poll(async () => Math.round((await sheet.boundingBox())!.height)).toBe(148);
    const button = sheet.locator(".grade-btn");
    await expect(button).toHaveText("Grade this parcel");
    const b = (await button.boundingBox())!;
    const s = (await sheet.boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.y + b.height).toBeLessThanOrEqual(s.y + s.height);
    // The name wraps to two lines instead of truncating, with the acres on its own line.
    const name = page.locator(".sh-name").first();
    expect((await name.boundingBox())!.height).toBeGreaterThan(30);
    await expect(page.locator(".sh-acres").first()).toBeInViewport();

    await screenIt(page);
    await expect(sheet.locator(".grade-btn")).toHaveText("Try again: 3 sources didn't load");
    await expect(page.locator(".steps-folded")).toHaveText(/^Graded in \d+ sSteps ▸$/);
    expect(errors).toEqual([]);
  });
});
