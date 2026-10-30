/**
 * The grade panel's polish (8b's review, owner 2026-10-20), desktop (1280 × 800) then phone (375 × 667): Ferney graded,
 * its answer and Best homesite (Site #N flies to its pin; "Other sites", each with its place in the order); its Must
 * rows (Legal road access's warning on its own line); a line drawn after the run (one banner, under the answer). The
 * named setting is map-layout.spec.ts's "7-reason". Run by `pnpm screenshots`.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { centroid } from "@turf/turf";
import { loadFixture } from "../test/support/fixtures";
import { importParcel, openExplorer, screenIt } from "../e2e/flow";
import { replayHar } from "../e2e/replay";

const FERNEY = "ferney-creek-52-47A" as const;
const OUT = "test-results/screenshots";

type DebugWindow = Window & { __psMap?: { project(ll: [number, number]): { x: number; y: number } } };

/** A point `dLat`, `dLon` degrees from Ferney's centre, in page pixels. */
async function at(page: Page, dLat: number, dLon: number): Promise<{ x: number; y: number }> {
  const [lon, lat] = centroid(loadFixture(FERNEY).input.polygon).geometry.coordinates as [number, number];
  const box = (await page.locator(".maplibregl-canvas").boundingBox())!;
  const p = await page.evaluate(([x, y]) => (window as DebugWindow).__psMap!.project([x, y]), [
    lon + dLon,
    lat + dLat,
  ] as const);
  return { x: box.x + p.x, y: box.y + p.y };
}

/** Draws a short track across Ferney's middle, as e2e/lines.spec.ts does. */
async function drawTrack(page: Page): Promise<void> {
  await page.locator(".toolbar").getByRole("button", { name: "+ Mark", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Mark on the parcel" })
    .getByRole("group", { name: "Ways in" })
    .getByRole("button", { name: "Track" })
    .click();
  await expect(page.locator(".toolbar")).toHaveAttribute("data-mode", "track");
  for (const d of [-0.0004, 0, 0.0004]) {
    const p = await at(page, d / 2, d);
    await page.mouse.click(p.x, p.y);
  }
  await page.getByRole("button", { name: "Finish", exact: true }).click();
}

/** The phone's sheet, raised until it holds most of the screen. */
async function raiseSheet(page: Page): Promise<void> {
  const sheet = page.locator(".explore-panel");
  for (let i = 0; i < 4; i++) {
    if ((await sheet.boundingBox())!.height > 500) return;
    await page.locator(".sheet-handle").tap();
    await page.waitForTimeout(500);
  }
}

/** Brings an element of the panel to its top. */
const toTop = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => el.scrollIntoView({ block: "start" }));

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(device, () => {
    test.use(
      phone
        ? { viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );
    const shot = (page: Page, name: string) =>
      page.screenshot({ path: `${OUT}/${device}-grade-${name}.png` });

    test("the grade panel: the answer, Best homesite, the Musts, one banner, the named setting", async ({
      page,
      context,
    }) => {
      test.setTimeout(240_000);
      await replayHar(context, [FERNEY]);
      await openExplorer(page, FERNEY);
      await importParcel(page, FERNEY);
      await screenIt(page);
      await page.waitForTimeout(1500);

      // A line drawn after the run: the banner (drawn while the map shows, before the sheet is raised).
      await drawTrack(page);
      await expect(page.locator(".grade-btn")).toHaveText("Grade again: lines changed");
      if (phone) await raiseSheet(page);
      await toTop(page, ".card");
      await page.waitForTimeout(500);
      await shot(page, "1-answer-banner");

      await toTop(page, ".best-site");
      await page.waitForTimeout(300);
      await shot(page, "2-best-homesite");

      await toTop(page, ".must-row");
      await page.waitForTimeout(300);
      await shot(page, "3-musts");
    });
  });
}
