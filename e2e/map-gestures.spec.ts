/**
 * Map UX (owner, 2026-10-10): tilting and rotating with the mouse as in Google Earth on the web. A double-click and
 * drag, or a middle-button drag, tilts and rotates; a double-click alone zooms in toward the point. The 3D button
 * eases to 60° and back to flat and north up; the one-time desktop hint goes on first use and stays gone. Tilted,
 * the points' flag layers replace their circles and the DOM pins get the tilted class. On a phone the hint isn't
 * shown and the touch gestures are MapLibre's own, with a double-tap zooming in while no tool is open (UX part 2, Z-1).
 */
import { centroid } from "@turf/turf";
import { expect, test, type Page } from "@playwright/test";
import { loadFixture } from "../test/support/fixtures";
import { importParcel, openExplorer, reload } from "./flow";
import { replayHar } from "./replay";

const SLUG = "ferney-creek-52-47A";
const HINT = "Double-click and drag (or middle-drag) to tilt and rotate.";

type Cam = { pitch: number; bearing: number; zoom: number };
const camera = (page: Page): Promise<Cam> =>
  page.evaluate(() => {
    const m = (
      window as unknown as { __psMap: { getPitch(): number; getBearing(): number; getZoom(): number } }
    ).__psMap;
    return { pitch: m.getPitch(), bearing: m.getBearing(), zoom: m.getZoom() };
  });
/** Waits until the map exists and has stopped moving (the style may still be loading at first). */
const settle = (page: Page) =>
  page.waitForFunction(() => {
    const m = (window as unknown as { __psMap?: { isMoving(): boolean; isStyleLoaded(): boolean } }).__psMap;
    return !!m && !m.isMoving();
  });

/** Ferney's centre, in page pixels. */
async function ferneyCentre(page: Page): Promise<{ x: number; y: number }> {
  const [lon, lat] = centroid(loadFixture(SLUG).input.polygon).geometry.coordinates as [number, number];
  const box = (await page.locator(".maplibregl-canvas").boundingBox())!;
  const p = await page.evaluate(
    ([x, y]) =>
      (
        window as unknown as { __psMap: { project(ll: [number, number]): { x: number; y: number } } }
      ).__psMap.project([x, y]),
    [lon, lat] as const,
  );
  return { x: box.x + p.x, y: box.y + p.y };
}

/** Two taps on Ferney's centre, then the map settled. */
async function doubleTapAt(page: Page): Promise<void> {
  const p = await ferneyCentre(page);
  await page.touchscreen.tap(p.x, p.y);
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForTimeout(600);
  await settle(page);
}

/** The map canvas's centre, in page pixels. */
async function centre(page: Page): Promise<{ x: number; y: number }> {
  const box = (await page.locator(".maplibregl-canvas").boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe("desktop", () => {
  test("double-click and drag tilts and rotates; a double-click alone zooms in; middle-drag too", async ({
    page,
    context,
  }) => {
    await replayHar(context, SLUG);
    await openExplorer(page, SLUG);
    await expect(page.locator(".tilt-hint")).toContainText(HINT);
    await settle(page);
    const c = await centre(page);
    const before = await camera(page);
    expect(before.pitch).toBe(0);

    // A single click reaches the map once the double-click window has passed; a double-click alone never does
    // (so it can't select a parcel and fly to it), and zooms one level closer, tilt unchanged.
    await page.evaluate(() => {
      const w = window as unknown as { __psMap: { on(t: string, f: () => void): void }; __clicks: number };
      w.__clicks = 0;
      w.__psMap.on("click", () => (w.__clicks += 1));
    });
    const clicks = () => page.evaluate(() => (window as unknown as { __clicks: number }).__clicks);
    await page.mouse.click(c.x + 100, c.y + 100);
    expect(await clicks()).toBe(0); // held back…
    await page.waitForTimeout(600);
    expect(await clicks()).toBe(1); // …then delivered
    await page.waitForTimeout(600);
    await page.mouse.dblclick(c.x, c.y);
    await settle(page);
    await page.waitForTimeout(600);
    expect(await clicks()).toBe(1);
    const zoomed = await camera(page);
    expect(zoomed.zoom).toBeCloseTo(before.zoom + 1, 1);
    expect(zoomed.pitch).toBe(0);

    // Double-click and drag up and right: tilts and turns around the point pressed, which stays put on screen.
    const anchor = await page.evaluate(
      ({ x, y }) => {
        const m = (
          window as unknown as { __psMap: { unproject(p: [number, number]): { lng: number; lat: number } } }
        ).__psMap;
        const box = document.querySelector(".maplibregl-canvas")!.getBoundingClientRect();
        const ll = m.unproject([x - box.left, y - box.top]);
        return [ll.lng, ll.lat] as [number, number];
      },
      { x: c.x - 80, y: c.y + 60 },
    );
    await page.mouse.click(c.x - 80, c.y + 60);
    await page.mouse.down();
    await expect(page.locator(".tilt-anchor")).toHaveCount(1);
    await page.mouse.move(c.x - 50, c.y + 20, { steps: 8 });
    await page.mouse.move(c.x - 20, c.y - 20, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator(".tilt-anchor")).toHaveCount(0);
    const stays = await page.evaluate(
      ({ ll }) => {
        const m = (
          window as unknown as { __psMap: { project(p: [number, number]): { x: number; y: number } } }
        ).__psMap;
        const box = document.querySelector(".maplibregl-canvas")!.getBoundingClientRect();
        const p = m.project(ll);
        return { x: p.x + box.left, y: p.y + box.top };
      },
      { ll: anchor },
    );
    expect(Math.abs(stays.x - (c.x - 80))).toBeLessThan(2);
    expect(Math.abs(stays.y - (c.y + 60))).toBeLessThan(2);
    const turned = await camera(page);
    expect(turned.pitch).toBeGreaterThan(30);
    expect(Math.abs(turned.bearing)).toBeGreaterThan(20);
    expect(turned.zoom).toBeCloseTo(zoomed.zoom, 5); // a drag doesn't zoom
    // The hint went with the first tilt, and stays gone.
    await expect(page.locator(".tilt-hint")).toHaveCount(0);

    // A middle-button drag down flattens again.
    await page.mouse.move(c.x, c.y);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(c.x, c.y + 200, { steps: 10 });
    await page.mouse.up({ button: "middle" });
    expect((await camera(page)).pitch).toBe(0);

    await reload(page);
    await settle(page);
    await expect(page.locator(".tilt-hint")).toHaveCount(0);
  });

  test("the 3D button tilts to 60° and back to flat, north up; tilted, the points stand up as flags", async ({
    page,
    context,
  }) => {
    await replayHar(context, SLUG);
    await openExplorer(page, SLUG);
    await settle(page);
    const button = page.getByRole("button", { name: "Tilt the map to 3D" });
    await button.click();
    await settle(page);
    expect((await camera(page)).pitch).toBeCloseTo(60, 0);
    const tilted = await page.evaluate(() => {
      const m = (
        window as unknown as {
          __psMap: { getLayoutProperty(id: string, p: string): unknown; getContainer(): HTMLElement };
        }
      ).__psMap;
      return {
        flags: m.getLayoutProperty("trailhead-flags", "visibility"),
        circles: m.getLayoutProperty("trailheads", "visibility"),
        cls: m.getContainer().classList.contains("map-tilted"),
      };
    });
    expect(tilted).toEqual({ flags: "visible", circles: "none", cls: true });
    // The button turned the 3D terrain on (it was off)…
    const terrainOn = () =>
      page.evaluate(() => JSON.parse(localStorage.getItem("ps.terrain") ?? "{}").on === true);
    expect(await terrainOn()).toBe(true);

    await page.getByRole("button", { name: "Back to flat, north up" }).click();
    await settle(page);
    const flat = await camera(page);
    expect([flat.pitch, flat.bearing]).toEqual([0, 0]);
    // …and back to 2D turns it off again.
    expect(await terrainOn()).toBe(false);
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("no hint; the 3D button still works", async ({ page, context }) => {
    await replayHar(context, SLUG);
    await openExplorer(page, SLUG);
    await settle(page);
    await expect(page.locator(".tilt-hint")).toHaveCount(0);
    await page.getByRole("button", { name: "Tilt the map to 3D" }).tap();
    await settle(page);
    expect((await camera(page)).pitch).toBeCloseTo(60, 0);
  });

  test("a tap reaches the map at once: no double-click wait on touch", async ({ page, context }) => {
    await replayHar(context, SLUG);
    await openExplorer(page, SLUG);
    await settle(page);
    // Timed in the page, from the touch's pointerdown to the map's click (the mouse's hold-back is 400 ms).
    await page.evaluate(() => {
      const w = window as unknown as {
        __psMap: { on(t: string, f: () => void): void };
        __down: number;
        __clickAt: number[];
        __touch: boolean;
      };
      w.__clickAt = [];
      window.addEventListener(
        "pointerdown",
        (e) => {
          w.__down = performance.now();
          w.__touch = e.pointerType === "touch";
        },
        true,
      );
      w.__psMap.on("click", () => w.__clickAt.push(performance.now() - w.__down));
    });
    const c = await centre(page);
    await page.touchscreen.tap(c.x + 40, c.y + 40);
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => {
      const w = window as unknown as { __clickAt: number[]; __touch: boolean };
      return { at: w.__clickAt, touch: w.__touch };
    });
    expect(r.touch).toBe(true);
    expect(r.at).toHaveLength(1);
    expect(r.at[0]).toBeLessThan(150);
  });
  test("a double-tap zooms in one level while no tool is open; with a tool open it doesn't (Z-1)", async ({
    page,
    context,
  }) => {
    await replayHar(context, SLUG);
    await openExplorer(page, SLUG);
    await importParcel(page, SLUG);
    await settle(page);
    // Inside the open parcel, where a tap does nothing else.
    const doubleTap = () => doubleTapAt(page);

    const before = await camera(page);
    await doubleTap();
    expect((await camera(page)).zoom).toBeCloseTo(before.zoom + 1, 1);

    // + Mark → Track: the taps are the line's corners, and the map stays where it is.
    await page.locator(".toolbar").getByRole("button", { name: "+ Mark", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Mark on the parcel" })
      .getByRole("group", { name: "Ways in" })
      .getByRole("button", { name: "Track" })
      .click();
    await expect(page.locator(".toolbar")).toHaveAttribute("data-mode", "track");
    // Starting a line may bring the parcel into view first (P-9): read the camera once that's done.
    await page.waitForTimeout(600);
    await settle(page);
    const drawing = await camera(page);
    await doubleTap();
    expect((await camera(page)).zoom).toBeCloseTo(drawing.zoom, 2);
    await expect(page.locator(".toolbar")).toHaveAttribute("data-mode", "track");
  });
  test("a single tap on a parcel opens it at once; a double-tap on one zooms in and leaves it closed (Zach, after #333)", async ({
    page,
    context,
  }) => {
    await replayHar(context, SLUG);
    await openExplorer(page, SLUG);
    await importParcel(page, SLUG);
    const close = page.getByRole("button", { name: "Close this parcel" });
    // Closed, Ferney stays on Your list: its outline on the map opens it with a tap.
    await close.first().click();
    await expect(close).toHaveCount(0);
    await settle(page);

    // One tap: open at once (a touch tap isn't held back for a second one).
    let p = await ferneyCentre(page);
    await page.touchscreen.tap(p.x, p.y);
    await expect(close.first()).toBeVisible({ timeout: 1000 });
    await close.first().click();
    await expect(close).toHaveCount(0);
    await page.waitForTimeout(600);
    await settle(page);

    // Two: the first tap's open is taken back, and the map zooms in a level instead.
    const before = await camera(page);
    await doubleTapAt(page);
    expect((await camera(page)).zoom).toBeCloseTo(before.zoom + 1, 1);
    await expect(close).toHaveCount(0);

    // A parcel that was open before stays open: a double-tap inside it only zooms.
    p = await ferneyCentre(page);
    await page.touchscreen.tap(p.x, p.y);
    await expect(close.first()).toBeVisible();
    await page.waitForTimeout(600);
    await settle(page);
    const open = await camera(page);
    await doubleTapAt(page);
    expect((await camera(page)).zoom).toBeCloseTo(open.zoom + 1, 1);
    await expect(close.first()).toBeVisible();
  });
});
