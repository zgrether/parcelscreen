/**
 * The grade note's screenshots (step 8b, owner on #228), desktop (1280 × 800) then phone (375 × 812): Mud Creek graded,
 * a septic permit marked from Details, the note under the header; then Grade after a tap, the Septic row marked.
 */
import type { BrowserContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { expectedOf } from "../test/support/expected";
import { defaultNamedRubric } from "@/lib/rubric/default";
import { reportCard } from "@/lib/report/card";
import { importParcel, openExplorer, screenIt } from "../e2e/flow";
import { replayHar } from "../e2e/replay";

const GRAYSON = "grayson-mud-creek-6273" as const;
const OUT = "test-results/screenshots";

type DebugWindow = Window & { __psMap?: { project(ll: [number, number]): { x: number; y: number } } };

async function onMap(page: Page, [lat, lon]: [number, number]): Promise<{ x: number; y: number }> {
  const box = (await page.locator(".maplibregl-canvas").boundingBox())!;
  const p = await page.evaluate(([x, y]) => (window as DebugWindow).__psMap!.project([x, y]), [
    lon,
    lat,
  ] as const);
  return { x: box.x + p.x, y: box.y + p.y };
}

/** The state aerial and the terrain tiles, live (the replay aborts tiles). Registered last. */
async function liveImagery(context: BrowserContext): Promise<void> {
  await context.route(
    /VBMP_Imagery|Orthoimagery_Latest|basemap\.nationalmap\.gov|elevation-tiles-prod/,
    (r) => r.continue(),
  );
}

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(device, () => {
    test.use(
      phone
        ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );
    const shot = (page: Page, name: string) =>
      page.screenshot({ path: `${OUT}/${device}-grade-note-${name}.png` });

    test("a septic permit from Details: the note, then Grade at its row", async ({ page, context }) => {
      test.setTimeout(240_000);
      await replayHar(context, GRAYSON);
      await liveImagery(context);
      await openExplorer(page, GRAYSON);
      await importParcel(page, GRAYSON);
      await screenIt(page);
      const tip = page.locator(".tilt-hint").getByRole("button", { name: "Dismiss" });
      if (await tip.isVisible()) await tip.click();

      await page.getByRole("tab", { name: "Details" }).click();
      await page.locator(".parcel-details").getByRole("button", { name: "+ Mark" }).click();
      await page
        .getByRole("dialog", { name: "Mark on the parcel" })
        .getByRole("group", { name: "Water & utilities" })
        .getByRole("button", { name: "Septic permit", exact: true })
        .click();
      const result = expectedOf(GRAYSON, "run");
      const site = result.sites![reportCard(result, defaultNamedRubric()).at]!.ll;
      const p = await onMap(page, site);
      await page.mouse.click(p.x, p.y);
      await page.getByRole("button", { name: "Done", exact: true }).click();
      const note = page.locator(".grade-note");
      await expect(note).toHaveText("Septic now passes");
      await page.waitForTimeout(400); // past its fade-in
      await shot(page, "1-in-details");

      await note.click();
      await expect(page.getByRole("tab", { name: "Grade" })).toHaveAttribute("aria-selected", "true");
      await page.waitForTimeout(300);
      await shot(page, "2-on-grade");
    });
  });
}
