/**
 * Step 16's screenshots (plan §10), desktop (1280 × 800) then phone (375 × 812), with the live services: Mud Creek with
 * Public land on (the Jefferson National Forest to its west) and Motor-vehicle routes over Mount Rogers, the forest's
 * card, and Pond Mountain Game Land (Ashe, NC) with its card open; and a check that each forest's MVUM page answers.
 * PAD-US, the MVUM, the basemaps and the Forest Service's pages are fetched live, so this runs where they can be reached
 * (`.github/workflows/public-lands.yml`); the parcel's grade is its recording's.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { loadFixture } from "../test/support/fixtures";
import { importParcels, openExplorer, openFromList, seedScreens, settled, visit } from "../e2e/flow";
import { jump } from "../e2e/publicLand";
import { replayHar } from "../e2e/replay";
import { MVUM_FALLBACK_URL, MVUM_PAGES } from "../lib/mvum/forests";

const OUT = "test-results/screenshots/step-16";
const MUD = "grayson-mud-creek-6273";
/** Mud Creek and the forest to its north-west, with White Top Road, in one view (zoom 12, wide enough for a phone). */
const MUD_VIEW: [number, number] = [36.603, -81.576];
/** Inside the Jefferson National Forest, east of White Top Road (read off the first run's Mud Creek shot). */
const FOREST: [number, number] = [36.6316, -81.5794];
/** The point the probe asked: Pond Mountain Game Land's record is under it. */
const POND: [number, number] = [36.56, -81.69];

async function live(context: BrowserContext): Promise<void> {
  await context.route(
    /basemap\.nationalmap\.gov|vginmaps\.vdem\.virginia\.gov|services\.nconemap\.gov\/.*Orthoimagery|tiles\.mapterhorn\.com|elevation-tiles-prod|Manager_Name_PADUS\/FeatureServer|apps\.fs\.usda\.gov\/arcx\/rest\/services\/EDW\/EDW_MVUM_01/,
    (r) => r.continue(),
  );
}

/** Until the map has drawn every tile in view and the layers' own tiles have landed (or 45 s). */
async function drawn(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () => {
        const m = (window as unknown as { __psMap?: { areTilesLoaded(): boolean; isMoving(): boolean } })
          .__psMap;
        return !!m && !m.isMoving() && m.areTilesLoaded();
      },
      undefined,
      { timeout: 45_000 },
    )
    .catch(() => undefined);
  // The layers redraw 250 ms after their last tile.
  await page.waitForTimeout(2500);
}

/**
 * A point in view over drawn land of one kind (by name, or the forest), clear of the routes: the screenshot's tap, found
 * on the live map rather than from coordinates read off an earlier run.
 */
async function landPoint(
  page: Page,
  test: { cat?: string; name?: string },
): Promise<{ x: number; y: number } | null> {
  return page.evaluate((want) => {
    type F = { properties: Record<string, unknown> };
    const m = (
      window as unknown as {
        __psMap: {
          getContainer(): HTMLElement;
          queryRenderedFeatures(p: unknown, o: { layers: string[] }): F[];
          getLayer(id: string): unknown;
        };
      }
    ).__psMap;
    const box = m.getContainer().getBoundingClientRect();
    const land = ["public-land-fine-solid", "public-land-fine-hatched"].filter((id) => m.getLayer(id));
    const routes = ["mvum-line", "mvum-seasonal"].filter((id) => m.getLayer(id));
    // Nearest the middle of the open map first (right of the docked panel, above a phone's sheet), so the card shows whole.
    const points: [number, number][] = [];
    for (let y = box.height * 0.15; y < box.height * 0.65; y += 20)
      for (let x = box.width * 0.35; x < box.width * 0.9; x += 20) points.push([x, y]);
    const mid: [number, number] = [box.width * 0.62, box.height * 0.45];
    points.sort(
      (a, b) => Math.hypot(a[0] - mid[0], a[1] - mid[1]) - Math.hypot(b[0] - mid[0], b[1] - mid[1]),
    );
    for (const [x, y] of points) {
      const hit = m
        .queryRenderedFeatures([x, y], { layers: land })
        .some((f) =>
          want.name ? String(f.properties.Unit_Nm ?? "").includes(want.name) : f.properties._cat === want.cat,
        );
      const near = routes.length
        ? m.queryRenderedFeatures(
            [
              [x - 16, y - 16],
              [x + 16, y + 16],
            ],
            { layers: routes },
          ).length
        : 0;
      if (hit && !near) return { x: box.left + x, y: box.top + y };
    }
    return null;
  }, test);
}

/** Taps the land and waits for its card, in view (any earlier card closed first, so it can't stand in for this one). */
async function openCard(page: Page, want: { cat?: string; name?: string }, name: string): Promise<void> {
  await page.evaluate(() => document.querySelectorAll(".maplibregl-popup").forEach((p) => p.remove()));
  const at = await landPoint(page, want);
  expect(at, `a point over ${name}`).not.toBeNull();
  console.log(`${name}: tapping at ${at!.x},${at!.y}`);
  await page.mouse.click(at!.x, at!.y);
  const card = page.locator(".public-land-card");
  // Whole, after the map pans it clear of the edges.
  await expect(card).toBeInViewport({ ratio: 1 });
  console.log(`${name}'s card: ${(await card.innerText()).replace(/\s+/g, " ")}`);
}

async function layersOn(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Map layers" }).click();
  const panel = page.getByRole("region", { name: "Map layers" });
  for (const name of ["Public land", "Motor-vehicle routes"]) {
    const b = panel.getByRole("button", { name, exact: true });
    if ((await b.getAttribute("aria-pressed")) !== "true") await b.click();
  }
}

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(device, () => {
    test.use(
      phone
        ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );
    const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${device}-${name}.png` });

    test("Public land and Motor-vehicle routes: Mud Creek, the forest's card, Pond Mountain Game Land", async ({
      page,
      context,
    }) => {
      test.setTimeout(600_000);
      await replayHar(context, MUD);
      await live(context);
      await openExplorer(page, MUD);
      await importParcels(page, [MUD]);
      await seedScreens(page, [MUD], { current: true });
      await settled(page);
      await visit(page, "/library");
      await openFromList(page, loadFixture(MUD).input.name);
      const tilt = page.locator(".tilt-hint button");
      if (await tilt.count()) await tilt.first().click();

      // Map layers, with both layers on and their keys.
      await layersOn(page);
      await page.waitForTimeout(400);
      await shot(page, "layers-key");
      await page.getByRole("button", { name: "Close the map panel" }).click();

      // Mud Creek, the forest beside it and the NRA's routes.
      await jump(page, 12, MUD_VIEW);
      await drawn(page);
      await shot(page, "mud-creek");

      // The forest's card.
      await jump(page, 14, FOREST);
      await drawn(page);
      await openCard(page, { cat: "forest" }, "the national forest");
      await shot(page, "forest-card");

      // Pond Mountain Game Land, NC, with its card.
      await page.getByRole("button", { name: "Close this parcel" }).click();
      await jump(page, 13, POND);
      await drawn(page);
      await openCard(page, { name: "Pond Mountain" }, "Pond Mountain Game Land");
      await shot(page, "pond-mountain");
    });
  });
}

// The route card's and the key's links (owner on #382): each forest's MVUM page answers, read live from CI's runner.
test("each forest's MVUM page answers", async ({ page }) => {
  test.setTimeout(180_000);
  for (const url of [...MVUM_PAGES.map((p) => p.url), MVUM_FALLBACK_URL]) {
    const r = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    console.log(`${r?.status()} ${url}: ${await page.title()}`);
    expect(r?.status(), url).toBeLessThan(400);
  }
});
