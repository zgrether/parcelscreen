/**
 * A tap where there's no parcel record (owner's bug report, 2026-10-11: Whitetop, VA, along Helton Creek Ln). VGIN
 * answers there with its placeholder for a county's unparceled land, PARCELID "0" (Grayson's: 61 parts, 14,126
 * vertices). It used to be drawn as an outline; a tap selected it, and joining its parts froze the page. Now it's
 * dropped, and an empty tap says so. The parcel service is mocked here.
 */
import { expect, test, type BrowserContext } from "@playwright/test";
import { loadFixture } from "../test/support/fixtures";
import { openExplorer } from "./flow";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A";
const NO_RECORD = "No parcel record here. Draw a custom parcel?";

/** VGIN's parcel layer, answering every query (outline tiles and point lookups) with these features only. */
async function vginAnswers(context: BrowserContext, features: unknown[]): Promise<{ asked: () => number }> {
  let n = 0;
  await context.route(/vginmaps\.vdem\.virginia\.gov\/.*VA_Parcels\/FeatureServer\/0\/query/, (route) => {
    n++;
    return route.fulfill({
      json: { type: "FeatureCollection", features },
      headers: { "access-control-allow-origin": "*" },
    });
  });
  return { asked: () => n };
}

/** A placeholder like VGIN's: PARCELID "0", several parts, one of them around the point. */
function placeholderAround(lat: number, lon: number) {
  const box = (dx: number) => [
    [
      [lon + dx - 0.004, lat - 0.003],
      [lon + dx + 0.004, lat - 0.003],
      [lon + dx + 0.004, lat + 0.003],
      [lon + dx - 0.004, lat + 0.003],
      [lon + dx - 0.004, lat - 0.003],
    ],
  ];
  return {
    type: "Feature",
    properties: { OBJECTID: 1, PARCELID: "0", FIPS: "51063" },
    geometry: { type: "MultiPolygon", coordinates: [box(0), box(0.01), box(-0.01)] },
  };
}

async function tapMapCentre(page: import("@playwright/test").Page): Promise<void> {
  const box = (await page.locator(".maplibregl-canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

let errors: string[] = [];
test.beforeEach(({ page }) => {
  errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
});

test("a tap on unparceled land (VGIN's PARCELID \"0\" placeholder) says there's no record, and the page stays responsive", async ({
  page,
  context,
}) => {
  await replayHar(context, FERNEY);
  const { point } = loadFixture(FERNEY).input;
  const vgin = await vginAnswers(context, [placeholderAround(point.lat, point.lon)]);
  await openExplorer(page, FERNEY);
  await expect.poll(vgin.asked, { timeout: 30_000 }).toBeGreaterThan(0); // the outline tiles came in
  await page.waitForTimeout(1500);
  // Not drawn: no parcel line at all in this view.
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __psMap: { queryRenderedFeatures(): { layer: { id: string } }[] } }).__psMap
          .queryRenderedFeatures()
          .filter((f) => /parcel-lines/.test(f.layer.id)).length,
    ),
  ).toBe(0);

  await tapMapCentre(page);
  await expect(page.getByText(NO_RECORD)).toBeVisible({ timeout: 5000 });
  // Responsive (it froze before), and nothing opened.
  expect(await page.evaluate(() => 1 + 1)).toBe(2);
  await expect(page.locator(".sh-name")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a tap where the service has no feature at all says the same", async ({ page, context }) => {
  await replayHar(context, FERNEY);
  const vgin = await vginAnswers(context, []);
  await openExplorer(page, FERNEY);
  await expect.poll(vgin.asked, { timeout: 30_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  await tapMapCentre(page);
  await expect(page.getByText(NO_RECORD)).toBeVisible({ timeout: 5000 });
  await expect(page.locator(".sh-name")).toHaveCount(0);
  expect(errors).toEqual([]);
});
