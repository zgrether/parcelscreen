/**
 * Full-map mode (docs/plans/map-room.md §5; Zach's option A, #427): on a phone a swipe down on the sheet's line, or a
 * tap that does nothing today, hides every control on the map but the line and a restore button; a swipe up, restore
 * or another such tap brings them back. Never while Edit is open. The one-time hint over the line shows once per
 * device. A production build, the fixtures' HARs replayed.
 */
import { expect, test, type Page } from "@playwright/test";
import { pointOnFeature } from "@turf/turf";
import { loadFixture } from "../test/support/fixtures";
import { editParcel, importParcel, openExplorer, reload } from "./flow";
import { replayHar } from "./replay";

const MUD = "grayson-mud-creek-6273" as const;
type DebugWindow = Window & {
  __psMap: {
    project(ll: [number, number]): { x: number; y: number };
    jumpTo(o: { center: [number, number] }): void;
  };
};

/** A swipe on the sheet's line, `dy` px (down is positive), started away from its buttons. */
async function swipeLine(page: Page, dy: number): Promise<void> {
  const b = (await page.locator(".sheet-line").boundingBox())!;
  const x = b.x + b.width * 0.3,
    y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + dy, { steps: 6 });
  await page.mouse.up();
}

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("the line's swipes, restore and an empty tap hide and show the controls; never with Edit open; the hint once", async ({
    page,
    context,
  }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await replayHar(context, MUD);
    await openExplorer(page, MUD, {}, { sheet: "line" });
    await importParcel(page, MUD);

    // The first time the line shows on this device: the hint, then it goes by itself.
    const hint = page.getByText("Swipe down to hide controls.");
    await expect(hint).toBeVisible();
    await expect(hint).toHaveCount(0, { timeout: 10_000 });

    const restore = page.getByRole("button", { name: "Show the map's controls" });
    const edit = page.getByRole("button", { name: "Edit the parcel" });
    const tabs = page.locator(".app-nav");
    const line = page.locator(".sheet-line");

    // A swipe down on the line: the line and restore stay; Edit, the map's buttons and the tab bar go.
    await swipeLine(page, 60);
    await expect(restore).toBeVisible();
    await expect(line).toBeVisible();
    await expect(edit).toBeHidden();
    await expect(page.locator(".map-col")).toBeHidden();
    await expect(tabs).toBeHidden();
    const r = (await restore.boundingBox())!;
    expect(r.width).toBeGreaterThanOrEqual(44);
    expect(r.height).toBeGreaterThanOrEqual(44);
    // A swipe up brings them back.
    await swipeLine(page, -60);
    await expect(restore).toHaveCount(0);
    await expect(edit).toBeVisible();
    await expect(tabs).toBeVisible();

    // Restore does too.
    await swipeLine(page, 60);
    await restore.tap();
    await expect(edit).toBeVisible();

    // A tap that does nothing today (inside the open, ungraded parcel), after the double-tap window: hidden; another
    // such tap: back.
    const box = (await page.locator(".maplibregl-canvas").boundingBox())!;
    const [lo, la] = pointOnFeature(loadFixture(MUD).input.polygon).geometry.coordinates as [number, number];
    const inside = await page.evaluate(
      ([x, y]) => {
        // Centred first, so the point is in the part of the map the sheet and the buttons leave showing.
        const m = (window as unknown as DebugWindow).__psMap;
        m.jumpTo({ center: [x, y] });
        return m.project([x, y]);
      },
      [lo, la] as [number, number],
    );
    await page.waitForTimeout(600);
    await page.touchscreen.tap(box.x + inside.x, box.y + inside.y);
    await expect(restore).toBeVisible({ timeout: 3000 });
    await page.waitForTimeout(600);
    await page.touchscreen.tap(box.x + inside.x, box.y + inside.y);
    await expect(restore).toHaveCount(0, { timeout: 3000 });

    // Never with Edit open: the swipe and the tap leave the controls where they are.
    await editParcel(page);
    await swipeLine(page, 60);
    await page.waitForTimeout(800);
    await expect(restore).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Done", exact: true })).toBeVisible();

    // The hint never shows again on this device.
    await reload(page);
    await expect(page.locator(".sheet-line")).toBeVisible();
    await page.waitForTimeout(1000);
    await expect(hint).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
