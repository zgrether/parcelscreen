/**
 * The UX audit's B-7 at 375 × 812: a graded parcel with its sheet raised (the toolbar and the "Zoom in" hint against
 * the map's buttons), drawing a line (Finish in reach), and the map's pins at the parcel's right edge (Stand here).
 * Run by `pnpm screenshots`.
 */
import { expect, test } from "./fixtures";
import { importParcels, openExplorer, openFromList, seedScreens, settled, visit } from "../e2e/flow";
import { replayHar } from "../e2e/replay";

const OUT = "test-results/screenshots";
const MUD = "grayson-mud-creek-6273" as const;

test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

test("the phone's map: the raised sheet, drawing a line, the pins", async ({ page, context }) => {
  test.setTimeout(180_000);
  await replayHar(context, [MUD]);
  await context.route(/basemap\.nationalmap\.gov|arcgisonline\.com/, (r) => r.continue());
  await openExplorer(page, MUD);
  await importParcels(page, [MUD]);
  await seedScreens(page, [MUD]);
  await settled(page);
  await visit(page, "/library");
  await openFromList(page, "Mud Creek");
  const tilt = page.locator(".tilt-hint button");
  if (await tilt.count()) await tilt.first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/phone-overlaps-peek.png` });

  // The sheet raised: the toolbar and the map's buttons along the top.
  const handle = page.locator("[title='Drag or tap to resize']").first();
  await handle.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/phone-overlaps-raised.png` });
  // Raised again, to its tallest: the toolbar and the map's notes step aside from the map's buttons.
  await handle.click();
  await page.waitForTimeout(600);
  await expect(page.locator(".explore.sheet-tall")).toHaveCount(1);
  await expect(page.locator(".toolbar")).toBeHidden();
  await page.screenshot({ path: `${OUT}/phone-overlaps-tall.png` });
  await handle.click();
  await page.waitForTimeout(600);

  // Drawing a line: the tool's bar, Finish on screen.
  await page.getByRole("tab", { name: "Details" }).click();
  await page.getByRole("button", { name: "Draw a line" }).click();
  await page.waitForTimeout(800);
  const finish = page.getByRole("button", { name: "Finish" });
  await expect(finish).toBeVisible();
  await page.screenshot({ path: `${OUT}/phone-overlaps-draw.png` });
  const box = (await finish.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(375);
});
