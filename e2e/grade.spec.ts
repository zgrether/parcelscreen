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
/** The map's debug handle (ps.debug): its layers, and a pan. */
type MapWindow = Window & {
  __psMap: { getStyle(): { layers: { id: string }[] }; panBy(by: [number, number], o: object): void };
};
const mapLayers = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as MapWindow).__psMap
      .getStyle()
      .layers.map((l) => l.id)
      .join(),
  );
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
    await expect(grade(page)).toHaveText("Grade again: house site score changed");
    await expect(line).toHaveText(/^Graded in \d+ s · 3 sources didn't loadSteps ▸$/);

    // ▸ opens the run's list.
    await line.click();
    await expect(page.locator("ul.steps li")).toHaveCount(11);
    await page.reload();
    await expect(grade(page)).toHaveText("Grade again: house site score changed");
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

    // While it runs (UX part 2 PR 3b, Z-9): the button's place holds a slim progress bar with the step and its count,
    // in the peek; the sheet stays down. Steps ▸ raises it to the step list.
    await button.click();
    const progress = sheet.locator(".grade-progress-text");
    await expect(progress).toHaveText(/… \d+ of 11$/);
    const p = (await progress.boundingBox())!;
    expect(p.y + p.height).toBeLessThanOrEqual(s.y + s.height);
    expect(Math.round((await sheet.boundingBox())!.height)).toBe(148);
    await sheet.locator(".grade-progress-line").tap();
    await expect(sheet.locator(".steps")).toBeInViewport();
    await expect(sheet.locator(".grade-progress")).toHaveCount(0, { timeout: 200_000 });
    await expect(sheet.locator(".grade-btn")).toHaveText("Try again: 3 sources didn't load");
    await expect(page.locator(".steps-folded")).toHaveText(/^Graded in \d+ sSteps ▸$/);
    expect(errors).toEqual([]);
  });

  test("room for the map: a fresh session's line, Grade on it, the verdict after; collapse → pan → expand keeps it all; × closes", async ({
    page,
    context,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await replayHar(context, MUD);
    await openExplorer(page, MUD, {}, { sheet: "line" });
    await importParcel(page, MUD);

    // A fresh session's sheet is the line (map-room plan §1): the name, the boundary's acres and Grade, 60 px tall.
    const sheet = page.locator(".explore-panel");
    const line = sheet.locator(".sheet-line");
    await expect(line).toBeVisible();
    await expect.poll(async () => Math.round((await sheet.boundingBox())!.height)).toBe(60);
    await expect(line.locator(".sl-acres")).toHaveText(/^[\d.]+ boundary ac$/);
    await expect(header(page)).toBeHidden();
    const gradeIt = line.getByRole("button", { name: "Grade" });
    const close = line.getByRole("button", { name: "Close this parcel" });
    for (const b of [gradeIt, close]) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    expect((await close.boundingBox())!.width).toBeGreaterThanOrEqual(44);
    // The handle: a real button, named, with a 44 px target over the strip under its bar (Zach, #427 Q3).
    const handle = page.getByRole("button", { name: "Expand the sheet" });
    await expect(handle).toHaveAttribute("aria-expanded", "false");
    const reach = await handle.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const top = el.closest(".explore-panel")!.getBoundingClientRect().top;
      const at = (y: number) => document.elementFromPoint(x, y) === el;
      return { top: at(top + 1), bottom: at(top + 43) };
    });
    expect(reach).toEqual({ top: true, bottom: true });

    // Graded from the line: its step on the line while it runs, and the sheet stays down.
    await gradeIt.tap();
    await expect(line.locator(".sl-progress")).toHaveText(/… \d+ of 11$/);
    expect(Math.round((await sheet.boundingBox())!.height)).toBe(60);
    await expect(line.locator(".sl-progress")).toHaveCount(0, { timeout: 200_000 });
    // After the grade it's still the line (Zach, #427 Q1): the verdict and letter, and Try again for the 3 sources.
    await expect(line.locator(".sh-card .sh-word")).toHaveText(/^(Contender|Maybe|Not for us)$/);
    await expect(line.locator(".sh-card .card-grade")).toHaveText(/^([A-F]|–)$/);
    await expect(line.getByRole("button", { name: "Try again" })).toBeVisible();
    const verdict = await line.locator(".sh-card").innerText();

    // A tap on the line opens the sheet to the peek; the handle collapses it again.
    await line.locator(".sl-name").tap();
    await expect(line).toHaveCount(0);
    await expect(header(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Collapse the sheet" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await page.locator(".sheet-handle").tap();
    await expect(line).toBeVisible();

    // Collapse → pan → expand: the parcel, its grade and its overlays are all still there.
    const before = await mapLayers(page);
    await page.evaluate(() => (window as unknown as MapWindow).__psMap.panBy([120, -80], { duration: 0 }));
    await line.locator(".sl-name").tap();
    // The header's has the joining words too ("held by: …"); the verdict and letter are the line's.
    await expect(header(page).locator(".sh-card")).toContainText(verdict.replace(/\s+/g, ""));
    expect(await mapLayers(page)).toBe(before);

    // From the keyboard: the handle's Enter collapses it, and its name says what it'll do next.
    await page.getByRole("button", { name: "Collapse the sheet" }).focus();
    await page.keyboard.press("Enter");
    await expect(line).toBeVisible();
    await expect(handle).toBeFocused();

    // Remembered for the session (a reload, or the next parcel opened, starts here).
    expect(await page.evaluate(() => sessionStorage.getItem("ps.sheet"))).toBe("line");

    // × closes the parcel and clears it.
    await close.tap();
    await expect(sheet).toHaveClass(/sheet-hidden/);
    expect(errors).toEqual([]);
  });
});
