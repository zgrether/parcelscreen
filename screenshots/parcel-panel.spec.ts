/**
 * Step 8b's screenshots (plan §10), desktop (1280 × 800) then phone (375 × 812): the parcel panel on Grade with its
 * switch; Details (listing, notes, lines and marks, boundary); the red-gate line opened and being edited in its row;
 * Map layers; the phone's sheet. Mud Creek with its red-gate easement and a spring, a kept screen seeded.
 */
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import roads from "../test/tools/driveway-validation.roads.json";
import { expectedOf } from "../test/support/expected";
import { importParcel, openExplorer, reload, seedScreens } from "../e2e/flow";
import { replayHar } from "../e2e/replay";

const GRAYSON = "grayson-mud-creek-6273" as const;
const OUT = "test-results/screenshots";

/** The state aerial and the terrain tiles, live (the replay aborts tiles). Registered last. */
async function liveImagery(context: BrowserContext): Promise<void> {
  await context.route(
    /VBMP_Imagery|Orthoimagery_Latest|basemap\.nationalmap\.gov|elevation-tiles-prod/,
    (r) => r.continue(),
  );
}

async function withMarks(page: Page): Promise<void> {
  const line = (roads.c.coordinates as [number, number][]).map(([lon, lat]): [number, number] => [lat, lon]);
  const spring = expectedOf(GRAYSON, "run").sites![1]!.ll;
  await page.evaluate(
    async ({ line, spring }) => {
      const s = JSON.parse(window.__psKv!.getItem("ps.parcels")!) as {
        open: { key: string; markup: unknown[]; notes: string };
        built: { key: string; markup: unknown[]; notes: string }[];
      };
      const markup = [
        {
          id: "red-gate",
          name: "Red gate",
          shape: "line",
          kind: "easement",
          condition: "uncleared",
          line,
          widthFt: 30,
          note: "The listing's road right of way into the property; unverified.",
          recordedIn: "",
          at: "2026-10-15T12:00:00.000Z",
        },
        {
          id: "spring",
          name: "Spring 1",
          shape: "point",
          kind: "spring",
          ll: spring,
          note: "Seen on the walk, below the bench.",
          septicClass: null,
          at: "2026-10-15T12:00:00.000Z",
        },
      ];
      // The open copy takes the saved one's seeded screen too (seedScreens writes the saved copy only).
      const b = s.built.find((x) => x.key === s.open.key)!;
      b.markup = markup;
      s.open = { ...b };
      await window.__psKv!.setItem("ps.parcels", JSON.stringify(s));
    },
    { line, spring },
  );
  await reload(page);
}

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(device, () => {
    const viewport = phone ? { width: 375, height: 812 } : { width: 1280, height: 800 };
    const newPage = async (browser: Browser) => {
      const context = await browser.newContext(
        phone ? { viewport, isMobile: true, hasTouch: true } : { viewport },
      );
      await replayHar(context, GRAYSON);
      await liveImagery(context);
      return context.newPage();
    };
    const shot = (page: Page, name: string) =>
      page.screenshot({ path: `${OUT}/${device}-parcel-panel-${name}.png` });

    test("the parcel panel: Grade, Details, a line edited in its row, Map layers", async ({ browser }) => {
      test.setTimeout(240_000);
      const page = await newPage(browser);
      await openExplorer(page, GRAYSON);
      await importParcel(page, GRAYSON);
      await seedScreens(page, [GRAYSON]);
      await withMarks(page);
      const tip = page.locator(".tilt-hint").getByRole("button", { name: "Dismiss" });
      if (await tip.isVisible()) await tip.click();
      await page.waitForTimeout(1500);
      if (phone) await page.locator(".sheet-handle").tap();
      await expect(page.getByRole("tab", { name: "Grade" })).toHaveAttribute("aria-selected", "true");
      await expect(page.locator(".card").first()).toBeVisible();
      await shot(page, "1-grade");

      // Details from the switch.
      await page.getByRole("tab", { name: "Details" }).click();
      await expect(page.locator(".parcel-details")).toBeVisible();
      await shot(page, "2-details");

      // The red gate's row, opened and being edited.
      const row = page.locator(".pd-row").filter({ hasText: "Red gate" });
      await row.click();
      const open = page.locator(".pd-open");
      await open
        .getByRole("group", { name: "Its condition" })
        .getByRole("button", { name: "Pioneer" })
        .click();
      await open.getByLabel("Name").fill("Red gate road");
      await row.scrollIntoViewIfNeeded();
      await shot(page, "3-line-open");

      // Map layers.
      await open.getByLabel("Name").press("Enter");
      if (phone) await page.getByRole("tab", { name: "Grade" }).click();
      await page.getByRole("button", { name: "Map layers" }).click();
      await expect(page.getByRole("region", { name: "Map layers" })).toBeVisible();
      await shot(page, "4-map-layers");
    });
  });
}
