/**
 * UX part 2 PR 6 (the audit's P-9), desktop (1280 × 800) then phone (375 × 812): a track drawn on Ferney after a
 * grade, the toolbar while drawing, and at Finish "Use it as the driveway?" with the line's figures. Run by
 * `pnpm screenshots`.
 */
import { centroid } from "@turf/turf";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { loadFixture } from "../test/support/fixtures";
import { importParcel, openExplorer, screenIt } from "../e2e/flow";
import { replayHar } from "../e2e/replay";

const FERNEY = "ferney-creek-52-47A" as const;
const OUT = "test-results/screenshots";
type DebugWindow = Window & { __psMap?: { project(ll: [number, number]): { x: number; y: number } } };

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(device, () => {
    test.use(
      phone
        ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );
    const shot = (page: Page, name: string) =>
      page.screenshot({ path: `${OUT}/${device}-drawing-${name}.png` });

    test("a track, and Use it as the driveway?", async ({ page, context }) => {
      test.setTimeout(240_000);
      await replayHar(context, [FERNEY]);
      await openExplorer(page, FERNEY);
      await importParcel(page, FERNEY);
      await screenIt(page);
      await page.locator(".toolbar").getByRole("button", { name: "+ Mark", exact: true }).click();
      await page
        .getByRole("dialog", { name: "Mark on the parcel" })
        .getByRole("group", { name: "Ways in" })
        .getByRole("button", { name: "Track" })
        .click();
      const [lon, lat] = centroid(loadFixture(FERNEY).input.polygon).geometry.coordinates as [number, number];
      const box = (await page.locator(".maplibregl-canvas").boundingBox())!;
      for (const d of [-0.0004, 0, 0.0004]) {
        const p = await page.evaluate(([x, y]) => (window as DebugWindow).__psMap!.project([x, y]), [
          lon + d,
          lat + d / 2,
        ] as const);
        await page.mouse.click(box.x + p.x, box.y + p.y);
      }
      await shot(page, "1-drawing");
      await page.getByRole("button", { name: "Finish", exact: true }).click();
      await expect(page.locator(".finish-head")).toContainText("avg", { timeout: 30_000 });
      await shot(page, "2-finish");
    });
  });
}
