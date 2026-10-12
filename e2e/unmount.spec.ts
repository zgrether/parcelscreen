/**
 * The explorer unmounts and mounts again (follow-up 52): with a screened parcel open, the map is left for Compare
 * and for the rulebook by client-side navigation, and comes back by the page's "← Map" link or by the browser's Back.
 * No page error on the way out (the map's children cleaning up after MapView removed the map), and on the way back a
 * new map, the same view, the same parcel. A report panel's "How it's scored" goes to its section of the rulebook,
 * and Back returns to the map with the report open.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { expectAllDone, importParcel, openExplorer, screenIt } from "./flow";
import { replayHar, type ReplayLog } from "./replay";

const FERNEY = "ferney-creek-52-47A" as const;

type View = { lat: number; lon: number; z: number };
type DebugWindow = Window & {
  __psMap?: { getCenter(): { lat: number; lng: number }; getZoom(): number; isMoving(): boolean };
  __before?: unknown;
  __samePage?: boolean;
};

/** The map's view once it has stopped moving. */
async function settledView(page: Page): Promise<View> {
  await expect
    .poll(() => page.evaluate(() => (window as DebugWindow).__psMap?.isMoving() === false))
    .toBe(true);
  return page.evaluate(() => {
    const m = (window as DebugWindow).__psMap!;
    const c = m.getCenter();
    return { lat: c.lat, lon: c.lng, z: m.getZoom() };
  });
}

interface Opened {
  errors: string[];
  net: ReplayLog;
  name: string;
  before: View;
}

/** Ferney screened and open, its view settled, and markers a full page load would lose. */
async function screenedFerney(page: Page, context: BrowserContext): Promise<Opened> {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const net = await replayHar(context, [FERNEY]);
  await openExplorer(page, FERNEY);
  await importParcel(page, FERNEY);
  expectAllDone(await screenIt(page));
  const name = (await page.locator(".sh-name").first().textContent())!;
  const before = await settledView(page);
  await page.evaluate(() => {
    const w = window as DebugWindow;
    w.__samePage = true;
    w.__before = w.__psMap;
  });
  return { errors, net, name, before };
}

/** Back on the map: the same page, a new map with the same view, the same parcel, and nothing failed. */
async function backOnTheMap(page: Page, { errors, net, name, before }: Opened): Promise<void> {
  await expect(page).toHaveURL(/\/explore$/);
  await expect(page.locator(".sh-name").first()).toHaveText(name);
  await expect(page.locator(".maplibregl-canvas")).toHaveCount(1);
  const after = await settledView(page);
  const state = await page.evaluate(() => {
    const w = window as DebugWindow;
    return { samePage: w.__samePage === true, newMap: !!w.__psMap && w.__psMap !== w.__before };
  });
  expect(state).toEqual({ samePage: true, newMap: true });
  expect(after.lat).toBeCloseTo(before.lat, 6);
  expect(after.lon).toBeCloseTo(before.lon, 6);
  expect(after.z).toBeCloseTo(before.z, 3);
  expect(net.misses, "data requests the HAR doesn't have").toEqual([]);
  expect(errors).toEqual([]);
}

for (const [link, path] of [
  ["Compare parcels", "/compare"],
  ["What the grade means", "/rulebook"],
] as const) {
  for (const way of ["the ← Map link", "Back"] as const) {
    test(`the explorer unmounts: to ${path} and back by ${way}, no error, the view and parcel restored`, async ({
      page,
      context,
    }) => {
      const opened = await screenedFerney(page, context);

      await page.getByRole("button", { name: "Menu", exact: true }).click();
      await page.getByRole("link", { name: link }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.locator(".maplibregl-canvas")).toHaveCount(0);
      expect(opened.errors, "leaving the explorer").toEqual([]);

      if (way === "Back") {
        await expect(page.getByRole("link", { name: "← Map" })).toBeVisible(); // the page is drawn
        await page.goBack();
      } else await page.getByRole("link", { name: "← Map" }).click();
      await backOnTheMap(page, opened);
    });
  }
}

test("a panel's “How it's scored” goes to its rulebook section; Back returns to the map with the report open", async ({
  page,
  context,
}) => {
  const opened = await screenedFerney(page, context);

  await page.locator(".card-row", { hasText: "Trails and public land" }).click();
  await page.locator(".card-panel").getByRole("link", { name: "How it's scored" }).click();
  await expect(page).toHaveURL(/\/rulebook#rule-trails$/);
  const section = page.locator("#rule-trails");
  await expect(section.locator("h4")).toHaveText("Trails and public land");
  // Scrolled to it: its top near the top of the window, once the breakdown above it has loaded.
  await expect(page.locator(".bd-track")).toBeVisible();
  await expect.poll(async () => Math.round((await section.boundingBox())!.y)).toBeLessThan(40);
  expect(opened.errors, "leaving the explorer").toEqual([]);

  await page.goBack();
  await backOnTheMap(page, opened);
  await expect(page.locator(".report .card-row", { hasText: "Trails and public land" })).toBeVisible();
});
