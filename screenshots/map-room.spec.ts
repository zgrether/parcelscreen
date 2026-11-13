/**
 * Room for the map (docs/plans/map-room.md §7): how much of a phone's screen shows the map with a graded parcel open,
 * measured at 390 × 844 (Zach's phone), with the desktop's shot for the record. Macks Mountain 35-3 is graded here from
 * its recording, so the overlays and the House shading are the live session's.
 *
 * The measure: a 10 px grid of points over the viewport, each counted as map when the topmost element there is the
 * map's canvas or a marker the map draws (pins, Stand here, hour labels). Anything else (the sheet, a button, the key,
 * a tip, the tab bar) covers it. The figures go to the job log and test-results/screenshots/map-room/coverage.json.
 *
 * Taken by map-room.yml on CI's runners (the live basemaps), into test-results/screenshots/map-room/. Owner fields are
 * hidden by screenshot mode (fixtures.ts).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { pointOnFeature } from "@turf/turf";
import { expect, test } from "./fixtures";
import { loadFixture, type FixtureSlug } from "../test/support/fixtures";
import {
  importParcels,
  openExplorer,
  openFromList,
  screenIt,
  seedScreens,
  settled,
  visit,
} from "../e2e/flow";
import { replayHar } from "../e2e/replay";

const OUT = "test-results/screenshots/map-room";
const MACKS = "macks-mountain-35-3" satisfies FixtureSlug;

/** The basemaps and terrain live (the replay aborts them). */
const liveImagery = (page: Page) =>
  page
    .context()
    .route(
      /basemap\.nationalmap\.gov|arcgisonline\.com|vginmaps\.vdem\.virginia\.gov|tiles\.mapterhorn\.com|elevation-tiles-prod/,
      (r) => r.continue(),
    );

/** Until the map has drawn every tile in view (or 20 s), then a beat for the overlays. */
const settle = async (page: Page) => {
  await page
    .waitForFunction(
      () => {
        const m = (window as unknown as { __psMap?: { isMoving(): boolean; areTilesLoaded(): boolean } })
          .__psMap;
        return !!m && !m.isMoving() && m.areTilesLoaded();
      },
      undefined,
      { timeout: 20_000 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(1200);
};

/** What the map shows of the viewport, and what covers the rest (each covering element's own class, by share). */
interface Coverage {
  map: number;
  covers: Record<string, number>;
}

async function coverage(page: Page): Promise<Coverage> {
  return page.evaluate(() => {
    const W = window.innerWidth,
      H = window.innerHeight,
      STEP = 10;
    // The outermost element under the explorer or the map (the sheet, the toolbar, a popup), named by its first class.
    const ownerOf = (el: Element): string => {
      let e: Element = el;
      while (
        e.parentElement &&
        !e.parentElement.matches(".maplibregl-map, .explore, body, .app-frame, .explore-map")
      )
        e = e.parentElement;
      return (typeof e.className === "string" && e.className.split(" ")[0]) || e.tagName.toLowerCase();
    };
    let n = 0,
      map = 0;
    const covers: Record<string, number> = {};
    for (let y = STEP / 2; y < H; y += STEP)
      for (let x = STEP / 2; x < W; x += STEP) {
        n++;
        const el = document.elementFromPoint(x, y);
        if (el && (el.classList.contains("maplibregl-canvas") || el.closest(".maplibregl-marker"))) {
          map++;
          continue;
        }
        const k = el ? ownerOf(el) : "none";
        covers[k] = (covers[k] ?? 0) + 1;
      }
    const share = (c: number) => Math.round((c / n) * 1000) / 10;
    return {
      map: share(map),
      covers: Object.fromEntries(
        Object.entries(covers)
          .sort((a, b) => b[1] - a[1])
          .map(([k, c]) => [k, share(c)]),
      ),
    };
  });
}

/**
 * A point inside the open parcel, in the page's pixels: where a tap lands on the parcel (and its soil unit). The map is
 * centred on it first, so it's in the part the sheet leaves showing. (The vertices' average isn't always inside: the
 * first run's tap landed on the neighbour, 36-7, and switched to it.)
 */
async function parcelMiddle(page: Page): Promise<{ x: number; y: number }> {
  const [lon, lat] = pointOnFeature(loadFixture(MACKS).input.polygon).geometry.coordinates as [
    number,
    number,
  ];
  const xy = await page.evaluate(
    ([lng, la]) => {
      const m = (
        window as unknown as {
          __psMap: {
            jumpTo(o: { center: [number, number] }): void;
            project(ll: [number, number]): { x: number; y: number };
          };
        }
      ).__psMap;
      m.jumpTo({ center: [lng, la] });
      return m.project([lng, la]);
    },
    [lon, lat] as [number, number],
  );
  const box = (await page.locator(".maplibregl-canvas").boundingBox())!;
  return { x: box.x + xy.x, y: box.y + xy.y };
}

const results: Record<string, Coverage> = {};
const record = async (page: Page, name: string) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  results[name] = await coverage(page);
  console.log(`${name}: ${results[name].map}% map; covered by ${JSON.stringify(results[name].covers)}`);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/coverage.json`, JSON.stringify(results, null, 2) + "\n");
};

/** Imports Macks, opens it from Your list and grades it here (its overlays and shading are the live session's). */
async function gradeMacks(page: Page): Promise<void> {
  await replayHar(page.context(), [MACKS]);
  await liveImagery(page);
  // A fresh session's sheet: the line (map-room plan §1).
  await openExplorer(page, MACKS, {}, { sheet: "line" });
  await importParcels(page, [MACKS]);
  await seedScreens(page, [MACKS], { current: true });
  await settled(page);
  await visit(page, "/library");
  await openFromList(page, loadFixture(MACKS).input.name);
  const tilt = page.locator(".tilt-hint button");
  if (await tilt.count()) await tilt.first().click();
  await screenIt(page).catch(() => undefined);
  await settle(page);
}

// 390 × 844 is Zach's phone, the measurement's size; 375 × 812 the hand-back's narrow phone (CLAUDE.md).
for (const [w, h] of [
  [390, 844],
  [375, 812],
] as const) {
  const at = (name: string) => (w === 390 ? `phone-${name}` : `phone${w}-${name}`);
  test.describe(`phone, ${w} × ${h}`, () => {
    test.use({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });

    test("the map's share with a graded parcel open", async ({ page }) => {
      test.setTimeout(600_000);
      await gradeMacks(page);
      const hint = page.getByText("Swipe down to hide controls.");
      await expect(hint).toHaveCount(0, { timeout: 10_000 });

      // 1. Right after the grade, as the app leaves it.
      await record(page, at("after-grading"));

      // 2. As Zach's screenshot had it: the House shading on, and a tap on the parcel (its soil unit's tip). Measured
      //    6 s later, so a tip that closes itself has had its time.
      const surface = page.locator(".surface-btn");
      for (
        let i = 0;
        i < 5 && (await surface.count()) && (await surface.getAttribute("data-mode")) !== "house";
        i++
      )
        await surface.click();
      const mid = await parcelMiddle(page);
      await settle(page);
      await page.touchscreen.tap(mid.x, mid.y);
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT}/${at("tip-open")}.png` });
      await page.waitForTimeout(5200);
      await record(page, at("shading-and-tip"));

      // 3. The Key open, with the House legend folded into it.
      await page.getByRole("button", { name: "Show the map's key" }).tap();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/${at("key-open")}.png` });
      await page.getByRole("button", { name: "Hide", exact: true }).tap();

      // 4. Full-map mode (map-room plan §5; Zach's option A): a swipe down on the sheet's line.
      const line = (await page.locator(".sheet-line").boundingBox())!;
      const x = line.x + line.width * 0.3,
        y = line.y + line.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y + 60, { steps: 6 });
      await page.mouse.up();
      const restore = page.getByRole("button", { name: "Show the map's controls" });
      await expect(restore).toBeVisible();
      await page.waitForTimeout(800);
      await record(page, at("full-map"));
      await restore.tap();

      // 5. The one-time hint over the line (Zach, #427), as a device sees it the first time.
      await page.evaluate(() => localStorage.removeItem("ps.fullMapHint"));
      await page.reload();
      await expect(hint).toBeVisible({ timeout: 30_000 });
      await settle(page);
      await page.screenshot({ path: `${OUT}/${at("first-hint")}.png` });

      expect(results[at("after-grading")]!.map).toBeGreaterThan(0);
    });
  });
}

test.describe("desktop, 1280 × 800", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("a graded parcel open", async ({ page }) => {
    test.setTimeout(600_000);
    await gradeMacks(page);
    await page.screenshot({ path: `${OUT}/desktop-after-grading.png` });
    // The desktop's way into full-map mode: Hide controls, beside the Key chip (Zach, #427).
    await page.getByRole("button", { name: "Hide the map's controls" }).click();
    await expect(page.getByRole("button", { name: "Show the map's controls" })).toBeVisible();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/desktop-full-map.png` });
  });
});
