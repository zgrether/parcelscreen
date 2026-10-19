/**
 * Step 4c's desktop panel (docs/plans/step-4c-map-layout.md §1), at 1280 × 800: one panel docked at the left edge
 * under the top bar, 380 px wide, Search its first row. With no parcel open it's that row alone (no "Tap a parcel to
 * begin"); with one, it runs to the window's bottom. It collapses to a slim tab, kept across a reload in the same tab;
 * the tab reopens it. What's centred on the map's bottom centres between the panel and the right-hand column, and the
 * credits are MapLibre's ⓘ, folded, at the bottom right. A production build, no network.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { importParcel, openExplorer, reload } from "./flow";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A" as const;

test.use({ viewport: { width: 1280, height: 800 } });

async function box(l: Locator) {
  const b = await l.boundingBox();
  expect(b, "a box").not.toBeNull();
  return b!;
}
const centre = async (l: Locator) => {
  const b = await box(l);
  return b.x + b.width / 2;
};
/** The left edge of the right-hand column of map buttons. */
const columnLeft = async (page: Page) => (await box(page.locator(".map-col"))).x;

test("the docked panel: Search first, the empty state, full height with a parcel, collapse and reopen; the toolbar centred; the ⓘ", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await replayHar(context, FERNEY);
  await openExplorer(page, FERNEY);
  const panel = page.locator(".explore-panel.dock");

  // No parcel: the panel is the search row alone, flush under the top bar at the left edge.
  const empty = await box(panel);
  const topBar = await box(page.locator(".app-nav"));
  expect(empty.x).toBe(0);
  expect(empty.y).toBeCloseTo(topBar.y + topBar.height, 0);
  expect(empty.width).toBe(380);
  expect(empty.height).toBeLessThan(70);
  await expect(panel.getByRole("combobox", { name: /^Search coordinates/ })).toBeVisible();
  await expect(page.getByText("Tap a parcel to begin")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Search", exact: true })).toHaveCount(0);

  // The hint centres on the map between the left edge (the panel's only a row) and the right-hand column.
  const hint = page.locator(".map-hint");
  await expect(hint).toBeVisible();
  expect(Math.abs((await centre(hint)) - (await columnLeft(page)) / 2)).toBeLessThanOrEqual(2);

  // The credits: the ⓘ, folded, in the bottom-right corner.
  const attrib = page.locator(".maplibregl-ctrl-attrib");
  const a = await box(attrib);
  expect(a.x + a.width).toBeGreaterThan(1280 - 24); // MapLibre keeps 10 px around its controls
  expect(a.y + a.height).toBeGreaterThan(800 - 24);
  await expect(attrib).not.toHaveClass(/maplibregl-compact-show/);

  // A parcel open: the panel runs the window's height; the toolbar centres between it and the column.
  await importParcel(page, FERNEY);
  const full = await box(panel);
  expect(full.width).toBe(380);
  expect(full.y + full.height).toBeCloseTo(800, 0);
  const toolbar = page.locator(".toolbar");
  expect(Math.abs((await centre(toolbar)) - (380 + (await columnLeft(page))) / 2)).toBeLessThanOrEqual(2);

  // Collapse: the slim tab with the parcel's name; the toolbar then centres on the whole map's width.
  await page.getByRole("button", { name: "Collapse the panel" }).click();
  const tab = page.locator(".dock-tab");
  await expect(tab).toBeVisible();
  await expect(tab).toContainText("52-47A");
  await expect(panel).toBeHidden();
  expect(Math.abs((await centre(toolbar)) - (await columnLeft(page)) / 2)).toBeLessThanOrEqual(2);
  // Kept for the session: still collapsed after a reload in the same tab.
  await reload(page);
  await expect(page.locator(".dock-tab")).toBeVisible();
  await expect(panel).toBeHidden();
  // The tab reopens it, and that's kept too.
  await page.locator(".dock-tab").click();
  await expect(panel).toBeVisible();
  await expect(page.locator(".dock-tab")).toHaveCount(0);
  await reload(page);
  await expect(panel).toBeVisible();
  await expect(page.locator(".dock-tab")).toHaveCount(0);
  expect(errors).toEqual([]);
});

/** Below the parcel lines' zoom (14), the hint says so at any zoom (step 4c: the zoom slider was the other cue). */
for (const size of [
  { width: 1280, height: 800 },
  { width: 375, height: 667 },
])
  test.describe(`at ${size.width} × ${size.height}`, () => {
    test.use({ viewport: size, hasTouch: size.width < 768, isMobile: size.width < 768 });

    test("zoomed out (z11): Zoom in to see parcel lines, clear of the toolbar", async ({ page, context }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await replayHar(context, FERNEY);
      const { lat, lon } = { lat: 36.92, lon: -80.32 };
      await openExplorer(page, FERNEY, { "ps.view": JSON.stringify({ lat, lon, z: 11 }) });
      const hint = page.locator(".map-hint");
      await expect(hint).toHaveText("Zoom in to see parcel lines");
      const toolbar = page.locator(".toolbar");
      await expect(toolbar).toContainText("Tap a parcel to select it");
      const h = await box(hint);
      const t = await box(toolbar);
      expect(h.y + h.height, "the hint above the toolbar").toBeLessThanOrEqual(t.y);
      expect(errors).toEqual([]);
    });
  });
