/**
 * The map behind the other tabs (step 4b; owner, 10/18). With a screened parcel open, the map is left for Your list
 * or What matters and comes back by the Map tab or the browser's Back. It stays mounted: the same map, the same view,
 * the same parcel with its overlays live, and no new screen run. While hidden it pauses: no frame drawn (not even when
 * asked for), no request off the site (tiles, services). If the browser drops the page anyway, the next load restores
 * the view and the open parcel from storage, and Run again restores the overlays: that fallback is the reload tests'.
 * A report panel's "How it's scored" goes to its section of the rulebook, and Back returns to the map with the report
 * and that panel open (it's in the URL, ?panel=trails: #121 review). Follow-up 52's unmount (the map's children
 * cleaning up after MapView removed the map) now happens only when the page goes.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { expectAllDone, importParcel, keptScreenCount, openExplorer, screenIt, visit } from "./flow";
import { replayHar, type ReplayLog } from "./replay";

const FERNEY = "ferney-creek-52-47A" as const;

type View = { lat: number; lon: number; z: number };
type DebugMap = {
  getCenter(): { lat: number; lng: number };
  getZoom(): number;
  isMoving(): boolean;
  on(event: string, f: () => void): void;
  triggerRepaint(): void;
};
type DebugWindow = Window & {
  __psMap?: DebugMap;
  __psScreen?: { view: unknown };
  __before?: unknown;
  __samePage?: boolean;
  __renders?: number;
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

/** The open parcel's run is live: its overlays and fan are drawn from the worker's session. */
const live = (page: Page) => page.evaluate(() => !!(window as DebugWindow).__psScreen?.view);

interface Opened {
  errors: string[];
  net: ReplayLog;
  name: string;
  before: View;
  screens: number;
}

/** Ferney screened and open, its view settled, and markers a full page load would lose; the map's frames counted. */
async function screenedFerney(page: Page, context: BrowserContext): Promise<Opened> {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const net = await replayHar(context, [FERNEY]);
  await openExplorer(page, FERNEY);
  await importParcel(page, FERNEY);
  expectAllDone(await screenIt(page));
  await expect.poll(() => live(page)).toBe(true);
  const name = (await page.locator(".sh-name").first().textContent())!;
  const before = await settledView(page);
  await page.evaluate(() => {
    const w = window as DebugWindow;
    w.__samePage = true;
    w.__before = w.__psMap;
    w.__renders = 0;
    w.__psMap!.on("render", () => void (w.__renders = (w.__renders ?? 0) + 1));
  });
  return { errors, net, name, before, screens: await keptScreenCount(page) };
}

/**
 * Back on the map (at /explore, or with the panel that was open): the same page and the same map, with the same
 * view, the same parcel, its overlays live, no new run, and nothing failed.
 */
async function backOnTheMap(
  page: Page,
  { errors, net, name, before, screens }: Opened,
  url = /\/explore$/,
): Promise<void> {
  await expect(page).toHaveURL(url);
  await expect(page.locator(".sh-name").first()).toHaveText(name);
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  const after = await settledView(page);
  const state = await page.evaluate(() => {
    const w = window as DebugWindow;
    return { samePage: w.__samePage === true, sameMap: !!w.__psMap && w.__psMap === w.__before };
  });
  expect(state).toEqual({ samePage: true, sameMap: true });
  expect(after.lat).toBeCloseTo(before.lat, 6);
  expect(after.lon).toBeCloseTo(before.lon, 6);
  expect(after.z).toBeCloseTo(before.z, 3);
  expect(await live(page), "the overlays still live").toBe(true);
  await expect(page.locator("button", { hasText: /^Running…$/ })).toHaveCount(0);
  expect(await keptScreenCount(page), "no new screen run").toBe(screens);
  // Drawing again: it resumed.
  await expect.poll(() => page.evaluate(() => (window as DebugWindow).__renders ?? 0)).toBeGreaterThan(0);
  expect(net.misses, "data requests the HAR doesn't have").toEqual([]);
  expect(errors).toEqual([]);
}

for (const [tab, path] of [
  ["Your list", "/library"],
  ["What matters", "/priorities"],
] as const) {
  for (const way of ["the Map tab", "Back"] as const) {
    test(`the map stays mounted and paused: to ${path} and back by ${way}, the same map, view, parcel and overlays`, async ({
      page,
      context,
    }) => {
      const opened = await screenedFerney(page, context);

      await page.getByRole("link", { name: tab, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.locator(".app-map")).toBeHidden();
      // Hidden: nothing drawn, even when a frame is asked for, and nothing asked of another site (tiles, services).
      const offSite: string[] = [];
      const origin = new URL(page.url()).origin;
      const onRequest = (r: { url(): string }) => {
        if (!r.url().startsWith(origin) && !r.url().startsWith("data:")) offSite.push(r.url());
      };
      page.on("request", onRequest);
      await page.evaluate(() => {
        const w = window as DebugWindow;
        w.__renders = 0;
        w.__psMap!.triggerRepaint();
      });
      await page.waitForTimeout(1500);
      expect(await page.evaluate(() => (window as DebugWindow).__renders), "frames drawn while hidden").toBe(
        0,
      );
      page.off("request", onRequest);
      expect(offSite, "requests off the site while hidden").toEqual([]);
      expect(opened.errors, "leaving the map").toEqual([]);

      if (way === "Back") await page.goBack();
      else await page.getByRole("link", { name: "Map", exact: true }).click();
      await backOnTheMap(page, opened);
    });
  }
}

test("a panel's “How it's scored” goes to its rulebook section; Back returns to the map with that panel open", async ({
  page,
  context,
}) => {
  const opened = await screenedFerney(page, context);

  // Opening and closing panels replaces the URL's entry: Back doesn't step through them.
  const entries = await page.evaluate(() => history.length);
  await page.locator(".card-row", { hasText: "Night sky" }).click();
  await expect(page).toHaveURL(/\/explore\?panel=sky$/);
  await page.locator(".card-panel").getByRole("button", { name: "Close" }).click();
  await expect(page).toHaveURL(/\/explore$/);
  await page.locator(".card-row", { hasText: "Trails and public land" }).click();
  await expect(page).toHaveURL(/\/explore\?panel=trails$/);
  expect(await page.evaluate(() => history.length)).toBe(entries);

  await page.locator(".card-panel").getByRole("link", { name: "How it's scored" }).click();
  await expect(page).toHaveURL(/\/rulebook#rule-trails$/);
  const section = page.locator("#rule-trails");
  await expect(section.locator("h4")).toHaveText("Trails and public land");
  // Scrolled to it: its top near the top of the page (below the top bar, step 4b), once the breakdown above it has
  // loaded.
  await expect(page.locator(".bd-track")).toBeVisible();
  const pageTop = (await page.locator("main").boundingBox())!.y;
  await expect.poll(async () => Math.round((await section.boundingBox())!.y - pageTop)).toBeLessThan(40);
  expect(opened.errors, "leaving the explorer").toEqual([]);

  // Back: the map, the report, and the same panel open and in view.
  await page.goBack();
  await backOnTheMap(page, opened, /\/explore\?panel=trails$/);
  const panel = page.locator(".card-panel");
  await expect(panel.locator("#card-panel-title")).toHaveText("Trails and public land");
  await expect(panel).toBeInViewport();
  await expect(panel.getByRole("link", { name: "How it's scored" })).toBeVisible();
});

test("a URL that names a panel opens it; one that isn't a panel, or a parcel with no screen, is ignored", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const net = await replayHar(context, [FERNEY]);
  await openExplorer(page, FERNEY);
  await importParcel(page, FERNEY);
  const panel = page.locator(".card-panel");

  // Ferney open, not screened yet: the panel is dropped, and so is the parameter.
  await visit(page, "/explore?panel=sky");
  await expect(page.locator(".sh-name").first()).toBeVisible();
  await expect(page).toHaveURL(/\/explore$/);
  await expect(panel).toHaveCount(0);

  expectAllDone(await screenIt(page));
  await visit(page, "/explore?panel=sky");
  await expect(panel.locator("#card-panel-title")).toHaveText("Night sky");
  await expect(panel).toBeInViewport();
  await expect(page).toHaveURL(/\/explore\?panel=sky$/);

  // Not a panel: the report, no panel, and the parameter gone.
  await visit(page, "/explore?panel=moon");
  await expect(page.locator(".report .card-row").first()).toBeVisible();
  await expect(page).toHaveURL(/\/explore$/);
  await expect(panel).toHaveCount(0);

  expect(net.misses, "data requests the HAR doesn't have").toEqual([]);
  expect(errors).toEqual([]);
});
