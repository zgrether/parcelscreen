/**
 * The UX audit's bugs (docs/design/ux-audit.md §7) that the map shows: Esc closes the topmost thing only (B-4), and a
 * parcel opened from Your list brings the map to it (B-5).
 */
import { expect, test, type Page } from "@playwright/test";
import { bbox } from "@turf/turf";
import { loadFixture } from "../test/support/fixtures";
import { importParcels, openExplorer, openFromList, seedScreens, settled, visit } from "./flow";
import { replayHar } from "./replay";

const MUD = "grayson-mud-creek-6273" as const;

async function mudFromList(page: Page): Promise<void> {
  await openExplorer(page, MUD);
  await importParcels(page, [MUD]);
  await seedScreens(page, [MUD]);
  await settled(page);
  // The map well away from the parcel first, so opening it has somewhere to go.
  await page.waitForFunction(() => !!(window as unknown as { __psMap?: unknown }).__psMap);
  await page.evaluate(() =>
    (window as unknown as { __psMap: { jumpTo(o: object): void } }).__psMap.jumpTo({
      center: [-80.4, 36.9],
      zoom: 8,
    }),
  );
  await visit(page, "/library");
  await openFromList(page, "Mud Creek");
}

test("Esc closes the parcel's ⋯ menu, then a row's panel, and only then the parcel (B-4)", async ({
  page,
  context,
}) => {
  await replayHar(context, [MUD]);
  await mudFromList(page);
  const header = page.locator(".explore-panel").getByText("Mud Creek", { exact: false }).first();
  await expect(header).toBeVisible();

  await page.getByRole("button", { name: "More for this parcel" }).click();
  await expect(page.getByRole("menuitem", { name: /Make a report/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitem", { name: /Make a report/ })).toHaveCount(0);
  await expect(header).toBeVisible();

  // A row's panel: Esc closes it, and the parcel stays.
  await page.getByRole("tab", { name: "Grade" }).click();
  await page.locator(".card-row").filter({ hasText: "Septic" }).first().click();
  const panel = page.locator(".card-panel");
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(header).toBeVisible();

  // Then Esc closes the parcel, as the × does.
  await page.keyboard.press("Escape");
  await expect(header).toHaveCount(0);
});

test("a parcel opened from Your list brings the map to it, framed in the visible part (B-5)", async ({
  page,
  context,
}) => {
  await replayHar(context, [MUD]);
  await mudFromList(page);
  const [w, s, e, n] = bbox(loadFixture(MUD).input.polygon);
  await expect(async () => {
    const cam = await page.evaluate(() => {
      const m = (
        window as unknown as {
          __psMap: { getCenter(): { lng: number; lat: number }; getZoom(): number; isMoving(): boolean };
        }
      ).__psMap;
      const c = m.getCenter();
      return { lng: c.lng, lat: c.lat, z: m.getZoom(), moving: m.isMoving() };
    });
    expect(cam.moving).toBe(false);
    expect(cam.z).toBeGreaterThan(13);
    // The camera's centre is the middle of the padded (visible) part, which the fit centres on the parcel.
    expect(cam.lng).toBeGreaterThan(w);
    expect(cam.lng).toBeLessThan(e);
    expect(cam.lat).toBeGreaterThan(s);
    expect(cam.lat).toBeLessThan(n);
  }).toPass({ timeout: 10_000 });
});
