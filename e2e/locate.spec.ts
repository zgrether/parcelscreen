/**
 * My location (follow-up 52): the map's Locate button, with location access granted and with it denied, then the
 * map left for Compare and come back to. The Locate control is the one whose cleanup crashed when the explorer
 * unmounted: no page error, and the map, Locate with it, still works on the way back.
 */
import { expect, test, type Page } from "@playwright/test";
import { loadFixture } from "../test/support/fixtures";
import { openExplorer } from "./flow";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A" as const;
const NO_LOCATION = "Couldn't get your location"; // MapControls.tsx

type DebugWindow = Window & {
  __psMap?: {
    getCenter(): { lat: number; lng: number };
    jumpTo(o: { center: [number, number]; zoom: number }): void;
    isMoving(): boolean;
  };
};

/** The map's centre once it has stopped moving. */
async function centre(page: Page): Promise<{ lat: number; lon: number }> {
  await expect
    .poll(() => page.evaluate(() => (window as DebugWindow).__psMap?.isMoving() === false))
    .toBe(true);
  return page.evaluate(() => {
    const c = (window as DebugWindow).__psMap!.getCenter();
    return { lat: c.lat, lon: c.lng };
  });
}

/** To Compare by the menu, and back by its "← Map": no page error on the way out. */
async function leaveAndReturn(page: Page, errors: string[]): Promise<void> {
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("link", { name: "Compare parcels" }).click();
  await expect(page).toHaveURL(/\/compare$/);
  await expect(page.locator(".maplibregl-canvas")).toHaveCount(0);
  expect(errors, "leaving the explorer").toEqual([]);
  await page.getByRole("link", { name: "← Map" }).click();
  await expect(page).toHaveURL(/\/explore$/);
  await expect(page.locator(".maplibregl-canvas")).toHaveCount(1);
}

test("Locate with location access: the map goes there, and after leaving the map and coming back it still does", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // A position a few miles from the parcel the explorer opens at.
  const { point } = loadFixture(FERNEY).input;
  const here = { latitude: point.lat + 0.05, longitude: point.lon - 0.05, accuracy: 20 };
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation(here);
  const net = await replayHar(context, [FERNEY]);
  await openExplorer(page, FERNEY);

  const locate = page.getByRole("button", { name: "Show my location" });
  const expectAtHere = async () => {
    await expect
      .poll(async () => {
        const c = await centre(page);
        return Math.max(Math.abs(c.lat - here.latitude), Math.abs(c.lon - here.longitude));
      })
      .toBeLessThan(1e-3);
  };
  await locate.click();
  await expectAtHere();
  await expect(page.locator(".maplibregl-user-location-dot")).toBeVisible();

  await leaveAndReturn(page, errors);
  // The map works: moved away, Locate brings it back.
  await page.evaluate(
    ([lon, lat]) => (window as DebugWindow).__psMap!.jumpTo({ center: [lon, lat], zoom: 12 }),
    [point.lon, point.lat] as const,
  );
  await locate.click();
  await expectAtHere();
  await expect(page.locator(".maplibregl-user-location-dot")).toBeVisible();

  expect(net.misses, "data requests the HAR doesn't have").toEqual([]);
  expect(errors).toEqual([]);
});

test("Locate with location access denied: it says so, and after leaving the map and coming back it still does", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.clearPermissions(); // no grant: the browser refuses
  const net = await replayHar(context, [FERNEY]);
  await openExplorer(page, FERNEY);

  const locate = page.getByRole("button", { name: "Show my location" });
  const before = await centre(page);
  await locate.click();
  await expect(page.locator(".map-hint")).toHaveText(NO_LOCATION);
  expect(await centre(page)).toEqual(before); // the map didn't move

  await leaveAndReturn(page, errors);
  await expect(page.locator(".map-hint")).toHaveCount(0);
  await locate.click();
  await expect(page.locator(".map-hint")).toHaveText(NO_LOCATION);

  expect(net.misses, "data requests the HAR doesn't have").toEqual([]);
  expect(errors).toEqual([]);
});
